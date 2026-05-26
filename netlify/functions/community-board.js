// GET  /api/community-board — list community posts (most recent first)
// POST /api/community-board — create a new community post
'use strict';
const { createClient } = require('@supabase/supabase-js');

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

    // ── GET: list community posts ─────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const { data: posts, error } = await sb
        .from('community_posts')
        .select('id, title, body, category, created_at, author_id, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('community-board GET error:', error.message);
        return json(500, { error: 'Failed to load community posts' });
      }

      const enriched = (posts || []).map(p => ({
        id:          p.id,
        title:       p.title,
        body:        p.body || '',
        category:    p.category || null,
        created_at:  p.created_at,
        author_id:   p.author_id,
        author_name: p.profiles?.full_name || 'A member',
      }));

      return json(200, { posts: enriched, count: enriched.length });
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
