'use strict';

// GET /api/saas/subscription/status  — caller's subscriptions grouped by product
// GET /api/saas/outreach/status      — outreach-specific status + usage
//
// Auth: Bearer JWT.  Both endpoints scope to auth.uid() — a member can only
// see their own subscription data.

const { createClient } = require('@supabase/supabase-js');
const { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(event, supabase) {
  const auth = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!auth.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  return error || !data?.user ? null : data.user;
}

// Monthly lead limits by plan (mirrors members.html copy)
const OUTREACH_LIMITS = { starter: 500, pro: 5000, business: -1 };

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/saas-member\/?/, '')
    .replace(/^\/api\/saas\/?/, '')
    .replace(/^\/+|\/+$/, '');
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } };
  }
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const supabase = getServiceClient();
  if (!supabase) return json(500, { error: 'Server configuration error' });

  const user = await authenticate(event, supabase);
  if (!user) return json(401, { error: 'Authentication required' });

  // Feature gate (ships dark for launch). Per scope: this whole SaaS-status
  // surface is dark; users in test_users[] bypass. NOTE: this gate is named
  // 'shop_saas_enabled' but blocks ALL product subscription reads (fleet,
  // outreach, ai_api). Flag widening intentional for launch — see comment in
  // the gating CR. Split if you need per-product later.
  const enabled = await isFeatureEnabledForUser(supabase, 'shop_saas_enabled', user.id);
  if (!enabled) return json(403, { error: 'feature_disabled' });

  const path = parsePath(event);

  // ── GET /api/saas/subscription/status ────────────────────────────────────
  if (path === 'subscription/status') {
    const { data: subs, error } = await supabase
      .from('saas_subscriptions')
      .select('product, plan, status, current_period_start, current_period_end, cancel_at_period_end, trial_end')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false });

    if (error) return json(500, { error: error.message });

    // One row per product — last active sub wins if there are multiples
    const by_product = {};
    for (const sub of (subs || [])) {
      if (!by_product[sub.product]) by_product[sub.product] = sub;
    }

    return json(200, { by_product });
  }

  // ── GET /api/saas/outreach/status ─────────────────────────────────────────
  if (path === 'outreach/status') {
    const { data: sub } = await supabase
      .from('saas_subscriptions')
      .select('plan, status, current_period_start, current_period_end')
      .eq('user_id', user.id)
      .eq('product', 'outreach')
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) return json(200, { subscribed: false });

    const leadsLimit     = OUTREACH_LIMITS[sub.plan] ?? OUTREACH_LIMITS.starter;
    // outreach_leads has no per-user scoping yet — usage tracking is a future addition
    const leadsThisMonth = 0;
    const pctUsed        = leadsLimit > 0 ? Math.round((leadsThisMonth / leadsLimit) * 100) : 0;

    return json(200, {
      subscribed:          true,
      plan:                sub.plan,
      status:              sub.status,
      current_period_end:  sub.current_period_end,
      limits:              { leads_per_month: leadsLimit },
      current:             { leads_this_month: leadsThisMonth },
      pct_used:            pctUsed,
    });
  }

  return json(404, { error: 'Not found' });
};
