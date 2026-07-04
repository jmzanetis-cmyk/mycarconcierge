// Car Clubs — member clubs with provider benefits + return-visit bid credit bonuses
//
// Existing routes:
// GET    /api/car-clubs                                              — list active clubs
// POST   /api/car-clubs/:id/join                                    — join a club
// GET    /api/car-clubs/:id/members                                 — list members
// POST   /api/car-clubs/:id/punch                                   — record a punch-card visit
// GET    /api/car-clubs/:id/provider-benefits                       — list benefits for club
// POST   /api/car-clubs/:id/provider-benefits                       — provider creates benefit
// POST   /api/car-clubs/:id/provider-benefits/:bId/redeem           — member redeems benefit
// POST   /api/car-clubs/return-bonus                                — grant provider 3 credits
//
// Program routes (points / coupons / comp services):
// PATCH  /api/car-clubs/:id/features                                — toggle program features
// PUT    /api/car-clubs/:id/points-config                           — upsert points earn rate
// GET    /api/car-clubs/:id/members/:memberId/points                — balance + history
// GET    /api/car-clubs/:id/rewards                                 — list active rewards
// POST   /api/car-clubs/:id/rewards                                 — create reward
// PATCH  /api/car-clubs/:id/rewards/:rewardId                      — edit / set active
// POST   /api/car-clubs/:id/rewards/:rewardId/redeem               — member redeems (atomic)
// POST   /api/car-clubs/:id/redemptions/:redemptionId/fulfill       — provider fulfills voucher
// GET    /api/car-clubs/:id/coupons                                 — list active coupons
// POST   /api/car-clubs/:id/coupons                                 — create coupon
// POST   /api/car-clubs/:id/coupons/:code/redeem                   — validate + redeem coupon
// GET    /api/car-clubs/:id/comp-services                           — list active comp services
// POST   /api/car-clubs/:id/comp-services                           — create comp service
// POST   /api/car-clubs/:id/comp-services/:csId/claim              — member claims grant
// POST   /api/car-clubs/:id/grants/:grantId/use                    — provider marks grant used
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, OPTIONS',
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

// ─── Existing route helpers ────────────────────────────────────────────────────

async function listClubs(sb, user, query) {
  let q = sb.from('car_clubs')
    .select('id, name, description, vehicle_make, vehicle_model, region, member_count, logo_url, banner_url, theme_color, welcome_message, rules_text, created_at, provider_id')
    .eq('is_active', true)
    .order('member_count', { ascending: false });

  if (query?.make) q = q.ilike('vehicle_make', query.make);
  if (query?.region) q = q.ilike('region', query.region);

  const { data: clubs } = await q.limit(50);

  const ids = (clubs || []).map(c => c.id);
  const { data: memberships } = ids.length
    ? await sb.from('club_memberships').select('club_id').eq('member_id', user.id).in('club_id', ids)
    : { data: [] };
  const joined = new Set((memberships || []).map(m => m.club_id));

  return json(200, { clubs: (clubs || []).map(c => ({ ...c, is_member: joined.has(c.id) })) });
}

