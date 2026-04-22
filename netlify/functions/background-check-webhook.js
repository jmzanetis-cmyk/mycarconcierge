// ─────────────────────────────────────────────────────────────────────────────
// Task #112 — BackgroundChecks.com inbound webhook (employee-level checks)
//
// Validates HMAC-SHA256 signature against BGC_WEBHOOK_SECRET, normalises the
// status, sets expires_at = completed_at + 12 months, updates the matching
// employee_background_checks row, and recomputes provider compliance.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
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
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  return timingSafeHexEqual(computed, provided);
}

function normaliseStatus(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (['clear', 'clean', 'passed', 'complete', 'completed'].includes(s)) return 'clear';
  if (['consider', 'review', 'pending_review'].includes(s)) return 'consider';
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
           || headers['x-hook-signature'] || headers['X-Hook-Signature'];

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

  const reportId = payload.report_id || payload.id || payload.reportId;
  if (!reportId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing report ID' }) };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    // Return 5xx so BGC keeps retrying — DO NOT swallow webhooks during
    // transient infra/config issues.
    console.error('[BGC webhook] Supabase client unavailable; asking sender to retry');
    return { statusCode: 503, body: JSON.stringify({ error: 'db_unavailable' }) };
  }

  const status = normaliseStatus(payload.status || payload.result);
  const completedAt = payload.completed_at || new Date().toISOString();
  const expires = new Date(completedAt);
  expires.setFullYear(expires.getFullYear() + 1);

  const { data: rec, error: updErr } = await supabase
    .from('employee_background_checks')
    .update({
      status,
      completed_at: completedAt,
      expires_at: expires.toISOString()
    })
    .eq('bgc_report_id', reportId)
    .select('provider_id, employee_id')
    .maybeSingle();

  if (updErr) {
    console.error('[BGC webhook] DB update failed:', updErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'db_update_failed' }) };
  }
  if (!rec) {
    console.warn('[BGC webhook] No record found for report', reportId);
    // Still 200 so BGC stops retrying; we just don't know about this one.
    return { statusCode: 200, body: JSON.stringify({ received: true, error: 'unknown_report' }) };
  }

  const { error: rpcErr } = await supabase.rpc('calculate_provider_compliance', {
    p_provider_id: rec.provider_id
  });
  if (rpcErr) {
    console.error('[BGC webhook] Compliance RPC failed:', rpcErr.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      received: true,
      status,
      provider_id: rec.provider_id,
      employee_id: rec.employee_id
    })
  };
};
