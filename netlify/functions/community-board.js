// GET  /api/community-board — list community posts (most recent first)
// POST /api/community-board — create a new community post
'use strict';
const { createClient } = require('@supabase/supabase-js');
const { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

function supabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  try {
    const sb = supabase();
    const auth = await getUser(event, sb);
    if (auth.error) return auth.error;

    // ── GET: crowd-funded packages open for community contribution ────────
    if (event.httpMethod === 'GET') {
      // Feature gate: when crowdfunding is dark, return an empty board rather
      // than 403 so the page renders cleanly with no entries.
      const cfEnabled = await isFeatureEnabledForUser(sb, 'crowdfunding_enabled', auth.user.id);
      if (!cfEnabled) return json(200, { packages: [] });

      const { data: pkgs, error } = await sb
        .from('maintenance_packages')
        .select(`
          id, title, description, category, member_zip, crowd_funded,
          funding_goal_cents, member_id, created_at,
          profiles!maintenance_packages_member_id_fkey(first_name, full_name),
          crowd_fund_contributions(amount_cents)
        `)
        .eq('crowd_funded', true)
        .in('status', ['pending', 'active', 'open'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('community-board GET error:', error.message);
        return json(500, { error: 'Failed to load community board' });
      }

      const packages = (pkgs || []).map(pkg => {
        const contributions = pkg.crowd_fund_contributions || [];
        const raised_cents = contributions.reduce((sum, c) => sum + (c.amount_cents || 0), 0);
        return {
          id:                 pkg.id,
          title:              pkg.title,
          description:        pkg.description || null,
          category:           pkg.category || null,
          member_zip:         pkg.member_zip || null,
          member_id:          pkg.member_id,
          member_first_name:  pkg.profiles?.first_name || null,
          member_name:        pkg.profiles?.full_name || null,
          funding_goal_cents: pkg.funding_goal_cents || null,
          raised_cents,
          contributor_count:  contributions.length,
          created_at:         pkg.created_at,
        };
      });

      return json(200, { packages, count: packages.length });
    }

    // ── POST: create a community post ─────────────────────────────────────
    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch {
        return json(400, { error: 'Invalid JSON' });
      }

      const { title, body: postBody, category } = body;
      if (!title || !title.trim()) {
        return json(400, { error: 'title is required' });
      }

      const { data: post, error } = await sb
        .from('community_posts')
        .insert({
          author_id: auth.user.id,
          title:     title.trim(),
          body:      postBody?.trim() || null,
          category:  category || null,
        })
        .select('id, title, body, category, created_at, author_id')
        .single();

      if (error) {
        console.error('community-board POST error:', error.message);
        return json(500, { error: 'Failed to create post' });
      }

      return json(201, { success: true, post });
    }

    return json(405, { error: 'Method not allowed' });

  } catch (err) {
    console.error('community-board unhandled error:', err.message);
    return json(500, { error: 'Internal server error' });
  }
};