// GET /api/car-club/my-clubs
// Returns the clubs the current member is actively a member of, with basic
// club summary + rolled-up point balances (SUM(delta_points) from
// club_points_ledger). Feature-gated on car_club_programs_enabled.
//
// Fail-closed behavior: flag off → 200 with { clubs: [], memberships: [] }.
// Deliberately 200-empty (silent hide) rather than 403 feature_disabled —
// this is a hidden pre-launch feature. A 403 would surface as a visible error
// to any UI code path that reached this endpoint; 200-empty renders nothing.
// Differs from split-guest-confirm.js:53 (which uses 403) by design.
//
// Response shape (dual keys — most call sites read data.clubs, but
// car-club-member.html:1405 reads clubsData.memberships; identical array
// under both keys so both work without a client change):
//   { clubs: [<club summary + balances>...], memberships: [<same array>...] }
async function listMyClubs(sb, user) {
  // 1. Feature gate — fail closed. isFeatureEnabledForUser returns false on
  //    any DB error or missing platform_settings row.
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(200, { clubs: [], memberships: [] });

  // 2. Active memberships for this member.
  const { data: memberships, error: mErr } = await sb
    .from('club_memberships')
    .select('club_id, joined_at')
    .eq('member_id', user.id)
    .eq('is_active', true);

  if (mErr) return json(500, { error: 'Failed to load memberships' });
  if (!memberships || memberships.length === 0) {
    return json(200, { clubs: [], memberships: [] });
  }

  const clubIds = memberships.map(m => m.club_id);

  // 3. Club summaries + ledger balances — independent queries, run in parallel.
  const [clubsRes, ledgerRes] = await Promise.all([
    sb.from('car_clubs')
      .select('id, provider_id, name, description, logo_url, banner_url, welcome_message, is_active, vehicle_make, vehicle_model, region, member_count, theme_color, rules_text, points_enabled, coupons_enabled, comp_services_enabled, punch_card_enabled, created_at')
      .in('id', clubIds)
      .eq('is_active', true),
    sb.from('club_points_ledger')
      .select('club_id, delta_points, created_at')
      .eq('member_id', user.id)
      .in('club_id', clubIds),
  ]);

  if (clubsRes.error)  return json(500, { error: 'Failed to load clubs' });
  if (ledgerRes.error) return json(500, { error: 'Failed to load balances' });

  // 4. Roll up ledger per club: SUM(delta_points), MAX(created_at).
  const rollup = new Map();
  for (const row of (ledgerRes.data || [])) {
    const cur = rollup.get(row.club_id) || { points_balance: 0, last_activity_at: null };
    cur.points_balance += row.delta_points;
    if (!cur.last_activity_at || row.created_at > cur.last_activity_at) {
      cur.last_activity_at = row.created_at;
    }
    rollup.set(row.club_id, cur);
  }

  // 5. Assemble per-membership response. joined_at from club_memberships;
  //    balance from ledger rollup. Progress-bar-specific fields
  //    (reward_rule_id, punch_count, visit_count, total_spend) return null/0
  //    for Slice 1 — proper reward-rule progress lands in a later slice.
  const membershipByClub = new Map(memberships.map(m => [m.club_id, m]));

  const result = (clubsRes.data || []).map(club => {
    const roll = rollup.get(club.id) || { points_balance: 0, last_activity_at: null };
    const membership = membershipByClub.get(club.id);
    return {
      club_id:               club.id,
      provider_id:           club.provider_id,
      name:                  club.name,
      description:           club.description,
      logo_url:              club.logo_url,
      banner_url:            club.banner_url,
      welcome_message:       club.welcome_message,
      rules_text:            club.rules_text,
      theme_color:           club.theme_color,
      vehicle_make:          club.vehicle_make,
      vehicle_model:         club.vehicle_model,
      region:                club.region,
      member_count:          club.member_count,
      points_enabled:        club.points_enabled,
      coupons_enabled:       club.coupons_enabled,
      comp_services_enabled: club.comp_services_enabled,
      punch_card_enabled:    club.punch_card_enabled,
      joined_at:             membership ? membership.joined_at : null,
      // Client at car-club-member.html:877-899 iterates `club.balances`.
      // Slice 1: one aggregate balance per club. reward_rule_id is null so the
      // client's `if (!b.reward_rule_id) return;` at line 880 skips
      // progress-bar rendering — clean "no reward rules set up yet" fallback.
      // last_activity_at populated so loadActivity() at line 1138 still shows
      // generic points-earning activity items per club.
      balances: [{
        reward_rule_id:   null,
        points_balance:   roll.points_balance,
        last_activity_at: roll.last_activity_at,
        punch_count:      0,
        visit_count:      0,
        total_spend:      0,
      }],
    };
  });

  return json(200, { clubs: result, memberships: result });
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

async function listMembers(sb, user, clubId) {
  // Slice 1 exposure audit (2026-07-04): pre-fix, this returned up to 100
  // {member_id, joined_at, full_name} rows for any club to any valid bearer
  // token. Service-role client bypasses RLS, so this handler check is the
  // only gate. Caller must now be the club's provider or an active member.
  const { data: club } = await sb.from('car_clubs').select('provider_id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  const isProvider = club.provider_id === user.id;
  const { data: membership } = await sb.from('club_memberships')
    .select('id').eq('club_id', clubId).eq('member_id', user.id).eq('is_active', true).maybeSingle();
  if (!isProvider && !membership) return json(403, { error: 'Access denied' });

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
    activity_type: 'punch',
  });

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

  const { data: membership } = await sb.from('club_memberships')
    .select('id').eq('club_id', clubId).eq('member_id', user.id).eq('is_active', true).single();
  if (!membership) return json(403, { error: 'You must be a club member to redeem benefits' });

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

async function grantReturnBonus(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { provider_id, club_id } = body;
  if (!provider_id || !club_id) return json(400, { error: 'provider_id and club_id required' });

  const { data: membership } = await sb.from('club_memberships')
    .select('id').eq('club_id', club_id).eq('member_id', user.id).eq('is_active', true).single();
  if (!membership) return json(200, { granted: false, reason: 'not_a_member' });

  const windowStart = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { data: recent } = await sb.from('car_club_return_bonuses')
    .select('id')
    .eq('provider_id', provider_id)
    .eq('member_id', user.id)
    .gte('created_at', windowStart)
    .single();
  if (recent) return json(200, { granted: false, reason: 'already_granted_this_month' });

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
  await sb.rpc('increment_value', { table: 'profiles', column: 'bid_credits', row_id: provider_id, delta: BONUS_CREDITS })
    .catch(async () => {
      const { data: p } = await sb.from('profiles').select('bid_credits').eq('id', provider_id).single();
      await sb.from('profiles').update({ bid_credits: (p?.bid_credits || 0) + BONUS_CREDITS }).eq('id', provider_id);
    });

  await sb.from('notifications').insert({
    user_id: provider_id,
    type: 'car_club_bonus',
    title: 'You earned 3 bonus bid credits!',
    body: 'A car club member returned to book your services. Keep up the great work!',
    metadata: { member_id: user.id, club_id, credits: BONUS_CREDITS },
  }).catch(() => {});

  return json(200, { granted: true, credits: BONUS_CREDITS });
}

async function getClub(sb, user, clubId) {
  const { data, error } = await sb.from('car_clubs')
    .select('id, name, description, vehicle_make, vehicle_model, region, provider_id, is_active, points_enabled, coupons_enabled, comp_services_enabled, punch_card_enabled, logo_url, banner_url, theme_color, welcome_message, rules_text, member_count, created_at')
    .eq('id', clubId).single();
  if (error || !data) return json(404, { error: 'Club not found' });
  if (data.provider_id !== user.id) return json(403, { error: 'Access denied' });
  return json(200, { club: data });
}

async function getPointsConfig(sb, user, clubId) {
  const { data: club } = await sb.from('car_clubs').select('provider_id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Access denied' });
  const { data: config } = await sb.from('club_points_config').select('*').eq('club_id', clubId).single();
  return json(200, { config: config || null });
}

