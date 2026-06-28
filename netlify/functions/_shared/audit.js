'use strict';

// Shared admin_audit_log writer. Extracted from the duplicated local audit()
// helpers that lived in provider-admin.js, provider-application-review.js,
// provider-application.js, concierge-jobs-public.js, and apollo-admin.js so
// every privilege-sensitive admin endpoint AND every money-path operation
// writes audit rows through the same path.
//
// Behaviour contract:
//   1. NEVER throws. A failed audit write or alert MUST NOT propagate up
//      into the caller's transaction. Payment / capture / payout / transfer
//      flows must succeed even if both the audit write AND the failure-alert
//      fail. Inner alertOnAuditFailure call is wrapped in its own try/catch
//      as belt-and-suspenders (the alert helper has its own try/catch too).
//   2. Failure handling is parameterised so each caller preserves its exact
//      pre-extraction behaviour:
//        provider-admin.js              → alertOnFailure: true,  logOnFailure: true
//        provider-application-review.js → alertOnFailure: false, logOnFailure: true
//        apollo-admin.js                → alertOnFailure: false, logOnFailure: true
//        provider-application.js        → alertOnFailure: false, logOnFailure: false
//        concierge-jobs-public.js       → alertOnFailure: false, logOnFailure: false
//      Money-path callers default to { alertOnFailure: true, logOnFailure: true }
//      — these are the highest-stakes audits and a failed write needs to page ops.
//   3. logPrefix preserves each caller's original console.error prefix so log
//      aggregation / grep patterns continue to work unchanged.
//   4. row shape unchanged: { action, target_id, target_type, reason, metadata,
//      performed_by } — matches the admin_audit_log table from
//      supabase/migrations/20260424_admin_audit_log.sql.

const { alertOnAuditFailure } = require('../../../lib/audit-warning-alert');

async function audit(supabase, row, options = {}) {
  const {
    alertOnFailure = false,
    logOnFailure = true,
    logPrefix = '[audit]',
  } = options;

  try {
    await supabase.from('admin_audit_log').insert(row);
  } catch (e) {
    if (logOnFailure) {
      console.error(`${logPrefix} audit write failed:`, e.message);
    }
    if (alertOnFailure) {
      try {
        await alertOnAuditFailure(supabase, {
          action: row.action || 'unknown',
          targetType: row.target_type || null,
          targetId: row.target_id || null,
          metadata: row.metadata || null,
          error: e,
        });
      } catch {
        // Belt-and-suspenders: alertOnAuditFailure already swallows its own
        // errors, but if a future change removes that, this catch ensures
        // the caller's money operation still completes.
      }
    }
  }
}

module.exports = { audit };
