// ============================================================================
// member-founder-api — member founder earnings dashboard API
//
// Routes (all require Bearer JWT):
//   GET /api/member-founder/me        — founder profile + summary stats
//   GET /api/member-founder/commissions — paginated commission history
//
// Auth: Supabase JWT via Authorization: Bearer <token>
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

function sb() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function json(code, body) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}

async function getUser(event, supabase) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data: { user }, error } = await supabase.auth.getUser(m[1].trim());
  if (error || !user) return null;
  return user;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const supabase = sb();
  const user = await getUser(event, supabase);
  if (!user) return json(401, { error: 'Unauthorized' });

  const path = (event.path || '').replace(/.*\/member-founder-api\/?/, '').replace(/.*\/member-founder\/?/, '').replace(/^\//, '');

  // ── GET me ────────────────────────────────────────────────────────────────
  if (!path || path === 'me') {
    const { data: profile, error } = await supabase
      .from('member_founder_profiles')
      .select('id, full_name, email, referral_code, founder_type, commission_rate, status, total_provider_referrals, total_member_referrals, total_commissions_earned, total_commissions_paid, pending_balance, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error) return json(500, { error: error.message });
    if (!profile) return json(404, { error: 'Not a founding member' });

    // Count of pending commissions
    const { count: pendingCount } = await supabase
      .from('founder_commissions')
      .select('id', { count: 'exact', head: true })
      .eq('founder_id', profile.id)
      .eq('status', 'pending');

    return json(200, {
      success: true,
      profile: {
        ...profile,
        pending_commission_count: pendingCount || 0,
      }
    });
  }

  // ── GET commissions ───────────────────────────────────────────────────────
  if (path === 'commissions') {
    const params = event.queryStringParameters || {};
    const limit  = Math.min(parseInt(params.limit  || '50',  10), 100);
    const offset = Math.max(parseInt(params.offset || '0',   10), 0);

    const { data: profile } = await supabase
      .from('member_founder_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!profile) return json(404, { error: 'Not a founding member' });

    const { data: commissions, error, count } = await supabase
      .from('founder_commissions')
      .select(`
        id, commission_type, original_amount, commission_rate, commission_amount,
        status, description, created_at, paid_at, source_transaction_id,
        referred_provider_id
      `, { count: 'exact' })
      .eq('founder_id', profile.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return json(500, { error: error.message });

    // Fetch referred provider names in one go
    const providerIds = [...new Set((commissions || []).map(c => c.referred_provider_id).filter(Boolean))];
    let providerNames = {};
    if (providerIds.length) {
      const { data: providers } = await supabase
        .from('profiles')
        .select('id, full_name, business_name, email')
        .in('id', providerIds);
      for (const p of (providers || [])) {
        providerNames[p.id] = p.business_name || p.full_name || p.email || p.id;
      }
    }

    return json(200, {
      success: true,
      commissions: (commissions || []).map(c => ({
        ...c,
        referred_provider_name: providerNames[c.referred_provider_id] || null,
      })),
      total: count || 0,
      limit,
      offset,
    });
  }

  return json(404, { error: 'Unknown route' });
};