// ─── Program route helpers ─────────────────────────────────────────────────────

async function patchFeatures(event, sb, user, clubId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: club } = await sb.from('car_clubs').select('provider_id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can update features' });

  const allowed = ['points_enabled', 'coupons_enabled', 'comp_services_enabled', 'punch_card_enabled'];
  const update = {};
  for (const key of allowed) {
    if (key in body) update[key] = Boolean(body[key]);
  }
  if (!Object.keys(update).length) return json(400, { error: 'No valid feature toggles provided' });

  const { error } = await sb.from('car_clubs').update(update).eq('id', clubId);
  if (error) return json(500, { error: error.message });
  return json(200, { success: true, updated: update });
}

async function putPointsConfig(event, sb, user, clubId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: club } = await sb.from('car_clubs').select('provider_id, points_enabled').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can configure points' });
  if (!club.points_enabled) return json(400, { error: 'Points are not enabled for this club' });

  const { points_per_dollar, points_label, accrual_source } = body;
  if (points_per_dollar != null && (typeof points_per_dollar !== 'number' || points_per_dollar <= 0))
    return json(400, { error: 'points_per_dollar must be a positive number' });
  const VALID_SOURCES = new Set(['mcc_processed', 'manual_entry']);
  if (accrual_source != null && !VALID_SOURCES.has(accrual_source))
    return json(400, { error: 'invalid accrual_source' });

  const row = {
    club_id: clubId,
    updated_at: new Date().toISOString(),
    ...(points_per_dollar != null && { points_per_dollar }),
    ...(points_label      != null && { points_label }),
    ...(accrual_source    != null && { accrual_source }),
  };
  const { data, error } = await sb.from('club_points_config').upsert(row, { onConflict: 'club_id' }).select().single();
  if (error) return json(500, { error: error.message });
  return json(200, { success: true, config: data });
}

