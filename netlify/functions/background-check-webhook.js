// ─────────────────────────────────────────────────────────────────────────────
// Task #112 + Task #372 — BackgroundChecks.com inbound webhook
//
// Validates HMAC-SHA256 signature against BGC_WEBHOOK_SECRET, normalises the
// status (handling both BGC's letter codes A/P/C and our legacy
// long-form values), sets expires_at = completed_at + 12 months, updates
// the matching employee_background_checks row, and recomputes provider
// compliance.
//
// BGC report status enum (per developer docs):
//   A = Awaiting Applicant   → 'pending'
//   P = Pending (in progress) → 'pending'
//   C = Complete              → 'clear' (or 'consider' when
//                                flagged_for_end_user_review === true)
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('node:crypto');
const { createSupabaseClient } = require('./utils');

function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.BGC_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[BGC webhook] BGC_WEBHOOK_SECRET not configured; rejecting until set.');
    return false;
  }
  if (!signatureHeader) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Allow either raw hex or "sha256=<hex>" formats.
  const provided = String(signatureHeader).replace(/^sha256=/i, '').trim();
  return timingSafeHexEqual(computed, provided);
}

// Map BGC's letter codes + our legacy long-form values to our canonical enum
// (`pending|clear|consider|failed|expired`). The BGC `flagged_for_end_user_review`
// flag escalates a Complete (C) to `consider` so the badge math doesn't count
// it as a clean check.
function normaliseStatus(rawStatus, flagged) {
  const s = String(rawStatus || '').trim();
  // BGC letter codes
  if (s === 'A' || s === 'P') return 'pending';
  if (s === 'C') return flagged ? 'consider' : 'clear';
  // Legacy long-form values (kept for the existing mock-webhook tests and for
  // any non-BGC sources that still post into this endpoint).
  const lower = s.toLowerCase();
  if (['clear', 'clean', 'passed', 'complete', 'completed'].includes(lower)) {
    return flagged ? 'consider' : 'clear';
  }
  if (['consider', 'review', 'pending_review'].includes(lower)) return 'consider';
  if (['pending', 'awaiting', 'in_progress', 'processing'].includes(lower)) return 'pending';
  if (['expired'].includes(lower)) return 'expired';
  return 'failed';
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,x-signature,x-hook-signature',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const rawBody = event.body || '';
  const headers = event.headers || {};
  const sig = headers['x-signature'] || headers['X-Signature']
           || headers['x-hook-signature'] || headers['X-Hook-Signature']
           || headers['x-clearchecks-signature'] || headers['X-ClearChecks-Signature'];

  if (!verifySignature(rawBody, sig)) {
    console.warn('[BGC webhook] Invalid signature');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // BGC sends `report_key`; legacy mocks may send `report_id` / `id`.
  const reportId = payload.report_key || payload.report_id || payload.id || payload.reportId;
  if (!reportId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing report ID' }) };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    // 5xx so BGC keeps retrying — don't swallow webhooks during transient
    // infra/config issues.
    console.error('[BGC webhook] Supabase client unavailable; asking sender to retry');
    return { statusCode: 503, body: JSON.stringify({ error: 'db_unavailable' }) };
  }

  const flagged = payload.flagged_for_end_user_review === true
               || payload.flagged === true;
  const status = normaliseStatus(payload.status || payload.result, flagged);
  const completedAt = payload.completed_at || new Date().toISOString();
  const expires = new Date(completedAt);
  expires.setFullYear(expires.getFullYear() + 1);

  // Only set completed_at / expires_at when the check is actually complete —
  // a transient A→P transition shouldn't move the expiry clock.
  const updateRow = { status };
  if (status !== 'pending') {
    updateRow.completed_at = completedAt;
    updateRow.expires_at = expires.toISOString();
  }

  const { data: rec, error: updErr } = await supabase
    .from('employee_background_checks')
    .update(updateRow)
    .eq('bgc_report_id', reportId)
    .select('provider_id, employee_id')
    .maybeSingle();

  if (updErr) {
    console.error('[BGC webhook] DB update failed:', updErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'db_update_failed' }) };
  }

  // If no employee_background_checks row matched, try the drivers table.
  if (!rec) {
    const driverBgcStatus = { clear: 'passed', consider: 'consider', pending: 'pending_check', expired: 'failed' }[status] ?? 'failed';
    const driverUpdate = { bgc_status: driverBgcStatus };
    if (status !== 'pending') driverUpdate.bgc_checked_at = completedAt;

    const { data: driverRec, error: driverErr } = await supabase
      .from('drivers')
      .update(driverUpdate)
      .eq('bgc_report_id', reportId)
      .select('profile_id')
      .maybeSingle();

    if (driverErr) {
      console.error('[BGC webhook] drivers DB update failed:', driverErr.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'db_update_failed' }) };
    }
    if (!driverRec) {
      console.warn('[BGC webhook] No record found for report', reportId);
      return { statusCode: 200, body: JSON.stringify({ received: true, error: 'unknown_report' }) };
    }

    console.log('[BGC webhook] Driver BGC updated:', driverRec.profile_id, driverBgcStatus);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true, status: driverBgcStatus, driver_profile_id: driverRec.profile_id })
    };
  }

  const { error: rpcErr } = await supabase.rpc('calculate_provider_compliance', {
    p_provider_id: rec.provider_id
  });
  if (rpcErr) {
    console.error('[BGC webhook] Compliance RPC failed:', rpcErr.message);
  }

  // ── Task #113 — auto-resolve alerts when a new clear arrives ───────────
  if (status === 'clear') {
    await supabase
      .from('provider_alerts')
      .update({ resolved_at: new Date().toISOString() })
      .eq('employee_id', rec.employee_id)
      .in('alert_type', ['bgc_expiring', 'bgc_expired'])
      .is('resolved_at', null);

    if (!rpcErr) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('bgc_badge_verified')
        .eq('id', rec.provider_id)
        .maybeSingle();
      if (prof?.bgc_badge_verified) {
        await supabase
          .from('provider_alerts')
          .update({ resolved_at: new Date().toISOString() })
          .eq('provider_id', rec.provider_id)
          .eq('alert_type', 'compliance_lost')
          .is('resolved_at', null);
      }
    }
  }

  // ── Task #123 — emit Gatekeeper input event ────────────────────────────
  try {
    const { error: emitDbErr } = await supabase.from('agent_events').insert({
      event_type: 'provider.bgc_completed',
      payload: {
        provider_id: rec.provider_id,
        employee_id: rec.employee_id,
        bgc_report_id: reportId,
        status,
        flagged,
        completed_at: status === 'pending' ? null : completedAt,
        expires_at: status === 'pending' ? null : expires.toISOString()
      },
      source: 'webhook:background-check'
    });
    if (emitDbErr) {
      console.error('[BGC webhook] agent_events emit failed (non-fatal):', emitDbErr.message);
    }
  } catch (emitErr) {
    console.error('[BGC webhook] agent_events emit threw (non-fatal):', emitErr.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      received: true,
      status,
      flagged,
      provider_id: rec.provider_id,
      employee_id: rec.employee_id
    })
  };
};

// Exported for unit tests (Task #372 smoke suite).
exports._normaliseStatus = normaliseStatus;
exports._verifySignature = verifySignature;
