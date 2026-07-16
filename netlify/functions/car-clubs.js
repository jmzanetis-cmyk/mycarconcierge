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
// POST   /api/car-club/create                                       — provider creates a club (id from JWT)
// PUT    /api/car-club/update                                       — provider updates a club they own
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

// GET /api/car-club/browse — Slice 1 discovery endpoint.
// Returns active, non-suspended clubs; annotates each with is_member for the
// caller so the client can decide "Join" vs. "Already a member". Feature-gated
// on car_club_programs_enabled; 200-empty when off (silent hide), matching the
// listMyClubs precedent. Column names verified against 20260703a_car_clubs_base.sql.
async function listBrowse(sb, user) {
  // 1. Feature gate — fail closed. isFeatureEnabledForUser returns false on
  //    any DB error or missing platform_settings row.
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(200, { clubs: [] });

  // 2. Active AND not-suspended clubs (Q2 branch A — public discovery layer).
  //    Existing-member visibility (Q2 branch B) is handled by listMyClubs;
  //    /browse is discovery-only.
  const { data: clubs, error: cErr } = await sb.from('car_clubs')
    .select('id, name, description, vehicle_make, vehicle_model, region, member_count, logo_url, banner_url, theme_color, welcome_message, rules_text, points_enabled, coupons_enabled, comp_services_enabled, punch_card_enabled, created_at, provider_id')
    .eq('is_active', true)
    .eq('provider_suspended', false)
    .order('member_count', { ascending: false })
    .limit(50);

  if (cErr) return json(500, { error: 'Failed to load clubs' });
  if (!clubs || clubs.length === 0) return json(200, { clubs: [] });

  // 3. Annotate is_member for the caller — save the client a round-trip.
  const clubIds = clubs.map(c => c.id);
  const { data: memberships } = await sb.from('club_memberships')
    .select('club_id')
    .eq('member_id', user.id)
    .eq('is_active', true)
    .in('club_id', clubIds);
  const joined = new Set((memberships || []).map(m => m.club_id));

  // 4. Annotate active reward-catalog count per club (club_rewards — the
  //    points-era catalog; NOT legacy punch club_reward_rules). The member
  //    page renders this as "N rewards" on each browse card, but no
  //    reward_count was ever returned, so every club displayed 0.
  const { data: rewardRows } = await sb.from('club_rewards')
    .select('club_id')
    .eq('active', true)
    .in('club_id', clubIds);
  const rewardCounts = {};
  (rewardRows || []).forEach(r => { rewardCounts[r.club_id] = (rewardCounts[r.club_id] || 0) + 1; });

  return json(200, {
    clubs: clubs.map(c => ({
      ...c,
      is_member: joined.has(c.id),
      reward_count: rewardCounts[c.id] || 0,
    })),
  });
}

// POST /api/car-club/join — top-level shortcut; clubId in body. Delegates to
// joinClub() (the nested handler at :232) so dupe-guard / reactivate logic
// stays single-sourced. Flag-gated: writes return 403 when off (mirrors
// split-guest-confirm.js precedent; plan §3.3).
async function joinFromBody(event, sb, user) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(403, { error: 'Not available' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const clubId = body.club_id || body.clubId;
  if (!clubId) return json(400, { error: 'club_id required' });
  return joinClub(sb, user, clubId);
}

// POST /api/car-club/leave — set is_active=false on the caller's membership.
// Never deletes (preserves ledger per plan §3.3). Flag-gated: 403 when off.
// Decrements the club's cached member_count to mirror joinClub's increment.
async function leaveClub(event, sb, user) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(403, { error: 'Not available' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const clubId = body.club_id || body.clubId;
  if (!clubId) return json(400, { error: 'club_id required' });

  const { data: club } = await sb.from('car_clubs').select('id, member_count').eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });

  const { data: existing } = await sb.from('club_memberships')
    .select('id, is_active').eq('club_id', clubId).eq('member_id', user.id).maybeSingle();
  if (!existing || !existing.is_active) return json(400, { error: 'Not a member' });

  await sb.from('club_memberships').update({ is_active: false }).eq('id', existing.id);
  // Denormalized-counter debt: this mirror-decrement mirrors joinClub's :338
  // read-then-write increment. Non-atomic (racy under concurrent writes) and
  // asymmetric with joinClub's reactivate path (which doesn't re-increment) so
  // repeated leave/rejoin cycles drift member_count low over time. Acceptable
  // for pilot (~10 members, cosmetic); tracked in plan post-pilot debt list.
  await sb.from('car_clubs').update({ member_count: Math.max(0, (club.member_count || 0) - 1) }).eq('id', clubId);
  return json(200, { success: true });
}