async function getMemberPoints(sb, user, clubId, memberId) {
  const { data: club } = await sb.from('car_clubs').select('provider_id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });

  const isProvider = club.provider_id === user.id;
  const isSelf = user.id === memberId;
  if (!isProvider && !isSelf) return json(403, { error: 'Access denied' });

  const { data: ledger, error } = await sb.from('club_points_ledger')
    .select('id, delta_points, reason, dollars_spent_cents, source_ref, created_at')
    .eq('club_id', clubId)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return json(500, { error: error.message });

  const balance = (ledger || []).reduce((sum, r) => sum + r.delta_points, 0);
  return json(200, { balance, history: ledger || [] });
}

async function listRewards(sb, clubId) {
  const { data: club } = await sb.from('car_clubs').select('id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });

  const { data: rewards, error } = await sb.from('club_rewards')
    .select('id, kind, title, description, point_cost, image_url, inventory_qty, active, created_at')
    .eq('club_id', clubId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) return json(500, { error: error.message });
  return json(200, { rewards: rewards || [] });
}

async function createReward(event, sb, user, clubId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: club } = await sb.from('car_clubs').select('provider_id, points_enabled').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can create rewards' });
  if (!club.points_enabled) return json(400, { error: 'Points are not enabled for this club' });

  const { kind, title, description, point_cost, image_url, inventory_qty } = body;
  const VALID_KINDS = new Set(['merch', 'comp_service', 'other']);
  if (!title) return json(400, { error: 'title is required' });
  if (point_cost == null || typeof point_cost !== 'number' || point_cost < 0)
    return json(400, { error: 'point_cost must be a non-negative number' });
  if (kind && !VALID_KINDS.has(kind)) return json(400, { error: 'invalid kind' });

  const { data, error } = await sb.from('club_rewards').insert({
    club_id: clubId,
    kind: kind || 'other',
    title,
    description: description || null,
    point_cost,
    image_url: image_url || null,
    inventory_qty: inventory_qty != null ? inventory_qty : null,
  }).select().single();
  if (error) return json(500, { error: error.message });
  return json(201, { success: true, reward: data });
}

async function patchReward(event, sb, user, clubId, rewardId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: club } = await sb.from('car_clubs').select('provider_id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can edit rewards' });

  const allowed = ['kind', 'title', 'description', 'point_cost', 'image_url', 'inventory_qty', 'active'];
  const update = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  if (!Object.keys(update).length) return json(400, { error: 'No updatable fields provided' });

  const { data, error } = await sb.from('club_rewards')
    .update(update).eq('id', rewardId).eq('club_id', clubId).select().single();
  if (error) return json(500, { error: error.message });
  if (!data) return json(404, { error: 'Reward not found' });
  return json(200, { success: true, reward: data });
}

// Delegates to redeem_reward_for_member() SECURITY DEFINER RPC so the debit,
// redemption insert, and inventory decrement happen in a single transaction.
async function redeemReward(sb, user, clubId, rewardId) {
  const { data: rid, error } = await sb.rpc('redeem_reward_for_member', {
    p_club_id:   clubId,
    p_reward_id: rewardId,
    p_member_id: user.id,
  });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('Not a member')) return json(403, { error: 'Not a member of this club' });
    if (msg.includes('Points are not enabled')) return json(400, { error: 'Points are not enabled for this club' });
    if (msg.includes('Reward unavailable')) return json(400, { error: 'Reward unavailable' });
    if (msg.includes('out of stock')) return json(400, { error: 'Reward out of stock' });
    if (msg.includes('Not enough points')) return json(400, { error: msg.replace(/^.*?exception\s*/i, '') });
    return json(500, { error: msg });
  }
  return json(200, { success: true, redemption_id: rid });
}

