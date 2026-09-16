// ============================================================================
// auto-bid-ledger — read-only activity summary for a provider's own
// auto-bid prefills.
//
//   GET /api/auto-bid-ledger — the calling provider's own aggregate
//                               auto_bid_prefills stats. No :id, no body.
//
// Phase 7 of the auto-bid redesign (2026-09-16). Exists to back a small
// "Auto-Bid Activity" card in Provider Settings, near the Rate Card panel
// that already serves as this feature's opt-in surface (Phase 6) — so a
// provider can see at a glance whether the notify engine (Phase 4) is
// actually reaching them and whether they're acting on what it sends,
// without needing Jordan to pull it from the DB by hand.
//
// Auth: Bearer JWT (provider's own session token), same as
// auto-bid-prefill.js. Scoped to `provider_id = user.id` in code — this
// runs under service_role like every other Pattern B handler here, so the
// scoping is the only thing standing between "my own activity" and
// "everyone's activity"; get it right.
//
// WHY AGGREGATE IN JS, NOT SQL GROUP BY: a single provider's own
// auto_bid_prefills row count is small (bounded by real job volume in
// their area), and every other diagnostic/stats helper in this codebase
// (matchStats in _service_menu.js) already aggregates an in-memory array
// rather than hand-rolling grouped SQL. One query, one shape, easy to
// reason about and to mock-test.
//
// NOT INCLUDED: the actual final bid amount for a confirmed prefill can
// differ from prefilled_amount_cents (Phase 5 lets a provider edit the
// amount before confirming) — the true number lives in plan_bids, not
// here. This ledger reports the PREFILLED amount only, as a rough
// activity signal, not a financial reconciliation. Labeled accordingly in
// the response so the frontend doesn't misrepresent it.
// ============================================================================
'use strict';

const utils = require('./utils');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function jsonResp(code, data) {
  return { statusCode: code, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function getBearerToken(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

const STATUSES = ['pending', 'confirmed', 'dismissed', 'expired'];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function emptyCounts() {
  const c = { total: 0 };
  for (const s of STATUSES) c[s] = 0;
  return c;
}

// Pure aggregation — separated from the handler so it's directly unit
// testable without a fake Supabase client.
function buildLedger(rows, nowMs) {
  const allTime = emptyCounts();
  const last7Days = emptyCounts();
  let confirmedPrefilledAmountCents = 0;
  const cutoff = nowMs - SEVEN_DAYS_MS;

  for (const row of rows) {
    const status = STATUSES.includes(row.status) ? row.status : null;
    if (!status) continue; // defensive — unknown status value, don't miscount

    allTime.total++;
    allTime[status]++;
    if (status === 'confirmed') confirmedPrefilledAmountCents += row.prefilled_amount_cents || 0;

    const createdMs = row.created_at ? new Date(row.created_at).getTime() : NaN;
    if (Number.isFinite(createdMs) && createdMs >= cutoff) {
      last7Days.total++;
      last7Days[status]++;
    }
  }

  return {
    all_time: allTime,
    last_7_days: last7Days,
    confirmed_prefilled_amount_cents: confirmedPrefilledAmountCents,
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResp(200, {});
  if (event.httpMethod !== 'GET') return jsonResp(405, { error: 'method_not_allowed' });

  const supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResp(500, { error: 'server_misconfigured' });

  const token = getBearerToken(event);
  if (!token) return jsonResp(401, { error: 'authentication_required' });
  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data || !authResult.data.user) {
    return jsonResp(401, { error: 'invalid_token' });
  }
  const user = authResult.data.user;

  const { data: rows, error } = await supabase
    .from('auto_bid_prefills')
    .select('status, prefilled_amount_cents, created_at')
    .eq('provider_id', user.id);

  if (error) return jsonResp(500, { error: 'ledger_query_failed' });

  const ledger = buildLedger(rows || [], Date.now());
  return jsonResp(200, ledger);
};

// Exported for the mock test — pure function, no DB/auth involved.
exports._buildLedger = buildLedger;
