// Car Clubs — member clubs with provider benefits + return-visit bid credit bonuses
//
// GET    /api/car-clubs                                        — list active clubs
// POST   /api/car-clubs/:id/join                               — join a club
// GET    /api/car-clubs/:id/members                            — list members
// POST   /api/car-clubs/:id/punch                              — record a punch-card visit
// GET    /api/car-clubs/:id/provider-benefits                  — list benefits for club
// POST   /api/car-clubs/:id/provider-benefits                  — provider creates benefit
// POST   /api/car-clubs/:id/provider-benefits/:bId/redeem      — member redeems benefit
// POST   /api/car-clubs/return-bonus                           — grant provider 3 credits (called from service request flow)
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

// --- Route helpers ---

async function listClubs(sb, user, query) {
  let q = sb.from('car_clubs')
    .select('id, name, description, vehicle_make, vehicle_model, region, member_count, logo_url, banner_url, theme_color, welcome_message, rules_text, created_at, provider_id')
    .eq('is_active', true)
    .order('member_count', { ascending: false });

  if (query?.make) q = q.ilike('vehicle_make', query.make);
  if (query?.region) q = q.ilike('region', query.region);

  const { data: clubs } = await q.limit(50);

  // Mark which ones the user has joined
  const ids = (clubs || []).map(c => c.id);
  const { data: memberships } = ids.length
    ? await sb.from('club_memberships').select('club_id').eq('member_id', user.id).in('club_id', ids)
    : { data: [] };
  const joined = new Set((memberships || []).map(m => m.club_id));

  return json(200, { clubs: (clubs || []).map(c => ({ ...c, is_member: joined.has(c.id) })) });
}

async function joinClub(sb, user, clubId) {
  const { data: club } = await sb.from('car_clubs').select('id, is_active, member_count').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (!club.is_active) return json(400, { error: 'Club is not active' });

  const { data: existing } = await sb.from('club_memberships')
    .select('id, is_active').eq('club_id', clubId).eq('member_id', user.id).single();

  if (existing?.is_active) return json(409, { error: 'Already a member' });

  if (existing) {
    await sb.from('club_memberships').update({ is_active: true }).eq('id', existing.id);
  } else {
    await sb.from('club_memberships').insert({ club_id: clubId, member_id: user.id });
    await sb.from('car_clubs').update({ member_count: (club.member_count || 0) + 1 }).eq('id', clubId);
  }

  return json(200, { success: true });
}

async function listMembers(sb, clubId) {
  const { data: members } = await sb.from('club_memberships')
    .select('id, member_id, joined_at, profiles!club_memberships_member_id_fkey(full_name)')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .order('joined_at', { ascending: false })
    .limit(100);
  return json(200, { members: members || [] });
}

async function recordPunch(sb, user, clubId) {
  const { data: membership } = await sb.from('club_memberships')
    .select('id').eq('club_id', clubId).eq('member_id', user.id).eq('is_active', true).single();
  if (!membership) return json(403, { error: 'Not a member of this club' });

  await sb.from('club_activity_log').insert({
    club_id: clubId,
    member_id: user.id,
    membership_id: membership.id,
    activity_type: 'punch',
  });

  // Check if any punch-card reward threshold reached
  const { count } = await sb.from('club_activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('member_id', user.id)
    .eq('activity_type', 'punch');

  const { data: rules } = await sb.from('club_reward_rules')
    .select('id, reward_name, punches_required')
    .eq('club_id', clubId)
    .eq('is_active', true);

  const earned = (rules || []).filter(r => count > 0 && count % r.punches_required === 0);

  return json(200, { success: true, total_punches: count, rewards_earned: earned });
}

async function listBenefits(sb, user, clubId) {
  const { data: benefits } = await sb.from('car_club_benefits')
    .select('id, provider_id, benefit_type, description, value_text, expiry_date, max_uses, uses_count, is_active, created_at, profiles!car_club_benefits_provider_id_fkey(full_name, business_name)')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Mark which the user has already redeemed
  const ids = (benefits || []).map(b => b.id);
  const { data: redemptions } = ids.length
    ? await sb.from('car_club_redemptions').select('benefit_id').eq('member_id', user.id).in('benefit_id', ids)
    : { data: [] };
  const redeemed = new Set((redemptions || []).map(r => r.benefit_id));

  return json(200, {
    benefits: (benefits || []).map(b => ({
      ...b,
      available: !redeemed.has(b.id) && (b.max_uses == null || b.uses_count < b.max_uses),
      already_redeemed: redeemed.has(b.id),
    })),
  });
}

async function createBenefit(event, sb, user, clubId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { benefit_type, description, value_text, expiry_date, max_uses } = body;
  if (!benefit_type || !description) return json(400, { error: 'benefit_type and description required' });

  // Must be the club's provider or have a membership
  const { data: club } = await sb.from('car_clubs').select('provider_id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can add benefits' });

  const { data: benefit, error } = await sb.from('car_club_benefits').insert({
    club_id: clubId,
    provider_id: user.id,
    benefit_type,
    description,
    value_text: value_text || null,
    expiry_date: expiry_date || null,
    max_uses: max_uses || null,
  }).select('id').single();

  if (error) return json(500, { error: error.message });
  return json(201, { success: true, benefit_id: benefit.id });
}

