'use strict';

// Task #411 — Real-time alert when admin_audit_log write fails after Stripe
// has moved money.
//
// When an admin_audit_log INSERT fails the usual "best-effort / swallow"
// pattern silently drops the audit trail. In financial flows (payout retry,
// admin cashout) that creates a gap between what Stripe recorded and what
// the platform can audit. This helper writes an escalated ai_action_log row
// instead so the admin AI-Ops surface picks it up even if the audit table is
// temporarily unavailable.
//
// Usage:
//   const { alertOnAuditFailure } = require('../../lib/audit-warning-alert');
//   try {
//     await supabase.from('admin_audit_log').insert({...});
//   } catch (e) {
//     await alertOnAuditFailure(supabase, { action, targetType, targetId, metadata, error: e });
//   }
//
// Modelled on lib/bid-credit-grants.js (ai_action_log + escalated=true pattern).

const FAILURE_MODULE = 'audit_log_failure';

async function alertOnAuditFailure(supabase, { action, targetType, targetId, metadata, error }) {
  if (!supabase) return;
  try {
    await supabase.from('ai_action_log').insert({
      module: FAILURE_MODULE,
      action_type: action || 'unknown',
      target_id: String(targetId || ''),
      decision: {
        target_type: targetType || null,
        metadata: metadata || null,
        error_message: error?.message || String(error) || 'unknown',
        error_code: error?.code || null,
        recommendation:
          'admin_audit_log INSERT failed after a financial operation. ' +
          'Verify the action succeeded in Stripe Dashboard and manually backfill ' +
          'an audit row if the write failure was transient.',
      },
      confidence: 1.0,
      auto_executed: false,
      escalated: true,
      outcome: 'failed',
      error_details: (error?.message || String(error) || 'unknown').slice(0, 500),
      execution_time_ms: 0,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Double-fail: ai_action_log itself is unavailable. Console is the last resort.
    console.error('[audit-warning-alert] CRITICAL: both admin_audit_log and ai_action_log writes failed', {
      action, targetType, targetId, error: error?.message,
    });
  }
}

module.exports = { alertOnAuditFailure, FAILURE_MODULE };