async function handleFreeBids(sb, user) {
  const { data: profile, error } = await sb
    .from('profiles')
    .select('bid_credits')
    .eq('id', user.id)
    .single();
  if (error) return json(500, { error: error.message });
  return json(200, { bid_credits: profile?.bid_credits || 0 });
}

async function fulfillRedemption(sb, user, clubId, redemptionId) {
  const { data: club } = await sb.from('car_clubs').select('provider_id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can fulfill redemptions' });

  const { data, error } = await sb.from('club_points_redemptions')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
    .eq('id', redemptionId).eq('club_id', clubId).select().single();
  if (error) return json(500, { error: error.message });
  if (!data) return json(404, { error: 'Redemption not found' });
  return json(200, { success: true });
}

async function listCoupons(sb, clubId) {
  const { data: club } = await sb.from('car_clubs').select('id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });

  const { data: coupons, error } = await sb.from('club_coupons')
    .select('id, code, title, discount_type, discount_value, min_spend_cents, eligible_services, max_redemptions, per_member_limit, starts_at, expires_at, active, created_at')
    .eq('club_id', clubId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) return json(500, { error: error.message });
  return json(200, { coupons: coupons || [] });
}

async function createCoupon(event, sb, user, clubId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: club } = await sb.from('car_clubs').select('provider_id, coupons_enabled').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can create coupons' });
  if (!club.coupons_enabled) return json(400, { error: 'Coupons are not enabled for this club' });

  const { code, title, discount_type, discount_value, min_spend_cents,
          eligible_services, max_redemptions, per_member_limit, starts_at, expires_at } = body;
  const VALID_DISCOUNT = new Set(['percent', 'flat']);
  if (!code) return json(400, { error: 'code is required' });
  if (!VALID_DISCOUNT.has(discount_type)) return json(400, { error: 'discount_type must be percent or flat' });
  if (discount_value == null || typeof discount_value !== 'number' || discount_value <= 0)
    return json(400, { error: 'discount_value must be a positive number' });

  const { data, error } = await sb.from('club_coupons').insert({
    club_id: clubId, code, title: title || null, discount_type, discount_value,
    min_spend_cents: min_spend_cents || null,
    eligible_services: Array.isArray(eligible_services) ? eligible_services : null,
    max_redemptions: max_redemptions || null,
    per_member_limit: per_member_limit || null,
    starts_at: starts_at || null,
    expires_at: expires_at || null,
  }).select().single();
  if (error) {
    if (error.code === '23505') return json(409, { error: 'Coupon code already exists for this club' });
    return json(500, { error: error.message });
  }
  return json(201, { success: true, coupon: data });
}

async function redeemCoupon(event, sb, user, clubId, couponCode) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: coupon } = await sb.from('club_coupons')
    .select('*').eq('club_id', clubId).eq('code', couponCode).single();
  if (!coupon || !coupon.active) return json(404, { error: 'Coupon not found or inactive' });

  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return json(400, { error: 'Coupon not yet active' });
  if (coupon.expires_at && new Date(coupon.expires_at) < now) return json(400, { error: 'Coupon has expired' });

  if (coupon.max_redemptions != null) {
    const { count } = await sb.from('club_coupon_redemptions')
      .select('id', { count: 'exact', head: true }).eq('coupon_id', coupon.id);
    if (count >= coupon.max_redemptions) return json(400, { error: 'Coupon has reached its usage limit' });
  }

  if (coupon.per_member_limit != null) {
    const { count: myCount } = await sb.from('club_coupon_redemptions')
      .select('id', { count: 'exact', head: true }).eq('coupon_id', coupon.id).eq('member_id', user.id);
    if (myCount >= coupon.per_member_limit) return json(400, { error: 'You have reached your redemption limit for this coupon' });
  }

  const spendCents = body.spend_cents ?? null;
  if (coupon.min_spend_cents != null && (spendCents == null || spendCents < coupon.min_spend_cents))
    return json(400, { error: `Minimum spend of ${coupon.min_spend_cents} cents required` });

  const amountDiscountedCents = spendCents != null
    ? (coupon.discount_type === 'percent'
        ? Math.round(spendCents * coupon.discount_value / 100)
        : coupon.discount_value)
    : null;

  const { error } = await sb.from('club_coupon_redemptions').insert({
    coupon_id: coupon.id, club_id: clubId, member_id: user.id,
    job_id: body.job_id || null,
    amount_discounted_cents: amountDiscountedCents,
  });
  if (error) return json(500, { error: error.message });
  return json(200, {
    success: true,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    amount_discounted_cents: amountDiscountedCents,
  });
}