// GET /api/car-club/my-rewards — reward RULES (not the point-redemption
// catalog) for every active membership. Plan §3.3 spec: "reward rules +
// member progress per rule". Applies Q3 (suspension filter) at the car_clubs
// step so a suspended club's rules don't surface. Flag-gated 200-empty
// (matches my-clubs / browse).
//
// Correction to aa08ea8: that commit added a D7 .eq('kind', 'comp_service')
// filter, but it was scoped to club_rewards — the Slice 2 point-redemption
// catalog, which has a `kind` column. This handler now correctly queries
// club_reward_rules per plan §3.3 (Slice 1). club_reward_rules has NO `kind`
// column (see 20260703d), so the D7 filter would have thrown here. Pilot
// restriction is enforced by the feature flag alone (whole surface gated
// OFF); D7's kind-filter rationale becomes live again in Slice 2 when the
// point-redemption catalog wires up on club_rewards.
async function listMyRewards(sb, user) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(200, { rewards: [] });

  const { data: memberships } = await sb.from('club_memberships')
    .select('club_id')
    .eq('member_id', user.id)
    .eq('is_active', true);
  if (!memberships || memberships.length === 0) return json(200, { rewards: [] });
  const clubIds = memberships.map(m => m.club_id);

  // Q3 suspension filter (matches /browse discovery layer).
  const { data: clubs } = await sb.from('car_clubs')
    .select('id, name')
    .in('id', clubIds)
    .eq('is_active', true)
    .eq('provider_suspended', false);
  if (!clubs || clubs.length === 0) return json(200, { rewards: [] });
  const activeClubIds = clubs.map(c => c.id);
  const clubNameById = Object.fromEntries(clubs.map(c => [c.id, c.name]));

  // Columns verified against 20260703d_club_reward_rules.sql.
  const { data: rules } = await sb.from('club_reward_rules')
    .select('id, club_id, reward_name, reward_description, punches_required, reward_type, valid_until, created_at')
    .in('club_id', activeClubIds)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return json(200, {
    rewards: (rules || []).map(r => ({
      ...r,
      club_name: clubNameById[r.club_id],
    })),
  });
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

  // Two-query stitch — no `club_memberships_member_id_fkey` constraint exists
  // in prod (only club_memberships_club_id_fkey is defined on this table), so
  // the previous embed returned an error and the members list silently came
  // back without names attached.
  const { data: members, error: memErr } = await sb.from('club_memberships')
    .select('id, member_id, joined_at')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .order('joined_at', { ascending: false })
    .limit(100);
  if (memErr) {
    console.error('[car-clubs] listMembers select failed:', memErr.message);
    return json(500, { error: 'Failed to load members' });
  }
  const rows = members || [];
  const memberIds = [...new Set(rows.map(m => m.member_id).filter(Boolean))];
  let profilesById = {};
  if (memberIds.length > 0) {
    const { data: profs, error: profErr } = await sb
      .from('profiles')
      .select('id, full_name')
      .in('id', memberIds);
    if (profErr) {
      console.error('[car-clubs] listMembers profiles stitch failed:', profErr.message);
    } else {
      profilesById = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
  }
  const stitched = rows.map(m => ({ ...m, profiles: profilesById[m.member_id] || null }));
  return json(200, { members: stitched });
}

// Slice 1 stub retained: the nested POST /:id/punch route below still returns
// 403. The real punch endpoint is POST /api/car-club/punch (top-level,
// clubId in body) — see punchMember() below. Slice 2 will retire the nested
// route in a separate cleanup once we confirm no client still hits it.
async function recordPunch(sb, user, clubId) {
  return json(403, { error: 'Not available — use POST /api/car-club/punch' });
}

