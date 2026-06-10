// ============================================================================
// Task #334 — Admin Driver Payouts
//
// Routes (mounted via www/_redirects → /api/admin/driver-payouts/*):
//   GET  /api/admin/driver-payouts
//                       — per-driver totals (pending, paid, failed) plus the
//                         most recent earnings rows for the table view.
//   POST /api/admin/driver-payouts/adjust
//                       { driver_id, job_id?, amount_cents, kind, notes }
//                       — inserts a manual driver_earnings row (kind defaults
//                         to 'adjustment'). amount_cents may be negative to
//                         claw back an overpayment. Marks payout_status='manual'.
//   POST /api/admin/driver-payouts/:earnings_id/retry
//                       — re-attempts a failed Stripe transfer for one row.
//   POST /api/admin/driver-payouts/:earnings_id/mark-paid
//                       — admin marks an earnings row as paid out-of-band
//                         (cash, ACH, etc.). Sets payout_status='manual'.
//
// Auth: x-admin-password matching ADMIN_PASSWORD OR Supabase admin JWT
//   (same dual-auth pattern as bgc-admin.js).
//
// Every write logs to admin_audit_log so changes are auditable.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { alertOnAuditFailure } = require('../../lib/audit-warning-alert');
const utils = require('./utils');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password, x-admin-token, Authorization',
  'Content-Type': 'application/json'
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(data) };
}