async function listCompServices(sb, clubId) {
  const { data: club } = await sb.from('car_clubs').select('id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });

  const { data: services, error } = await sb.from('club_comp_services')
    .select('id, title, description, service_type, condition_min_spend_cents, per_member_limit, starts_at, expires_at, active, created_at')
    .eq('club_id', clubId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) return json(500, { error: error.message });
  return json(200, { comp_services: services || [] });
}

async function createCompService(event, sb, user, clubId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: club } = await sb.from('car_clubs').select('provider_id, comp_services_enabled').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can create comp services' });
  if (!club.comp_services_enabled) return json(400, { error: 'Comp services are not enabled for this club' });

  const { title, description, service_type, condition_min_spend_cents,
          per_member_limit, starts_at, expires_at } = body;
  if (!title) return json(400, { error: 'title is required' });

  const { data, error } = await sb.from('club_comp_services').insert({
    club_id: clubId, title,
    description: description || null,
    service_type: service_type || null,
    condition_min_spend_cents: condition_min_spend_cents || null,
    per_member_limit: per_member_limit || null,
    starts_at: starts_at || null,
    expires_at: expires_at || null,
  }).select().single();
  if (error) return json(500, { error: error.message });
  return json(201, { success: true, comp_service: data });
}

async function claimCompService(sb, user, clubId, csId) {
  const { data: membership } = await sb.from('club_memberships')
    .select('id').eq('club_id', clubId).eq('member_id', user.id).eq('is_active', true).single();
  if (!membership) return json(403, { error: 'Not a member of this club' });

  const { data: cs } = await sb.from('club_comp_services')
    .select('*').eq('id', csId).eq('club_id', clubId).single();
  if (!cs || !cs.active) return json(404, { error: 'Comp service not found or inactive' });

  const now = new Date();
  if (cs.starts_at && new Date(cs.starts_at) > now) return json(400, { error: 'Comp service not yet active' });
  if (cs.expires_at && new Date(cs.expires_at) < now) return json(400, { error: 'Comp service has expired' });

  if (cs.per_member_limit != null) {
    const { count } = await sb.from('club_comp_service_grants')
      .select('id', { count: 'exact', head: true }).eq('comp_service_id', csId).eq('member_id', user.id);
    if (count >= cs.per_member_limit)
      return json(400, { error: 'You have reached the claim limit for this service' });
  }

  const { data, error } = await sb.from('club_comp_service_grants').insert({
    comp_service_id: csId, club_id: clubId, member_id: user.id,
  }).select('id').single();
  if (error) return json(500, { error: error.message });
  return json(200, { success: true, grant_id: data.id });
}

