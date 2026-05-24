'use strict';

// Task #394 — Bid credit grant helper extracted from www/server.js so the
// Stripe webhook path is independently unit-testable AND so the same
// failure-logging shape is reused by the reconciliation scheduled function.
//
// Contract for `grantBidCredits`:
//   Returns { ok: true, alreadyGranted: boolean, newCredits?: number }
//   Returns { ok: false, code, message, stage } on any DB failure. The caller
//   MUST translate this into an HTTP 5xx response (so Stripe retries the
//   webhook with idempotency) — never swallow into a 200.
//
// On any failure the helper also writes an escalated row to `ai_action_log`
// (module='bid_credit_grant_failure') so admins are alerted via the existing
// AI Ops surface even if Stripe's own retries eventually succeed.

const FAILURE_MODULE = 'bid_credit_grant_failure';

async function logGrantFailure(supabase, { stage, providerId, transactionId, totalBids, packId, error }) {
  try {
    await supabase.from('ai_action_log').insert({
      module: FAILURE_MODULE,
      action_type: stage,
      target_id: String(transactionId || ''),
      decision: {
        provider_id: providerId,
        transaction_id: transactionId,
        total_bids: totalBids,
        pack_id: packId || null,
        error_message: error?.message || null,
        error_code: error?.code || null,
        recommendation: 'Stripe webhook returned 5xx so Stripe will retry. If retries exhaust, manually grant bid credits and insert a bid_credit_grants row.',
      },
      confidence: 1.0,
      auto_executed: false,
      escalated: true,
      outcome: 'failed',
      error_details: error?.message || error?.code || 'unknown',
      execution_time_ms: 0,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort: never let the alert-log write mask the original failure.
  }
}

async function grantBidCredits(supabase, { providerId, totalBids, packId, transactionId, requestId, logger }) {
  const log = logger || console;
  if (!supabase) {
    return { ok: false, code: 'no_supabase', message: 'Supabase not configured', stage: 'precheck' };
  }
  if (!providerId || !transactionId || !(totalBids > 0)) {
    return { ok: false, code: 'bad_input', message: 'providerId, transactionId, and totalBids>0 are required', stage: 'precheck' };
  }

  const { error: grantInsertError } = await supabase
    .from('bid_credit_grants')
    .insert({ transaction_id: transactionId, provider_id: providerId, total_bids: totalBids, pack_id: packId || null });

  if (grantInsertError) {
    if (grantInsertError.code === '23505') {
      log.log(`[${requestId}] Bid credits already granted for transaction ${transactionId} (bid_credit_grants row exists). Skipping to preserve idempotency.`);
      return { ok: true, alreadyGranted: true };
    }
    log.error(`[${requestId}] bid_credit_grants insert failed for ${providerId} (txn ${transactionId}):`, grantInsertError);
    await logGrantFailure(supabase, { stage: 'grant_insert_failed', providerId, transactionId, totalBids, packId, error: grantInsertError });
    return {
      ok: false,
      code: grantInsertError.code || 'bid_credit_grant_log_failed',
      message: grantInsertError.message || grantInsertError.code || 'unknown',
      stage: 'grant_insert_failed',
    };
  }

  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('bid_credits')
    .eq('id', providerId)
    .single();

  if (fetchError) {
    log.error(`[${requestId}] Bid credit fetch failed for ${providerId} (txn ${transactionId}):`, fetchError);
    await supabase.from('bid_credit_grants').delete().eq('transaction_id', transactionId);
    await logGrantFailure(supabase, { stage: 'profile_fetch_failed', providerId, transactionId, totalBids, packId, error: fetchError });
    return {
      ok: false,
      code: fetchError.code || 'bid_credit_fetch_failed',
      message: fetchError.message || fetchError.code || 'unknown',
      stage: 'profile_fetch_failed',
    };
  }

  const currentCredits = profile?.bid_credits || 0;
  const newCredits = currentCredits + totalBids;
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ bid_credits: newCredits })
    .eq('id', providerId);

  if (updateError) {
    log.error(`[${requestId}] Bid credit update failed for ${providerId} (txn ${transactionId}):`, updateError);
    await supabase.from('bid_credit_grants').delete().eq('transaction_id', transactionId);
    await logGrantFailure(supabase, { stage: 'profile_update_failed', providerId, transactionId, totalBids, packId, error: updateError });
    return {
      ok: false,
      code: updateError.code || 'bid_credit_update_failed',
      message: updateError.message || updateError.code || 'unknown',
      stage: 'profile_update_failed',
    };
  }

  log.log(`[${requestId}] Bid credits updated: ${currentCredits} -> ${newCredits} (+${totalBids}) for provider ${providerId}, txn ${transactionId}`);
  return { ok: true, alreadyGranted: false, newCredits };
}

module.exports = { grantBidCredits, logGrantFailure, FAILURE_MODULE };
