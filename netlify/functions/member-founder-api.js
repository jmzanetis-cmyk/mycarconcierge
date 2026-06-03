// ============================================================================
// member-founder-api — member founder earnings dashboard API
//
// Routes (all require Bearer JWT):
//   GET /api/member-founder/me          — founder profile + balance breakdown
//   GET /api/member-founder/commissions — paginated commission history
//
// Balance breakdown (returned on /me):
//   maturing_count / maturing_amount  — status=pending, inside 7-day window
//   payable_count  / payable_amount   — status=payable, queued for next payout
//   paid_amount_ytd                   — total paid out this calendar year
//
// Per-commission fields (returned on /commissions):
//   becomes_payable_at  — ISO timestamp when this commission clears the window
//                         (pending: created_at+7d; payable: became_payable_at)
//   next_payout_date    — top-level: ISO timestamp of next monthly cron (1st, 14:00 UTC)
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

const MATURATION_DAYS = 7;

function sb() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function json(code, body) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

async function getUser(event, supabase) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data: { user }, error } = await supabase.auth.getUser(m[1].trim());
  if (error || !user) return null;
  return user;
}

// Returns the next 1st-of-month 14:00 UTC from a given Date.
function nextPayoutDate(from) {
  const d = new Date(from);
  // Try the 1st of next month at 14:00 UTC
  const candidate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 14, 0, 0, 0));
  // If we're already past the 1st of the current month at 14:00 UTC, the next
  // payout is the 1st of next month (already computed above). But if we're
  // before that point this month, use this month's 1st.
  const thisMonthFirst = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 14, 0, 0, 0));
  return from < thisMonthFirst ? thisMonthFirst : candidate;
}

// Returns the ISO timestamp a pending commission becomes payable.
function becomesPayableAt(createdAt) {
  const t = new Date(createdAt).getTime() + MATURATION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString();
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const supabase = sb();
  const user = await getUser(event, supabase);
  if (!user) return json(401, { error: 'Unauthorized' });

  const path = (event.path || '')
    .replace(/.*\/member-founder-api\/?/, '')
    .replace(/.*\/member-founder\/?/, '')
    .replace(/^\//, '');

  // ── GET me ────────────────────────────────────────────────────────────────
  if (!path || path === 'me') {
    const { data: profile, error } = await supabase
      .from('member_founder_profiles')
      .select(`
        id, full_name, email, referral_code, founder_type, commission_rate,
        status, total_provider_referrals, total_member_referrals,
        total_commissions_earned, total_commissions_paid, pending_balance, created_at
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error) return json(500, { error: error.message });
    if (!profile) return json(404, { error: 'Not a founding member' });

    // Commission state breakdown
    const { data: commRows } = await supabase
      .from('founder_commissions')
      .select('status, commission_amount')
      .eq('founder_id', profile.id)
      .in('status', ['pending', 'payable']);

    let maturingCount = 0;
    let maturingAmount = 0;
    let payableCount = 0;
    let payableAmount = 0;
    for (const row of (commRows || [])) {
      const amt = parseFloat(row.commission_amount || 0);
      if (row.status === 'pending') {
        maturingCount++;
        maturingAmount += amt;
      } else if (row.status === 'payable') {
        payableCount++;
        payableAmount += amt;
      }
    }

    // Paid-out YTD
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).toISOString();
    const { data: paidRows } = await supabase
      .from('founder_commissions')
      .select('commission_amount')
      .eq('founder_id', profile.id)
      .eq('status', 'paid')
      .gte('paid_at', yearStart);
    const paidAmountYtd = (paidRows || []).reduce((s, r) => s + parseFloat(r.commission_amount || 0), 0);

    const now = new Date();

    return json(200, {
      success: true,
      profile: {
        ...profile,
        balance_breakdown: {
          maturing_count:  maturingCount,
          maturing_amount: Math.round(maturingAmount * 100) / 100,
          payable_count:   payableCount,
          payable_amount:  Math.round(payableAmount * 100) / 100,
          paid_amount_ytd: Math.round(paidAmountYtd * 100) / 100,
        },
        next_payout_date: nextPayoutDate(now).toISOString(),
        maturation_days:  MATURATION_DAYS,
      },
    });
  }

  // ── GET commissions ───────────────────────────────────────────────────────
  if (path === 'commissions') {
    const params = event.queryStringParameters || {};
    const limit  = Math.min(parseInt(params.limit  || '50', 10), 100);
    const offset = Math.max(parseInt(params.offset || '0',  10), 0);

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
        status, description, created_at, paid_at, became_payable_at,
        source_transaction_id, referred_provider_id
      `, { count: 'exact' })
      .eq('founder_id', profile.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return json(500, { error: error.message });

    // Fetch referred provider names in one go
    const providerIds = [...new Set((commissions || [])
      .map(c => c.referred_provider_id).filter(Boolean))];
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

    const now = new Date();

    return json(200, {
      success: true,
      next_payout_date:  nextPayoutDate(now).toISOString(),
      maturation_days:   MATURATION_DAYS,
      commissions: (commissions || []).map(c => {
        // becomes_payable_at: for pending rows derive from created_at; for
        // payable rows use the stored became_payable_at; for all others null.
        let becomes_payable_at = null;
        if (c.status === 'pending') {
          becomes_payable_at = becomesPayableAt(c.created_at);
        } else if (c.status === 'payable' && c.became_payable_at) {
          becomes_payable_at = c.became_payable_at;
        }
        return {
          ...c,
          becomes_payable_at,
          referred_provider_name: providerNames[c.referred_provider_id] || null,
        };
      }),
      total: count || 0,
      limit,
      offset,
    });
  }

  return json(404, { error: 'Unknown route' });
};
