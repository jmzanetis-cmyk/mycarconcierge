// Ride (concierge job) cancellation with fault classification and fee charging.
//
// GET  /api/rides/:jobId/cancellation-notice
//   Returns the applicable policy and estimated fee for the booker.
//   No auth required (disclosure shown before booking confirmation).
//
// POST /api/rides/:jobId/cancel
//   Body: { fault, reason, cancelled_by_role }
//   Creates ride_cancellations + cancellation_payouts rows.
//   If FEATURE_CANCELLATION_POLICY=true and fault=driver:
//     • Charges booker $10 per committed driver from wallet (fallback: card TODO)
//     • Applies driver strike (escalating: 1→warning, 2→3-day timeout, 3→offboard)
//   Auth: Bearer token required.
//
// Feature gate: cancellation records are always created; fee charging is gated
// on FEATURE_CANCELLATION_POLICY=true.
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DRIVER_FAULT_FEE_CENTS = 1000; // $10 per committed driver

function sb() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function json(status, body) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
}

function parseJobId(event) {
  const path = (event.path || '').split('?')[0];
  const m = path.match(/\/rides\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

function isNotice(event) {
  return (event.path || '').includes('/cancellation-notice');
}

// Escalate driver strike: 1=warning, 2=3-day timeout, 3+=offboard
async function applyDriverStrike(driverId, supabase) {
  const { data: cancelCount } = await supabase
    .from('ride_cancellations')
    .select('id', { count: 'exact' })
    .eq('fault', 'driver');

  const { data: assignments } = await supabase
    .from('concierge_job_drivers')
    .select('driver_id')
    .eq('driver_id', driverId);

  // Count driver-fault cancellations for this driver
  const { count: strikes } = await supabase
    .from('ride_cancellations')
    .select('*, concierge_job_drivers!inner(driver_id)', { count: 'exact', head: true })
    .eq('concierge_job_drivers.driver_id', driverId)
    .eq('fault', 'driver');

  const strikeCount = (strikes || 0) + 1;

  if (strikeCount >= 3) {
    await supabase.from('drivers').update({ status: 'offboarded' }).eq('id', driverId);
  } else if (strikeCount === 2) {
    const timeoutUntil = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
    await supabase.from('drivers').update({ timeout_until: timeoutUntil }).eq('id', driverId);
  }
  // strike 1: warning only — no automated action; admin notified via log
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

  const jobId = parseJobId(event);
  if (!jobId) return json(400, { error: 'Missing job ID in path' });

  const supabase = sb();

  // ── GET /cancellation-notice ────────────────────────────────────────────────
  if (event.httpMethod === 'GET' && isNotice(event)) {
    const { data: job, error: jErr } = await supabase
      .from('concierge_jobs')
      .select('id, status, tier, scenario, member_id')
      .eq('id', jobId)
      .maybeSingle();

    if (jErr || !job) return json(404, { error: 'Job not found' });

    const { data: assignments } = await supabase
      .from('concierge_job_drivers')
      .select('driver_id')
      .eq('job_id', jobId)
      .in('status', ['assigned', 'en_route', 'on_site']);

    const driverCount = assignments?.length ?? 0;
    const estimatedFee = driverCount > 0
      ? { driver_fault_fee_cents: DRIVER_FAULT_FEE_CENTS * driverCount, driver_count: driverCount }
      : { driver_fault_fee_cents: 0, driver_count: 0 };

    return json(200, {
      policy: {
        fault_types: ['passenger', 'driver', 'none'],
        driver_fault_fee_cents_per_driver: DRIVER_FAULT_FEE_CENTS,
        passenger_fault_fee_cents: 0,
        no_fault_fee_cents: 0,
        notice_window_hours: 2,
      },
      estimated_fee: estimatedFee,
      feature_active: process.env.FEATURE_CANCELLATION_POLICY === 'true',
    });
  }

  // ── POST /cancel ────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Authentication required' });
    const token = authHeader.slice(7);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json(401, { error: 'Invalid or expired token' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    const { fault, reason, cancelled_by_role = 'member' } = body;
    if (!['passenger', 'driver', 'none'].includes(fault)) {
      return json(400, { error: 'fault must be passenger, driver, or none' });
    }
    if (!['member', 'driver', 'admin'].includes(cancelled_by_role)) {
      return json(400, { error: 'Invalid cancelled_by_role' });
    }

    const { data: job, error: jErr } = await supabase
      .from('concierge_jobs')
      .select('id, status, tier, scenario, member_id')
      .eq('id', jobId)
      .maybeSingle();

    if (jErr || !job) return json(404, { error: 'Job not found' });
    if (!['draft','scheduled','confirmed','en_route'].includes(job.status)) {
      return json(409, { error: `Cannot cancel a job with status "${job.status}"` });
    }

    // Check for existing cancellation (idempotency)
    const { data: existing } = await supabase
      .from('ride_cancellations')
      .select('id')
      .eq('concierge_job_id', jobId)
      .maybeSingle();
    if (existing) return json(409, { error: 'Job already cancelled' });

    // Get committed drivers
    const { data: assignments } = await supabase
      .from('concierge_job_drivers')
      .select('driver_id, drivers!inner(id, profile_id)')
      .eq('job_id', jobId)
      .in('status', ['assigned', 'en_route', 'on_site']);

    const driverCount = assignments?.length ?? 0;

    // Create cancellation record
    const cancellationTime = new Date().toISOString();
    const { data: cancellation, error: cErr } = await supabase
      .from('ride_cancellations')
      .insert({
        concierge_job_id:   jobId,
        cancelled_by_id:    user.id,
        cancelled_by_role,
        fault,
        reason:             reason || null,
        cancellation_time:  cancellationTime,
        notice_hours_given: null,
      })
      .select()
      .single();

    if (cErr) return json(500, { error: cErr.message });

    // Update job status
    await supabase.from('concierge_jobs').update({ status: 'cancelled' }).eq('id', jobId);

    const payouts = [];

    // ── Driver-fault fee charging (FEATURE_CANCELLATION_POLICY gate) ─────────
    if (fault === 'driver' && driverCount > 0 && process.env.FEATURE_CANCELLATION_POLICY === 'true') {
      const feeCents = DRIVER_FAULT_FEE_CENTS; // per driver, charged to booker

      for (const asgn of assignments) {
        const driverId = asgn.driver_id ?? asgn.drivers?.id;
        if (!driverId) continue;

        let walletDebitId = null;
        let stripePiId = null;
        let payoutStatus = 'pending';

        // Attempt wallet deduction from booker
        const walletEnabled = process.env.FEATURE_WALLET === 'true';
        if (walletEnabled) {
          const { data: walletRow } = await supabase
            .from('wallet_accounts')
            .select('id, cash_balance_cents, bonus_balance_cents')
            .eq('owner_id', job.member_id)
            .eq('owner_type', 'member')
            .maybeSingle();

          const available = walletRow
            ? (walletRow.cash_balance_cents || 0) + (walletRow.bonus_balance_cents || 0)
            : 0;

          if (available >= feeCents) {
            const { error: wErr } = await supabase.rpc('wallet_spend', {
              p_owner_id:     job.member_id,
              p_owner_type:   'member',
              p_amount_cents: feeCents,
              p_ref_id:       cancellation.id,
              p_description:  `Cancellation fee — driver ${driverId}`,
            });
            if (!wErr) {
              // Get the ledger entry we just created
              const { data: ledgerEntry } = await supabase
                .from('wallet_ledger')
                .select('id')
                .eq('wallet_id', walletRow.id)
                .eq('ref_id', cancellation.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              walletDebitId = ledgerEntry?.id ?? null;
              payoutStatus = 'paid';
            }
          }
        }

        // TODO (card fallback when FEATURE_WALLET off or balance insufficient):
        // Create Stripe PaymentIntent against booker's saved PM.
        // Requires profiles.stripe_customer_id + saved payment method.
        // Left as TODO per spec decision: card-only path TBD.

        const { data: payout, error: pErr } = await supabase
          .from('cancellation_payouts')
          .insert({
            cancellation_id: cancellation.id,
            driver_id:       driverId,
            fee_cents:       feeCents,
            wallet_debit_id: walletDebitId,
            stripe_pi_id:    stripePiId,
            status:          payoutStatus,
          })
          .select()
          .single();

        if (!pErr) payouts.push(payout);

        // Apply driver strike
        try { await applyDriverStrike(driverId, supabase); } catch (e) {
          console.warn('[ride-cancellation] applyDriverStrike error (non-fatal):', e.message);
        }
      }
    }

    return json(200, {
      success: true,
      cancellation_id: cancellation.id,
      payouts_created: payouts.length,
      payouts,
    });
  }

  return json(405, { error: 'Method not allowed' });
};
