// GET  /api/member/:id/referral-code  — get or generate member's referral code
// GET  /api/member/:id/referrals      — list referrals where member is referrer
// GET  /api/member/:id/credits        — list member credit transactions + total
// POST /api/member/referral/apply     — apply a referral code (link referrer to new member)
const { createClient } = require('@supabase/supabase-js');

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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

function generateCode(userId) {
  // Deterministic prefix + random-looking suffix from UUID bytes
  const hex = userId.replace(/-/g, '').substring(0, 8).toUpperCase();
  return `MCC${hex}`;
}

async function handleReferralCode(sb, user, targetId) {
  if (user.id !== targetId) return json(403, { error: 'Cannot access another member\'s referral code' });

  // Check for existing code in profiles
  const { data: profile } = await sb.from('profiles').select('member_referral_code').eq('id', user.id).single();
  if (profile?.member_referral_code) {
    return json(200, { success: true, referral_code: profile.member_referral_code });
  }

  // Generate and store
  const code = generateCode(user.id);
  await sb.from('profiles').update({ member_referral_code: code }).eq('id', user.id);
  return json(200, { success: true, referral_code: code });
}

async function handleReferrals(sb, user, targetId) {
  if (user.id !== targetId) return json(403, { error: 'Forbidden' });

  const { data: referrals } = await sb.from('referrals')
    .select('id, referral_code, referred_id, status, referrer_credit_amount, referred_credit_amount, credited_at, created_at, updated_at')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });

  return json(200, { success: true, referrals: referrals || [] });
}

async function handleCredits(sb, user, targetId) {
  if (user.id !== targetId) return json(403, { error: 'Forbidden' });

  const { data: credits } = await sb.from('member_credits')
    .select('id, amount, type, description, referral_id, created_at')
    .eq('member_id', user.id)
    .order('created_at', { ascending: false });

  const list = credits || [];
  const total = list.reduce((sum, c) => sum + (c.amount || 0), 0);
  return json(200, { success: true, credits: list, total_credits: total });
}

async function handleApply(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { code } = body;
  if (!code) return json(400, { error: 'code required' });

  // Find the owner of this referral code
  const { data: referrer } = await sb.from('profiles')
    .select('id, member_referral_code')
    .eq('member_referral_code', code.toUpperCase())
    .single();

  if (!referrer) return json(404, { error: 'Referral code not found' });
  if (referrer.id === user.id) return json(400, { error: 'Cannot use your own referral code' });

  // Check for duplicate
  const { data: existing } = await sb.from('referrals')
    .select('id')
    .eq('referrer_id', referrer.id)
    .eq('referred_id', user.id)
    .single();
  if (existing) return json(409, { error: 'Referral already applied' });

  const { data: referral, error } = await sb.from('referrals').insert({
    referrer_id: referrer.id,
    referred_id: user.id,
    referral_code: code.toUpperCase(),
    status: 'pending',
  }).select('id').single();

  if (error) return json(500, { error: error.message });

  // Mark on the referred member's profile
  await sb.from('profiles').update({ referred_by: referrer.id, referred_by_code: code.toUpperCase() }).eq('id', user.id);

  return json(200, { success: true, referral_id: referral.id });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const path = event.path;

  // POST /api/member/referral/apply
  if (event.httpMethod === 'POST' && path.includes('/referral/apply')) {
    return handleApply(event, sb, auth.user);
  }

  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const codeMatch     = path.match(/\/api\/member\/([^/]+)\/referral-code$/);
  const referralsMatch = path.match(/\/api\/member\/([^/]+)\/referrals$/);
  const creditsMatch  = path.match(/\/api\/member\/([^/]+)\/credits$/);

  if (codeMatch)      return handleReferralCode(sb, auth.user, codeMatch[1]);
  if (referralsMatch) return handleReferrals(sb, auth.user, referralsMatch[1]);
  if (creditsMatch)   return handleCredits(sb, auth.user, creditsMatch[1]);

  return json(404, { error: 'Unknown member referral route' });
};