async function redeemBenefit(sb, user, clubId, benefitId) {
  const { data: benefit } = await sb.from('car_club_benefits')
    .select('id, club_id, provider_id, max_uses, uses_count, is_active, expiry_date')
    .eq('id', benefitId)
    .eq('club_id', clubId)
    .single();

  if (!benefit) return json(404, { error: 'Benefit not found' });
  if (!benefit.is_active) return json(400, { error: 'Benefit is no longer active' });
  if (benefit.expiry_date && new Date(benefit.expiry_date) < new Date()) return json(400, { error: 'Benefit has expired' });
  if (benefit.max_uses != null && benefit.uses_count >= benefit.max_uses) return json(400, { error: 'Benefit has reached its usage limit' });

  // Check membership
  const { data: membership } = await sb.from('club_memberships')
    .select('id').eq('club_id', clubId).eq('member_id', user.id).eq('is_active', true).single();
  if (!membership) return json(403, { error: 'You must be a club member to redeem benefits' });

  // Check for duplicate redemption
  const { data: existing } = await sb.from('car_club_redemptions')
    .select('id').eq('benefit_id', benefitId).eq('member_id', user.id).single();
  if (existing) return json(409, { error: 'You have already redeemed this benefit' });

  await sb.from('car_club_redemptions').insert({
    benefit_id: benefitId,
    member_id: user.id,
    provider_id: benefit.provider_id,
  });
  await sb.from('car_club_benefits').update({ uses_count: benefit.uses_count + 1 }).eq('id', benefitId);

  return json(200, { success: true });
}

// Called when a service request is created — grants 3 bid credits if member is a club member
// returning to a provider they've used within the club context, once per 30-day window.
async function grantReturnBonus(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { provider_id, club_id } = body;
  if (!provider_id || !club_id) return json(400, { error: 'provider_id and club_id required' });

  // Verify member belongs to the club
  const { data: membership } = await sb.from('club_memberships')
    .select('id').eq('club_id', club_id).eq('member_id', user.id).eq('is_active', true).single();
  if (!membership) return json(200, { granted: false, reason: 'not_a_member' });

  // 30-day dedup window
  const windowStart = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { data: recent } = await sb.from('car_club_return_bonuses')
    .select('id')
    .eq('provider_id', provider_id)
    .eq('member_id', user.id)
    .gte('created_at', windowStart)
    .single();
  if (recent) return json(200, { granted: false, reason: 'already_granted_this_month' });

  // Grant 3 bid credits to provider
  const BONUS_CREDITS = 3;
  await sb.from('car_club_return_bonuses').insert({
    provider_id,
    member_id: user.id,
    club_id,
    credits_granted: BONUS_CREDITS,
  });
  await sb.from('bid_credit_purchases').insert({
    provider_id,
    bids_purchased: BONUS_CREDITS,
    amount_paid: 0,
    status: 'granted',
    stripe_session_id: 'car_club_return_bonus',
  });
  await sb.from('profiles').update({ bid_credits: sb.rpc('increment_bid_credits', { delta: BONUS_CREDITS }) })
    .eq('id', provider_id);
  // Simple increment via raw update
  await sb.rpc('increment_value', { table: 'profiles', column: 'bid_credits', row_id: provider_id, delta: BONUS_CREDITS })
    .catch(async () => {
      // Fallback if RPC doesn't exist: fetch + update
      const { data: p } = await sb.from('profiles').select('bid_credits').eq('id', provider_id).single();
      await sb.from('profiles').update({ bid_credits: (p?.bid_credits || 0) + BONUS_CREDITS }).eq('id', provider_id);
    });

  // Notify provider
  await sb.from('notifications').insert({
    user_id: provider_id,
    type: 'car_club_bonus',
    title: 'You earned 3 bonus bid credits!',
    body: 'A car club member returned to book your services. Keep up the great work!',
    metadata: { member_id: user.id, club_id, credits: BONUS_CREDITS },
  }).catch(() => {});

  return json(200, { granted: true, credits: BONUS_CREDITS });
}

// --- Main dispatcher ---

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const method = event.httpMethod;
  const path = (event.path || '').replace(/.*\/api\/car-clubs\/?/, '').replace(/\/$/, '');
  const qs = event.queryStringParameters || {};

  // GET /api/car-clubs
  if (method === 'GET' && !path) return listClubs(sb, auth.user, qs);

  // POST /api/car-clubs/return-bonus
  if (method === 'POST' && path === 'return-bonus') return grantReturnBonus(event, sb, auth.user);

  // /api/car-clubs/:id/...
  const segments = path.split('/');
  const clubId = segments[0];
  const sub = segments[1];       // join | members | punch | provider-benefits
  const benefitId = segments[2]; // for redeem

  if (!clubId) return json(404, { error: 'Club ID required' });

  if (method === 'POST' && sub === 'join')                return joinClub(sb, auth.user, clubId);
  if (method === 'GET'  && sub === 'members')             return listMembers(sb, clubId);
  if (method === 'POST' && sub === 'punch')               return recordPunch(sb, auth.user, clubId);
  if (method === 'GET'  && sub === 'provider-benefits')   return listBenefits(sb, auth.user, clubId);
  if (method === 'POST' && sub === 'provider-benefits' && !benefitId) return createBenefit(event, sb, auth.user, clubId);
  if (method === 'POST' && sub === 'provider-benefits' && benefitId === 'redeem')
    return json(400, { error: 'Include benefit ID: /provider-benefits/:id/redeem' });
  if (method === 'POST' && sub === 'provider-benefits' && segments[3] === 'redeem')
    return redeemBenefit(sb, auth.user, clubId, benefitId);

  return json(404, { error: 'Unknown car-clubs route' });
};