// POST /api/car-club/punch — Slice 2 pilot design (plan §4, DECIDED 2026-07-05).
//
// Provider scans member's Check-In QR → provider taps Confirm → one call here.
// Body: { club_id, qr_token }. Trusted-pilot design: no server-side idempotency
// / dedupe. If double-tap abuse appears at scale, add an N-minute window per
// (club_id, member_id) — logged as post-pilot §9a debt.
//
// Flow:
//   1. Feature gate (flag off → 403).
//   2. Provider auth (new true-provider pattern): fetch target car_clubs row,
//     verify car_clubs.provider_id === auth.uid(). This is the security
//     boundary — a member must NEVER be able to punch. Reject 403 otherwise.
//     Also reject if the club is inactive / provider-suspended.
//   3. Member resolution: try profiles.qr_code_token first (normal case),
//     fall back to profiles.id (handles the www/members-core.js:2963-2965
//     fallback where QR encoded the raw uid instead of a qr_code_token).
//   4. Active-membership check: member must have club_memberships row with
//     is_active=true. 400 (not 404/403) — caller IS authorized, member
//     EXISTS, but this specific member↔club edge doesn't.
//   5. Rule-agnostic INSERT into club_points_ledger with delta_points = 1,
//     reason = 'earn_spend'. NO reward_rule_id column exists on the table
//     (confirmed against 20260703h:106-115) — rule-agnostic is enforced by
//     schema itself. Rules are thresholds evaluated at REDEEM time, not
//     earn time. Client-side progress rendering computes
//     SUM(delta_points) per active rule.
//
// Per-punch point value: hard-coded 1. Neither club_reward_rules (20260703d)
// nor club_points_config (20260703h:96-103) has a per-punch column;
// club_points_config.points_per_dollar is spending-scaled, not per-visit.
// If per-punch configurability is needed post-pilot, add a column to
// club_reward_rules (e.g. points_per_punch int NOT NULL DEFAULT 1) —
// logged §9a.
//
// source_ref: audit stamp = `punch:provider=${provider_uid}:${iso_timestamp}`.
// Every ledger row is thereby traceable to the provider who wrote it and
// when. NOT an idempotency key (see trusted-pilot note above).
//
// Confirmed verbatim against migrations: club_points_ledger (20260703h:106-115),
// club_ledger_reason enum (20260703h:50), club_reward_rules (20260703d),
// club_points_config (20260703h:96-103). profiles.qr_code_token is a
// Replit-era column not in tracked migrations (grep 0 hits) but present in
// prod per www/members-core.js:2954 client query — schema-drift housekeeping
// logged §9a.
async function punchMember(event, sb, user, clubId) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(403, { error: 'Not available' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const qrToken = (body.qr_token || body.qrToken || '').trim();
  if (!qrToken) return json(400, { error: 'qr_token required' });

  // Provider auth (true-provider pattern) + active-club check.
  // This is THE security boundary: a member must never reach the ledger insert
  // below. Fetch provider_id + active/suspended state in one round-trip.
  const { data: club } = await sb.from('car_clubs')
    .select('id, provider_id, is_active, provider_suspended')
    .eq('id', clubId).single();
  if (!club) return json(404, { error: 'Club not found' });
  if (club.provider_id !== user.id) return json(403, { error: 'Only the club provider can record punches' });
  if (club.is_active === false || club.provider_suspended === true) {
    return json(400, { error: 'Club is not active' });
  }

  // Member resolution — profiles.qr_code_token primary, profiles.id fallback.
  let memberId = null;
  {
    const { data: byToken } = await sb.from('profiles')
      .select('id').eq('qr_code_token', qrToken).maybeSingle();
    if (byToken) memberId = byToken.id;
  }
  if (!memberId && /^[0-9a-f-]{36}$/i.test(qrToken)) {
    const { data: byId } = await sb.from('profiles')
      .select('id').eq('id', qrToken).maybeSingle();
    if (byId) memberId = byId.id;
  }
  if (!memberId) return json(404, { error: 'Member not found (unknown QR code)' });

  // Active-membership check — the punched member must be in this club.
  const { data: membership } = await sb.from('club_memberships')
    .select('id').eq('club_id', clubId).eq('member_id', memberId).eq('is_active', true).maybeSingle();
  if (!membership) return json(400, { error: 'Member is not in this club' });

  // Ledger insert — rule-agnostic (no reward_rule_id column exists), +1 per
  // punch, source_ref stamped for audit trace to the writing provider.
  const sourceRef = `punch:provider=${user.id}:${new Date().toISOString()}`;
  const { data: inserted, error } = await sb.from('club_points_ledger').insert({
    club_id: clubId,
    member_id: memberId,
    delta_points: 1,
    reason: 'earn_spend',
    source_ref: sourceRef,
  }).select('id').single();
  if (error) return json(500, { error: error.message });

  return json(200, { success: true, ledger_id: inserted.id, member_id: memberId });
}

// Top-level dispatcher shim: extracts club_id from body then delegates.
async function punchFromBody(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const clubId = body.club_id || body.clubId;
  if (!clubId) return json(400, { error: 'club_id required' });
  return punchMember(event, sb, user, clubId);
}

// ─── Admin surface (Slice 4) ──────────────────────────────────────────────────
//
// All admin routes gate on profiles.role === 'admin' — same pattern as
// ops-flags-admin.js:58-63. Admin routes are NOT flag-gated: admin needs to
// see/toggle clubs regardless of the Car Club feature-flag state (so they can
// suspend/unsuspend during a Stage-2 rollback).
//
// Routes:
//   GET   /api/car-club/admin/clubs                     — list all clubs
//   GET   /api/car-club/admin/clubs/:id/ledger          — paginated ledger for a club
//   PATCH /api/car-club/admin/clubs/:id/suspension      — flip provider_suspended
//
// Ties into plan §6 Slice 4 (bouncer-model kill switch) — Jordan uses
// `PATCH .../suspension` as the per-club kill switch instead of writing SQL.
// ──────────────────────────────────────────────────────────────────────────────

async function isAdmin(sb, userId) {
  const { data: profile } = await sb.from('profiles')
    .select('role').eq('id', userId).maybeSingle();
  return !!profile && profile.role === 'admin';
}

// GET /api/car-club/admin/clubs
// Returns all car_clubs rows with the fields admin needs for the moderation
// list: identity (id, name), ownership (provider_id), state (is_active,
// provider_suspended), scale (member_count — denormalized counter; see §9a
// for the debt entry about making this a computed-on-read), and feature
// toggles for a quick "what's this club actually running" glance.
async function adminListClubs(sb, user) {
  if (!(await isAdmin(sb, user.id))) return json(403, { error: 'Admin required' });
  const { data: clubs, error } = await sb.from('car_clubs')
    .select('id, name, provider_id, is_active, provider_suspended, member_count, punch_card_enabled, points_enabled, coupons_enabled, comp_services_enabled, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return json(500, { error: 'Failed to load clubs' });
  return json(200, { clubs: clubs || [] });
}

// PATCH /api/car-club/admin/clubs/:id/suspension
// Body: { provider_suspended: boolean }
// Toggles the per-club kill switch. Q2 RLS: suspension gates discovery only,
// never existing-member visibility — verified when the policy was applied
// 2026-07-04.
//
// Response: { success, club: { id, name, provider_id, is_active, provider_suspended } }
async function adminSetSuspension(event, sb, user, clubId) {
  if (!(await isAdmin(sb, user.id))) return json(403, { error: 'Admin required' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const suspended = body.provider_suspended;
  if (typeof suspended !== 'boolean') {
    return json(400, { error: 'provider_suspended (boolean) required' });
  }
  const { data, error } = await sb.from('car_clubs')
    .update({ provider_suspended: suspended, updated_at: new Date().toISOString() })
    .eq('id', clubId)
    .select('id, name, provider_id, is_active, provider_suspended')
    .maybeSingle();
  if (error)  return json(500, { error: 'Failed to update suspension' });
  if (!data)  return json(404, { error: 'Club not found' });
  return json(200, { success: true, club: data });
}

// GET /api/car-club/admin/clubs/:id/ledger?limit=<n>&offset=<n>
// Paginated ledger view for auditing per-club point activity. Reads
// club_points_ledger (append-only), most-recent-first. Limits: default 100
// per page, max 500. If the ledger table is later populated by /punch (it is
// per f1e894e) and /redeem (via the RPC), this endpoint reflects real
// activity as it happens.
async function adminClubLedger(sb, user, clubId, qs) {
  if (!(await isAdmin(sb, user.id))) return json(403, { error: 'Admin required' });

  // Verify club exists first — makes a 404 meaningful vs. "empty ledger for a
  // bad club id".
  const { data: club } = await sb.from('car_clubs')
    .select('id, name').eq('id', clubId).maybeSingle();
  if (!club) return json(404, { error: 'Club not found' });

  const limit = Math.min(parseInt(qs?.limit || '100', 10) || 100, 500);
  const offset = Math.max(parseInt(qs?.offset || '0', 10) || 0, 0);
  const { data: entries, error } = await sb.from('club_points_ledger')
    .select('id, member_id, delta_points, reason, dollars_spent_cents, source_ref, created_at')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return json(500, { error: 'Failed to load ledger' });

  return json(200, {
    club: { id: club.id, name: club.name },
    ledger: entries || [],
    pagination: { limit, offset, count: (entries || []).length },
  });
}

// GET /api/car-club/my-provider-clubs — Slice 3 pilot-minimal support
// endpoint (2026-07-06). Returns the car_clubs rows where the caller is
// the provider — used by provider-club.html to answer "which club_id do
// I operate against?" without hardcoding.
//
// Response shape: { clubs: [<car_clubs row>...] }. Array for correctness
// under the schema (nothing prevents a provider from being assigned
// multiple clubs), but pilot per D4 provisions one club per provider so
// clients can safely operate on clubs[0]. Empty array when the caller
// has no provisioned clubs — the client shows a "No club provisioned"
// empty state (D4: clubs are admin/SQL-provisioned, not self-serve).
//
// Auth: same JWT-verified chain as every other provider-owning route in
// this file. user.id is the caller's uid; the .eq('provider_id', user.id)
// filter is the ownership scope. Caller cannot see another provider's
// clubs because user.id comes from the verified JWT, never from body/
// query/non-Authorization header.
//
// Flag-gated: 200-empty when the feature is off (matches the my-clubs
// silent-hide pattern). Provider mid-setup gets an empty response; no
// error surface leaks the flag state.
//
// Column selection matches the fields provider-club.html needs on load:
// id (for downstream /punch, /validate-voucher, /rewards fetches), name
// (header display), theme_color/banner_url/logo_url (branding), plus
// is_active + provider_suspended so the client can render a clear
// suspended-state banner rather than silently 404'ing subsequent writes.
async function listMyProviderClubs(sb, user) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(200, { clubs: [] });

  const { data: clubs, error } = await sb.from('car_clubs')
    .select('id, name, description, logo_url, banner_url, theme_color, welcome_message, rules_text, is_active, provider_suspended, points_enabled, coupons_enabled, comp_services_enabled, punch_card_enabled, member_count, created_at')
    .eq('provider_id', user.id)
    .order('created_at', { ascending: true });

  if (error) return json(500, { error: 'Failed to load clubs' });
  return json(200, { clubs: clubs || [] });
}

// ─── Club self-serve create + update (provider-scoped writes) ─────────────────
//
// POST /api/car-club/create — provider creates a new club they own.
// PUT  /api/car-club/update — provider updates a club they own (id in body).
//
// Both close the biggest gap on the provider-onboarding path: previously the
// only way to provision a club was direct SQL (docs/scripts/provision-*.sql
// for the pilot). The client-side UI in www/car-club-provider.html has POSTed
// to /create and /update since Replit days, but neither route existed on the
// Netlify function — every save 404'd. These two handlers make that surface
// work end-to-end.
//
// ───── Auth (identical to every other write on this function) ─────
// Bearer JWT via getUser at :50-57 → user.id is the caller's uid, verified
// by sb.auth.getUser. NEITHER handler reads provider_id, user_id, uid or any
// identity claim from body / query / non-Authorization header. On create,
// provider_id = user.id — a client cannot create a club under someone else's
// uid by construction. On update, we fetch the existing club's provider_id
// and reject if it doesn't equal user.id (see 'Ownership gate' below).
//
// ───── Ownership gate on update (defense-in-depth) ─────
// Two guards, either alone would suffice; both cheap:
//   (a) SELECT the club by id, verify provider_id === user.id BEFORE the
//       UPDATE. If mismatched or the row doesn't exist, collapse both cases
//       into 404 'Club not found' — matches validateVoucher's info-leak
//       defense at :729. Distinguishing 'exists but not yours' from
//       'doesn't exist' would leak whether a foreign club_id is real.
//   (b) The UPDATE itself carries .eq('provider_id', user.id). Even if the
//       ownership changed between the SELECT and the UPDATE (TOCTOU race
//       via admin reassignment), the UPDATE would touch zero rows and
//       return null → we route that to a defensive 500 rather than a
//       silent no-op. (a) alone is race-vulnerable; (b) alone leaks the
//       club_id space via 404-vs-empty. Together they're tight.
//
// ───── Field whitelist ─────
// EDITABLE_CLUB_FIELDS is the ONE authoritative list of client-writable
// club-native columns. Anything not on it (provider_id, id, created_at,
// updated_at, member_count, points_enabled/coupons_enabled/
// comp_services_enabled/punch_card_enabled feature toggles, and the fully-
// dead vehicle_make/vehicle_model/region) is silently ignored — the whitelist
// filter is by construction: only these keys are read from body, so no
// out-of-scope key can end up in the UPDATE object.
//
// Feature toggles are deliberately NOT client-editable here. They are gated
// per plan §4 (D4) as admin/SQL-provisioned in the pilot. A separate PATCH
// /:clubId/features handler exists at :1389 for provider-controlled toggling
// after Stage-2 flip; not repeating that surface here.
//
// ───── Validation ─────
//   • name: required, trimmed, non-empty (400 otherwise).
//   • theme_color: must be #<3|4|6|8 hex digits>. Defends against CSS-inject
//     into the member view where accent color is interpolated into a style=
//     attribute (car-club-member.html:906/1012/1051). escHtml on the render
//     side catches attribute-break but not payload-inside-css-value.
//   • logo_url / banner_url: must be http:// or https://. Empty string OK
//     (stored as NULL, matches reference behavior for "clear the image").
//   • is_active: strict boolean-only on update (400 otherwise). Create
//     defaults to true unless body carries literal false.
//
// ───── Multi-club policy ─────
// The pilot per D4 provisions one club per provider (see :575-579 doc note
// on listMyProviderClubs). SCHEMA does not enforce this: nothing on car_clubs
// prevents multiple clubs owned by the same provider_id. This handler follows
// the schema — creates freely, no 409 on second club. If the pilot rule
// needs to be enforced in code, add a pre-INSERT check here or a partial
// unique index on (provider_id) WHERE is_active=true at the schema level.
//
// ───── Client compatibility (KNOWN GAP — needs companion patch) ─────
// The current client at car-club-provider.html:1589-1597 does NOT include
// `id` in its update payload. This handler REQUIRES an id (per spec). The
// client needs `id: clubData.id` added to the payload before this route
// becomes usable. Additionally, car-club-provider.html:1499 calls
// GET /api/car-club/my-club which is also not a route on this function
// (only my-clubs plural and my-provider-clubs exist). Companion client
// work is out of scope for this task — flagged for follow-up.

const EDITABLE_CLUB_FIELDS = [
  'name', 'description', 'welcome_message',
  'theme_color', 'rules_text',
  'logo_url', 'banner_url',
  'is_active',
];

// Returns the validated value, or the sentinel `undefined` to mean
// "caller supplied a value but it's invalid — 400". A null return means
// "caller supplied empty; store null in DB".
function _validateClubThemeColor(v) {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  return /^#[0-9A-Fa-f]{3,8}$/.test(v) ? v : undefined;
}
function _validateClubUrl(v) {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  return /^https?:\/\/.+/.test(v) ? v : undefined;
}

async function createClub(event, sb, user) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(403, { error: 'Not available' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const name = String(body.name || '').trim();
  if (!name) return json(400, { error: 'Club name is required' });

  // Whitelist + validate. Any field not touched here is not written.
  let themeColor = '#C9A84C';
  if (body.theme_color !== undefined) {
    const v = _validateClubThemeColor(body.theme_color);
    if (v === undefined) return json(400, { error: 'Invalid theme_color (expected hex like #RRGGBB)' });
    if (v !== null) themeColor = v;
  }
  let logoUrl = null;
  if (body.logo_url !== undefined) {
    const v = _validateClubUrl(body.logo_url);
    if (v === undefined) return json(400, { error: 'Invalid logo_url' });
    logoUrl = v;
  }
  let bannerUrl = null;
  if (body.banner_url !== undefined) {
    const v = _validateClubUrl(body.banner_url);
    if (v === undefined) return json(400, { error: 'Invalid banner_url' });
    bannerUrl = v;
  }
  let isActive = true;
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return json(400, { error: 'is_active must be boolean' });
    isActive = body.is_active;
  }

  const row = {
    provider_id: user.id,     // NEVER from body — always the JWT-verified caller
    name,
    description:      body.description     != null && body.description     !== '' ? body.description     : null,
    welcome_message:  body.welcome_message != null && body.welcome_message !== '' ? body.welcome_message : null,
    rules_text:       body.rules_text      != null && body.rules_text      !== '' ? body.rules_text      : null,
    theme_color:      themeColor,
    logo_url:         logoUrl,
    banner_url:       bannerUrl,
    is_active:        isActive,
    // Pilot default: punch-card program is the only one available at Stage-2
    // flip. Other program toggles left to schema defaults (all false) — they
    // become togglable later via the existing PATCH /:clubId/features route.
    punch_card_enabled: true,
  };

  const { data: created, error } = await sb.from('car_clubs')
    .insert(row).select('*').single();
  if (error) return json(500, { error: 'Failed to create club' });
  return json(201, { club: created });
}

async function updateClub(event, sb, user) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(403, { error: 'Not available' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const clubId = body.id || body.club_id || body.clubId;
  if (!clubId) return json(400, { error: 'id required' });

  // Ownership gate (a). Collapse "not found" and "not yours" into a single
  // 404 to avoid leaking which club_ids exist across provider boundaries.
  const { data: existing } = await sb.from('car_clubs')
    .select('id, provider_id').eq('id', clubId).maybeSingle();
  if (!existing || existing.provider_id !== user.id) {
    return json(404, { error: 'Club not found' });
  }

  // Build the update object from the whitelist only. Any key not on
  // EDITABLE_CLUB_FIELDS cannot end up here — this is the security boundary
  // that prevents provider_id / id / created_at rewrites.
  const update = {};

  if (body.name !== undefined) {
    const trimmed = String(body.name || '').trim();
    if (!trimmed) return json(400, { error: 'Club name cannot be empty' });
    update.name = trimmed;
  }
  if (body.description !== undefined) update.description = body.description || null;
  if (body.welcome_message !== undefined) update.welcome_message = body.welcome_message || null;
  if (body.rules_text !== undefined) update.rules_text = body.rules_text || null;

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return json(400, { error: 'is_active must be boolean' });
    update.is_active = body.is_active;
  }

  if (body.theme_color !== undefined) {
    const v = _validateClubThemeColor(body.theme_color);
    if (v === undefined) return json(400, { error: 'Invalid theme_color (expected hex like #RRGGBB)' });
    update.theme_color = v != null ? v : '#C9A84C';
  }
  if (body.logo_url !== undefined) {
    const v = _validateClubUrl(body.logo_url);
    if (v === undefined) return json(400, { error: 'Invalid logo_url' });
    update.logo_url = v;
  }
  if (body.banner_url !== undefined) {
    const v = _validateClubUrl(body.banner_url);
    if (v === undefined) return json(400, { error: 'Invalid banner_url' });
    update.banner_url = v;
  }

  if (Object.keys(update).length === 0) return json(400, { error: 'No fields to update' });
  update.updated_at = new Date().toISOString();

  // Ownership gate (b) — belt-and-suspenders. The .eq('provider_id', user.id)
  // predicate here means the UPDATE only touches the row if ownership STILL
  // matches, closing the TOCTOU window between the SELECT above and this
  // write. If ownership was reassigned in the interim (admin action), we
  // get zero rows back and route to defensive 500.
  const { data: updated, error } = await sb.from('car_clubs')
    .update(update).eq('id', clubId).eq('provider_id', user.id)
    .select('*').maybeSingle();
  if (error) return json(500, { error: 'Failed to update club' });
  if (!updated) return json(500, { error: 'Failed to update club' });
  return json(200, { club: updated });
}

// _redeemViaRpc — shared implementation of the redeem RPC dispatch, used by
// both POST /api/car-club/redeem (redeemFromBody, top-level) and the nested
// POST /:clubId/rewards/:rewardId/redeem (redeemReward). Extracted to a
// helper so a future edit to the status-routing logic can't drift between
// the two entry points.
//
// Auth (member-authenticated, uid never from body):
//   Both callers receive `user` from the dispatcher's already-completed
//   getUser() at car-clubs.js:50-57 — the Bearer token from the
//   Authorization header, cryptographically verified via sb.auth.getUser().
//   p_member_id passed to the RPC is user.id. Neither entry point reads
//   member_id / user_id / uid from body / query / non-Authorization header;
//   a member cannot redeem against someone else's balance by construction.
//
// RPC delegation (redeem_reward_for_member, 3-param, at 20260706a — applied
// live 2026-07-06):
//   plpgsql, single transaction, advisory-xact-lock on (club, member) +
//   FOR UPDATE on the reward row, membership guard, ownership guard
//   (WHERE club_id = p_club_id), balance guard BEFORE any INSERT,
//   voucher-first write ordering with the ledger deduction as the LAST
//   write. Returns TABLE(status text, voucher_code text) — a single-row
//   rowset arriving as data[0] on the JS side.
//
// Error routing — structured RPC return:
//   Expected business outcomes come back as status values in the row —
//   they do NOT throw. The `error` object is populated ONLY for genuine
//   unexpected DB failures (missing table, FK violation from schema drift,
//   connection error, etc.) — those get routed to 500 generic.
//
// Route table (RPC status → HTTP response):
//   'ok'             → 200 { success: true, voucher_code }
//   'insufficient'   → 400 "Not enough points"
//   'not_member'     → 403 "Not a member of this club"
//   'no_reward'      → 404 "Reward not found or inactive"
//   'out_of_stock'   → 400 "Reward out of stock"
//   error object populated (real DB failure) → 500 generic
//   unknown status (RPC returned something we don't handle) → 500 generic
//
// Routing history: earlier attempts used (1) message-string matching
// (brittle — a future RAISE wording edit silently breaks routing) and
// (2) custom SQLSTATE codes MCC01-04 (propagation from user-defined
// SQLSTATE through PostgREST to supabase-js error.code proved unreliable).
// Structured return via a status enum in the row is the third and
// production scheme: the API contract is a plain string in a data field,
// not a PostgrestError side-channel.
async function _redeemViaRpc(sb, user, clubId, rewardId) {
  const { data, error } = await sb.rpc('redeem_reward_for_member', {
    p_club_id:   clubId,
    p_reward_id: rewardId,
    p_member_id: user.id,  // JWT-verified caller uid — NEVER from body
  });

  // Genuine DB failure (unexpected — should never fire under normal ops).
  if (error) return json(500, { error: 'Redemption failed' });

  // RPC returns a single row. If nothing came back, the RPC's contract
  // was violated (should be impossible — every code path RETURN NEXTs).
  const result = data && data[0];
  if (!result) return json(500, { error: 'Redemption failed' });

  switch (result.status) {
    case 'ok':
      return json(200, { success: true, voucher_code: result.voucher_code });
    case 'insufficient':
      return json(400, { error: 'Not enough points',              code: 'insufficient_balance' });
    case 'not_member':
      return json(403, { error: 'Not a member of this club',      code: 'not_a_member' });
    case 'no_reward':
      return json(404, { error: 'Reward not found or inactive',   code: 'reward_not_found' });
    case 'out_of_stock':
      return json(400, { error: 'Reward out of stock',            code: 'reward_out_of_stock' });
    default:
      // RPC returned a status we don't recognize — treat as failure so
      // we never leak a partial-success shape to the client.
      return json(500, { error: 'Redemption failed' });
  }
}

// POST /api/car-club/redeem — Slice 2 top-level route (plan §4).
// Flag-gated. Body: { club_id, reward_id }. Delegates to _redeemViaRpc.
async function redeemFromBody(event, sb, user) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(403, { error: 'Not available' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const clubId = body.club_id || body.clubId;
  const rewardId = body.reward_id || body.rewardId;
  if (!clubId)   return json(400, { error: 'club_id required' });
  if (!rewardId) return json(400, { error: 'reward_id required' });

  return _redeemViaRpc(sb, user, clubId, rewardId);
}

// POST /api/car-club/validate-voucher — Slice 2 provider action (plan §4).
//
// Provider types the voucher code the member is showing them → single
// conditional UPDATE atomically marks the voucher fulfilled AND rejects
// reuse. No RPC needed — the reuse-rejection guarantee is baked into the
// WHERE status='issued' clause: two concurrent validates for the same
// code cannot both succeed, because the first flips the row to
// 'fulfilled' and the second's WHERE finds no matching row.
//
// Body: { voucher_code }. The code is trimmed + uppercased before match
// (the redeem RPC generates codes as UPPER hex via
// upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)) at 20260706a:75,
// so all live-stored codes are uppercase; provider can type either case).
//
// Auth (provider-authenticated):
//   Same JWT chain as /punch (car-clubs.js:50-57 → sb.auth.getUser →
//   verified user.id). Provider-scope enforced by fetching the caller's
//   owned clubs and constraining the UPDATE's WHERE with .in('club_id',
//   <caller's clubs>). A voucher whose club_id isn't in the caller's
//   list can't be burned. Handler NEVER reads provider_id, uid, or any
//   identity claim from body / query / non-Authorization header.
//
// Response shape:
//   200 { success: true, redemption: <full redemption row> } on validation
//   404 { error: 'Invalid or already-used voucher code' } — collapses
//       (code doesn't exist) + (code exists but belongs to another
//       provider's club) + (code already fulfilled or cancelled) into a
//       single response. Distinguishing these would leak whether a code
//       exists on a different provider's club — a real information leak.
//
// Race safety (single-statement guarantee):
//   The Postgres UPDATE ... WHERE ... RETURNING is a single atomic
//   statement. Two concurrent validates for the same code both issue the
//   UPDATE; whichever reaches the row first locks it, flips status,
//   commits. The second's UPDATE finds no row matching status='issued'
//   after the first commit (or waits on the row lock, then reads the
//   post-commit state) → returns 0 rows → 404. No double-fulfillment path.
//
// Ownership-scope note: the caller's clubs are fetched via a separate
// SELECT before the UPDATE. If provider ownership changes between the
// SELECT and the UPDATE (rare — usually a manual admin action), worst
// case is a just-lost-club voucher can't be validated (correct: it
// shouldn't be) or a just-gained-club voucher isn't validatable in this
// request (also correct: no voucher exists yet against a club they just
// took over). The two round-trips do NOT compromise the reuse-rejection
// guarantee, which lives entirely in the UPDATE's atomic WHERE.
async function validateVoucher(event, sb, user) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(403, { error: 'Not available' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const voucherCode = (body.voucher_code || body.voucherCode || '').trim().toUpperCase();
  if (!voucherCode) return json(400, { error: 'voucher_code required' });

  // Provider-scope: fetch caller's owned clubs. If none, they can't own any
  // voucher — short-circuit to 404 (indistinguishable from "code doesn't
  // exist" — same collapsed response).
  const { data: clubs } = await sb.from('car_clubs')
    .select('id').eq('provider_id', user.id);
  const clubIds = (clubs || []).map(c => c.id);
  if (clubIds.length === 0) {
    return json(404, { error: 'Invalid or already-used voucher code' });
  }

  // Atomic conditional UPDATE. Provider-scope, code match, and
  // status='issued' all evaluated in one WHERE. RETURNING is atomic with
  // the UPDATE. If no row matches (bad code / wrong provider / already
  // fulfilled / cancelled), maybeSingle() returns null → collapsed 404.
  const { data: fulfilled, error } = await sb.from('club_points_redemptions')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
    .eq('voucher_code', voucherCode)
    .eq('status', 'issued')
    .in('club_id', clubIds)
    .select('id, club_id, member_id, reward_id, point_cost, voucher_code, redeemed_at, fulfilled_at')
    .maybeSingle();

  if (error) return json(500, { error: 'Validation failed' });

  if (!fulfilled) {
    return json(404, { error: 'Invalid or already-used voucher code' });
  }

  return json(200, { success: true, redemption: fulfilled });
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
  // Q3 (2026-07-04): suspended/inactive/nonexistent club → 200-empty (not 404).
  // Fallback-to-empty because a member of a club that gets suspended shouldn't
  // see a 404 (would throw a client error); silent empty state matches the
  // "defer explain-suspension UX to Slice 4" decision. Nullable-safe:
  // === false / === true mirror Q2's IS NOT FALSE / IS NOT TRUE semantics so
  // a NULL default doesn't hide a legitimate club.
  const { data: club } = await sb.from('car_clubs')
    .select('id, is_active, provider_suspended').eq('id', clubId).single();
  if (!club || club.is_active === false || club.provider_suspended === true) {
    return json(200, { rewards: [] });
  }

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

// POST /api/car-clubs/:clubId/rewards/:rewardId/redeem — nested route
// consumed by the live client at car-club-member.html:1372. Flag-gated
// (added 2026-07-06 with the RPC structured-return refactor — was
// previously ungated, but the top-level /redeem gates and consistency
// matters). Delegates to _redeemViaRpc so status routing lives in one
// place.
//
// Pre-2026-07-06 this handler returned { success, redemption_id } where
// redemption_id was the RPC's scalar uuid return. After the RPC rewrite
// to RETURNS TABLE(status, voucher_code), the previous response shape
// broke — the client at car-club-member.html:1383 reads
// `data.voucher_code` in its post-redeem toast and had been showing
// "Voucher: undefined" since the RPC was fixed 2026-07-02. This
// rewrite fixes that.
async function redeemReward(sb, user, clubId, rewardId) {
  const enabled = await isFeatureEnabledForUser(sb, 'car_club_programs_enabled', user.id);
  if (!enabled) return json(403, { error: 'Not available' });
  return _redeemViaRpc(sb, user, clubId, rewardId);
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
  // Q3 (2026-07-04): suspended/inactive/nonexistent club → 200-empty (not 404).
  // See listRewards for the fallback-to-empty rationale + Q2 nullable pattern.
  const { data: club } = await sb.from('car_clubs')
    .select('id, is_active, provider_suspended').eq('id', clubId).single();
  if (!club || club.is_active === false || club.provider_suspended === true) {
    return json(200, { coupons: [] });
  }

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
  // Q3 (2026-07-04): suspended/inactive/nonexistent club → 200-empty (not 404).
  // See listRewards for the fallback-to-empty rationale + Q2 nullable pattern.
  const { data: club } = await sb.from('car_clubs')
    .select('id, is_active, provider_suspended').eq('id', clubId).single();
  if (!club || club.is_active === false || club.provider_suspended === true) {
    return json(200, { comp_services: [] });
  }

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

  // GET /api/car-club/browse — Slice 1 discovery. Feature-gated on
  // car_club_programs_enabled; returns 200-empty when off (silent hide).
  // Diverges from listClubs at empty-path by filtering provider_suspended too
  // (Q2: suspension gates discovery, never existing-member visibility).
  if (method === 'GET' && path === 'browse') return listBrowse(sb, auth.user);

  // Slice 1 top-level member routes. POSTs pass clubId in the body and
  // delegate to the nested handlers (single source for dupe-guard / reactivate
  // logic). All three are flag-gated: GET → 200-empty when off (silent hide),
  // POST → 403 (writes can't silently succeed).
  if (method === 'POST' && path === 'join')       return joinFromBody(event, sb, auth.user);
  if (method === 'POST' && path === 'leave')      return leaveClub(event, sb, auth.user);
  if (method === 'POST' && path === 'punch')      return punchFromBody(event, sb, auth.user);
  if (method === 'POST' && path === 'redeem')     return redeemFromBody(event, sb, auth.user);
  if (method === 'POST' && path === 'validate-voucher') return validateVoucher(event, sb, auth.user);
  if (method === 'POST' && path === 'create')     return createClub(event, sb, auth.user);
  if (method === 'PUT'  && path === 'update')     return updateClub(event, sb, auth.user);
  if (method === 'GET'  && path === 'my-rewards') return listMyRewards(sb, auth.user);
  if (method === 'GET'  && path === 'my-provider-clubs') return listMyProviderClubs(sb, auth.user);

  // ─── Admin routes (Slice 4) ─────────────────────────────────────────────
  // Not flag-gated: admin needs to manage clubs regardless of the feature
  // flag state (so they can suspend/unsuspend during a rollback).
  if (path.startsWith('admin/')) {
    const adminSub = path.substring('admin/'.length);
    if (method === 'GET' && adminSub === 'clubs') return adminListClubs(sb, auth.user);
    const mLedger = adminSub.match(/^clubs\/([^/]+)\/ledger$/);
    if (method === 'GET' && mLedger) return adminClubLedger(sb, auth.user, mLedger[1], qs);
    const mSusp = adminSub.match(/^clubs\/([^/]+)\/suspension$/);
    if (method === 'PATCH' && mSusp) return adminSetSuspension(event, sb, auth.user, mSusp[1]);
  }

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