async function useGrant(sb, user, clubId, grantId) {
  const { data: club } = await sb.from('car_clubs').select('provider_id').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can mark grants as used' });

  const { data, error } = await sb.from('club_comp_service_grants')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', grantId).eq('club_id', clubId).eq('status', 'granted')
    .select().single();
  if (error) return json(500, { error: error.message });
  if (!data) return json(404, { error: 'Grant not found or already used' });
  return json(200, { success: true });
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const method = event.httpMethod;
  // Handles both /api/car-clubs/* (prod redirect) and /api/car-club/* (legacy singular)
  const path = (event.path || '').replace(/.*\/api\/car-clubs?\/?/, '').replace(/\/$/, '');
  const qs = event.queryStringParameters || {};

  // GET /api/car-clubs
  if (method === 'GET' && !path) return listClubs(sb, auth.user, qs);

  // POST /api/car-clubs/return-bonus
  if (method === 'POST' && path === 'return-bonus') return grantReturnBonus(event, sb, auth.user);

  // GET /api/car-clubs/free-bids (also /api/car-club/free-bids via redirect)
  if (method === 'GET' && path === 'free-bids') return handleFreeBids(sb, auth.user);

  // GET /api/car-club/my-clubs — Phase 1 membership foundation. Feature-gated
  // on car_club_programs_enabled; returns 200-empty when off (silent hide).
  if (method === 'GET' && path === 'my-clubs') return listMyClubs(sb, auth.user);

  // /api/car-clubs/:id/...
  const segments = path.split('/');
  const clubId = segments[0];
  const sub = segments[1];
  const seg2 = segments[2];
  const seg3 = segments[3];

  if (!clubId) return json(404, { error: 'Club ID required' });

  // Existing routes
  if (method === 'POST' && sub === 'join')  return joinClub(sb, auth.user, clubId);
  if (method === 'POST' && sub === 'punch') return recordPunch(sb, auth.user, clubId);

  if (sub === 'members') {
    if (method === 'GET' && seg2 && seg3 === 'points') return getMemberPoints(sb, auth.user, clubId, seg2);
    if (method === 'GET' && !seg2) return listMembers(sb, auth.user, clubId);
  }

  if (sub === 'provider-benefits') {
    if (method === 'GET') return listBenefits(sb, auth.user, clubId);
    if (method === 'POST' && !seg2) return createBenefit(event, sb, auth.user, clubId);
    if (method === 'POST' && seg2 === 'redeem')
      return json(400, { error: 'Include benefit ID: /provider-benefits/:id/redeem' });
    if (method === 'POST' && seg3 === 'redeem') return redeemBenefit(sb, auth.user, clubId, seg2);
  }

  // GET /api/car-clubs/:id
  if (method === 'GET' && !sub) return getClub(sb, auth.user, clubId);

  // Program routes
  if (sub === 'features' && method === 'PATCH')       return patchFeatures(event, sb, auth.user, clubId);
  if (sub === 'points-config' && method === 'GET')    return getPointsConfig(sb, auth.user, clubId);
  if (sub === 'points-config' && method === 'PUT')    return putPointsConfig(event, sb, auth.user, clubId);

  if (sub === 'rewards') {
    if (method === 'GET'   && !seg2)                  return listRewards(sb, clubId);
    if (method === 'POST'  && !seg2)                  return createReward(event, sb, auth.user, clubId);
    if (method === 'PATCH' && seg2 && !seg3)          return patchReward(event, sb, auth.user, clubId, seg2);
    if (method === 'POST'  && seg2 && seg3 === 'redeem') return redeemReward(sb, auth.user, clubId, seg2);
  }

  if (sub === 'redemptions' && seg3 === 'fulfill' && method === 'POST')
    return fulfillRedemption(sb, auth.user, clubId, seg2);

  if (sub === 'coupons') {
    if (method === 'GET'  && !seg2)                   return listCoupons(sb, clubId);
    if (method === 'POST' && !seg2)                   return createCoupon(event, sb, auth.user, clubId);
    if (method === 'POST' && seg2 && seg3 === 'redeem') return redeemCoupon(event, sb, auth.user, clubId, seg2);
  }

  if (sub === 'comp-services') {
    if (method === 'GET'  && !seg2)                   return listCompServices(sb, clubId);
    if (method === 'POST' && !seg2)                   return createCompService(event, sb, auth.user, clubId);
    if (method === 'POST' && seg2 && seg3 === 'claim') return claimCompService(sb, auth.user, clubId, seg2);
  }

  if (sub === 'grants' && seg3 === 'use' && method === 'POST')
    return useGrant(sb, auth.user, clubId, seg2);

  return json(404, { error: 'Unknown car-clubs route' });
};