function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
    return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
  } catch (e) {
    console.error('[driver-payouts-admin] stripe init failed:', e.message);
    return null;
  }
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function audit(supabase, action, metadata) {
  try {
    await supabase.from('admin_audit_log').insert({
      action,
      target_type: 'driver_earnings',
      target_id: metadata?.earnings_id || metadata?.driver_id || null,
      metadata: { ...metadata, source: 'driver-payouts-admin' },
      performed_by: 'admin'
    });
  } catch (e) {
    await alertOnAuditFailure(supabase, {
      action,
      targetType: 'driver_earnings',
      targetId: metadata?.earnings_id || metadata?.driver_id || null,
      metadata,
      error: e,
    });
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/driver-payouts — overview
// ---------------------------------------------------------------------------
async function handleList(event, supabase) {
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, phone, email, status, per_job_rate_cents, stripe_connect_account_id, stripe_payouts_enabled')
    .order('full_name', { ascending: true });

  // Parallel fan-out:
  //   totals    — per-(driver,status) sum from driver_payouts_totals view
  //   wallet    — per-driver available/in-flight from driver_wallet_balances
  //                (round-3 wallet model; see migration 20260516d)
  //   recent    — last 500 earnings rows for activity table
  //   cashouts  — last 50 driver_cashouts rows for cash-outs table
  const [totalsRes, walletRes, recentRes, cashoutsRes] = await Promise.all([
    supabase.from('driver_payouts_totals').select('driver_id, payout_status, total_cents'),
    supabase.from('driver_wallet_balances').select('driver_id, available_cents, in_flight_cents, lifetime_paid_cents'),
    supabase
      .from('driver_earnings')
      .select('id, driver_id, job_id, leg_id, amount_cents, kind, notes, payout_status, stripe_transfer_id, cashout_id, paid_at, payout_error, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(500),
    supabase
      .from('driver_cashouts')
      .select('id, driver_id, amount_cents, fee_cents, method, status, stripe_transfer_id, stripe_payout_id, error, requested_at, completed_at, initiated_by_kind')
      .order('requested_at', { ascending: false })
      .limit(50)
  ]);
  const totals   = totalsRes.data;
  const wallets  = walletRes.data || [];
  const recent   = recentRes.data || [];
  const cashouts = cashoutsRes.data || [];

  const byDriver = {};
  for (const d of drivers || []) {
    byDriver[d.id] = {
      driver: d,
      // Wallet model (round 3).
      available_cents: 0, in_flight_cents: 0,
      // Legacy buckets still useful for admin breakdown.
      pending_account_cents: 0, failed_cents: 0,
      paid_cents: 0, manual_cents: 0,
      recent: []
    };
  }

  if (Array.isArray(totals) && !totalsRes.error) {
    for (const t of totals) {
      const row = byDriver[t.driver_id];
      if (!row) continue;
      const amt = Number(t.total_cents || 0);
      if      (t.payout_status === 'paid')            row.paid_cents = amt;
      else if (t.payout_status === 'pending_account') row.pending_account_cents = amt;
      else if (t.payout_status === 'failed')          row.failed_cents = amt;
      else if (t.payout_status === 'manual')          row.manual_cents = amt;
      // 'available' & 'pending' come from the wallet view; ignore here.
    }
  } else {
    for (const e of recent) {
      const row = byDriver[e.driver_id];
      if (!row) continue;
      const amt = e.amount_cents || 0;
      if      (e.payout_status === 'paid')            row.paid_cents += amt;
      else if (e.payout_status === 'pending_account') row.pending_account_cents += amt;
      else if (e.payout_status === 'failed')          row.failed_cents += amt;
      else if (e.payout_status === 'manual')          row.manual_cents += amt;
    }
  }

  // Wallet view supplies the authoritative available + in-flight numbers.
  if (Array.isArray(wallets) && !walletRes.error) {
    for (const w of wallets) {
      const row = byDriver[w.driver_id];
      if (!row) continue;
      row.available_cents = Number(w.available_cents || 0);
      row.in_flight_cents = Number(w.in_flight_cents || 0);
    }
  }

  for (const e of recent) {
    const row = byDriver[e.driver_id];
    if (!row) continue;
    if (row.recent.length < 25) row.recent.push(e);
  }

  return jsonResponse(200, {
    drivers: Object.values(byDriver),
    cashouts,
    earnings_count: recent.length,
    totals_source: (Array.isArray(totals) && !totalsRes.error) ? 'view' : 'fallback',
    wallet_source: (Array.isArray(wallets) && !walletRes.error) ? 'view' : 'unavailable'
  });
}

// ---------------------------------------------------------------------------
// POST /api/admin/driver-payouts/:driver_id/cashout  { method }
// Admin-triggered cash-out for a single driver's full available balance.
// Reuses the same executeCashout implementation as POST /api/driver/v1/me/cashout
// so admin-initiated and driver-initiated cash-outs share one code path.
// ---------------------------------------------------------------------------
async function handleAdminCashout(event, supabase, driverId, body) {
  if (!isUuid(driverId)) return jsonResponse(400, { error: 'invalid driver_id' });
  const method = body?.method === 'instant' ? 'instant' : 'standard';

  const { data: driver, error: dErr } = await supabase
    .from('drivers')
    .select('id, profile_id, stripe_connect_account_id, stripe_payouts_enabled')
    .eq('id', driverId).maybeSingle();
  if (dErr || !driver) return jsonResponse(404, { error: 'driver not found' });

  const { _executeCashout } = require('./driver-api');
  const result = await _executeCashout(supabase, driver, {
    method, initiatedByKind: 'admin', initiatedById: null
  });

  await audit(supabase, 'driver_cashout_admin_triggered', {
    driver_id: driverId, method,
    cashout_id: result.body?.cashout_id,
    success: result.statusCode === 200,
    error: result.statusCode !== 200 ? result.body?.error : null
  });

  return jsonResponse(result.statusCode, result.body);
}

// ---------------------------------------------------------------------------
// POST /api/admin/driver-payouts/adjust
// ---------------------------------------------------------------------------
async function handleAdjust(event, supabase, body) {
  const driverId = body.driver_id;
  const amount   = Number(body.amount_cents);
  const kind     = body.kind || 'adjustment';
  const notes    = (body.notes || '').toString().slice(0, 1000);
  const jobId    = body.job_id || null;

  if (!isUuid(driverId)) return jsonResponse(400, { error: 'driver_id must be a UUID' });
  if (!Number.isFinite(amount) || amount === 0) {
    return jsonResponse(400, { error: 'amount_cents must be a nonzero integer' });
  }
  if (!['adjustment','tip','bonus'].includes(kind)) {
    return jsonResponse(400, { error: 'kind must be adjustment|tip|bonus' });
  }
  if (jobId && !isUuid(jobId)) return jsonResponse(400, { error: 'job_id must be a UUID' });

  const { data: inserted, error } = await supabase
    .from('driver_earnings')
    .insert({
      driver_id: driverId, job_id: jobId, amount_cents: Math.trunc(amount),
      kind, notes: notes || `Admin ${kind}`,
      payout_status: 'manual',
      paid_at: new Date().toISOString()
    })
    .select('id')
    .single();
  if (error) return jsonResponse(500, { error: error.message });

  await audit(supabase, 'driver_payout_adjustment', {
    driver_id: driverId, job_id: jobId, amount_cents: Math.trunc(amount),
    kind, earnings_id: inserted?.id, notes
  });

  return jsonResponse(200, { success: true, earnings_id: inserted?.id });
}

// ---------------------------------------------------------------------------
// POST /api/admin/driver-payouts/:earnings_id/retry
// ---------------------------------------------------------------------------
async function handleRetry(event, supabase, earningsId) {
  if (!isUuid(earningsId)) return jsonResponse(400, { error: 'invalid earnings_id' });

  const { data: row, error } = await supabase
    .from('driver_earnings')
    .select('id, driver_id, job_id, amount_cents, payout_status, kind')
    .eq('id', earningsId).maybeSingle();
  if (error || !row) return jsonResponse(404, { error: 'earnings row not found' });
  if (row.payout_status === 'paid')    return jsonResponse(409, { error: 'already paid' });
  if (row.payout_status === 'manual')  return jsonResponse(409, { error: 'manual entry — nothing to retry' });
  // Only retry rows that are explicitly retryable. `pending` rows are
  // ambiguous (a transfer may already be in flight at Stripe with the
  // matching idempotency key but the DB write hasn't landed yet), so we
  // force the operator to use Stripe Dashboard for reconciliation first.
  if (row.payout_status !== 'failed' && row.payout_status !== 'pending_account') {
    return jsonResponse(409, {
      error: `cannot retry status '${row.payout_status}' — only 'failed' or 'pending_account' are retryable`
    });
  }

  const { data: driver } = await supabase
    .from('drivers').select('id, stripe_connect_account_id').eq('id', row.driver_id).maybeSingle();
  if (!driver) return jsonResponse(404, { error: 'driver not found' });
  if (!driver.stripe_connect_account_id) {
    await supabase.from('driver_earnings').update({
      payout_status: 'pending_account', payout_error: 'No Stripe Connect account on file'
    }).eq('id', earningsId);
    return jsonResponse(409, { error: 'driver has no Stripe Connect account' });
  }

  const stripe = getStripe();
  if (!stripe) return jsonResponse(503, { error: 'Stripe not configured' });

  try {
    const transfer = await stripe.transfers.create({
      amount: row.amount_cents, currency: 'usd',
      destination: driver.stripe_connect_account_id,
      description: `MCC Driver payout retry — earnings ${earningsId}`,
      metadata: { driver_id: driver.id, job_id: row.job_id || '', earnings_id: earningsId }
    }, {
      // CRITICAL: reuse the SAME idempotency key Stripe saw on the initial
      // attempt (driver-api.js processJobPayouts). If the first transfer
      // actually succeeded at Stripe but we failed to record it locally,
      // Stripe will return the original transfer instead of double-paying.
      // For base earnings the key is scoped (driver, job); for non-base
      // rows (which shouldn't normally reach retry — they're 'manual') we
      // fall back to (driver, earnings_id).
      idempotencyKey: row.kind === 'base' && row.job_id
        ? `driver-payout-${driver.id}-${row.job_id}`
        : `driver-payout-earnings-${earningsId}`
    });

    await supabase.from('driver_earnings').update({
      payout_status: 'paid', stripe_transfer_id: transfer.id,
      paid_at: new Date().toISOString(), payout_error: null
    }).eq('id', earningsId);

    await audit(supabase, 'driver_payout_retry', {
      earnings_id: earningsId, driver_id: driver.id, job_id: row.job_id,
      amount_cents: row.amount_cents, transfer_id: transfer.id
    });
    return jsonResponse(200, { success: true, transfer_id: transfer.id });
  } catch (e) {
    const msg = (e?.message || 'transfer failed').slice(0, 500);
    await supabase.from('driver_earnings').update({
      payout_status: 'failed', payout_error: msg
    }).eq('id', earningsId);
    await audit(supabase, 'driver_payout_retry_failed', {
      earnings_id: earningsId, driver_id: driver.id, error: msg
    });
    return jsonResponse(502, { error: msg });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/driver-payouts/:earnings_id/mark-paid
// ---------------------------------------------------------------------------
async function handleMarkPaid(event, supabase, earningsId, body) {
  if (!isUuid(earningsId)) return jsonResponse(400, { error: 'invalid earnings_id' });
  const notes = (body.notes || 'Marked paid out-of-band').toString().slice(0, 500);

  const { data: row } = await supabase
    .from('driver_earnings').select('id, payout_status, driver_id, amount_cents')
    .eq('id', earningsId).maybeSingle();
  if (!row) return jsonResponse(404, { error: 'earnings row not found' });
  if (row.payout_status === 'paid') return jsonResponse(409, { error: 'already paid via Stripe' });

  const { error } = await supabase.from('driver_earnings').update({
    payout_status: 'manual', paid_at: new Date().toISOString(),
    payout_error: null, notes
  }).eq('id', earningsId);
  if (error) return jsonResponse(500, { error: error.message });

  await audit(supabase, 'driver_payout_mark_paid', {
    earnings_id: earningsId, driver_id: row.driver_id, amount_cents: row.amount_cents, notes
  });
  return jsonResponse(200, { success: true });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
function stripPrefix(p) {
  return (p || '')
    .replace(/^\/?\.netlify\/functions\/driver-payouts-admin\/?/, '')
    .replace(/^\/?api\/admin\/driver-payouts\/?/, '')
    .replace(/^\/+/, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return jsonResponse(401, { error: 'Unauthorized' });

  const route = stripPrefix(event.path);
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'invalid JSON' }); }
  }

  try {
    if (method === 'GET'  && route === '')        return await handleList(event, supabase);
    if (method === 'POST' && route === 'adjust')  return await handleAdjust(event, supabase, body);

    let m = route.match(/^([0-9a-f-]{36})\/retry$/i);
    if (m && method === 'POST') return await handleRetry(event, supabase, m[1]);
    m = route.match(/^([0-9a-f-]{36})\/mark-paid$/i);
    if (m && method === 'POST') return await handleMarkPaid(event, supabase, m[1], body);
    m = route.match(/^([0-9a-f-]{36})\/cashout$/i);
    if (m && method === 'POST') return await handleAdminCashout(event, supabase, m[1], body);

    return jsonResponse(404, { error: 'not found', route, method });
  } catch (e) {
    console.error('[driver-payouts-admin] error:', e);
    return jsonResponse(500, { error: e.message });
  }
};

module.exports._stripPrefix = stripPrefix;
