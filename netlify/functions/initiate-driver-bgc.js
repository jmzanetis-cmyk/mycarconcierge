// initiate-driver-bgc.js
//
// POST /api/admin/driver-bgc
// Body: { profile_id: uuid }
//
// Admin-only endpoint that orders a background check for a pending driver.
// Uses the same BGC_LIVE_MODE / BGC_API_TOKEN pattern as initiate-background-check.js
// but targets the `drivers` table instead of `provider_employees`.
//
// BGC status lifecycle in `drivers.bgc_status`:
//   not_started → pending_check → passed | consider | failed
//
// The result is written back by background-check-webhook.js when BGC posts
// the completed report.

'use strict';

const { createSupabaseClient, authenticateBearerAdmin } = require('./utils');

const BGC_API_BASE    = process.env.BGC_API_BASE    || 'https://app.backgroundchecks.com/api';
const BGC_DEFAULT_SKU = process.env.BGC_DEFAULT_REPORT_SKU || 'HIRE1';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resp(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function isLiveMode() {
  return String(process.env.BGC_LIVE_MODE || '').toLowerCase() === 'true';
}

async function orderBgcReport(email) {
  const apiKey = process.env.BGC_API_TOKEN;
  if (!apiKey) throw Object.assign(new Error('BGC_API_TOKEN not set'), { code: 'no_api_token' });

  const url = `${BGC_API_BASE}/orders/new?api_token=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accepts: 'application/json' },
    body: JSON.stringify({
      report_sku:       BGC_DEFAULT_SKU,
      order_quantity:   1,
      applicant_emails: [email],
      terms_agree:      'Y',
    }),
  });
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!r.ok) {
    const err = Object.assign(new Error('bgc_order_failed'), { upstreamStatus: r.status, upstreamBody: parsed });
    throw err;
  }
  const applicant = Array.isArray(parsed.applicants) ? parsed.applicants[0] : null;
  const reportKey = applicant?.report_key;
  if (!reportKey) {
    throw Object.assign(new Error('bgc_no_report_key'), { upstreamStatus: r.status, upstreamBody: parsed });
  }
  return { reportKey, inviteUrl: applicant?.applicant_invite_url || null };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST')  return resp(405, { error: 'Method not allowed' });

  const supabase = createSupabaseClient();
  if (!supabase) return resp(500, { error: 'db_unavailable' });

  const admin = await authenticateBearerAdmin(event, supabase);
  if (!admin) return resp(401, { error: 'Unauthorized' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'Invalid JSON' }); }
  const { profile_id } = body;
  if (!profile_id) return resp(400, { error: 'profile_id required' });

  // Fetch the driver's profile for email / name
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', profile_id)
    .maybeSingle();
  if (!profile) return resp(404, { error: 'Profile not found' });
  if (profile.role !== 'pending_driver') return resp(400, { error: 'Profile is not a pending_driver' });
  if (!profile.email) return resp(400, { error: 'Driver has no email address' });

  // Ensure a drivers row exists (signup-driver.html creates one, but guard)
  const { data: driverRow } = await supabase
    .from('drivers')
    .select('id, bgc_status')
    .eq('profile_id', profile_id)
    .maybeSingle();

  let reportId, inviteUrl, mocked;

  if (!isLiveMode()) {
    mocked   = true;
    reportId = 'mock_drv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    inviteUrl = null;
    console.warn('[driver-bgc] BGC_LIVE_MODE not set — mocked report', reportId);

    // Alert admin about mock mode
    const to = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
    const rk = process.env.RESEND_API_KEY;
    if (to && rk) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${rk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com',
          to,
          subject: '[MCC] Driver BGC ordered in MOCK mode',
          html: `<p>A driver background check was ordered in MOCK mode. Set <code>BGC_LIVE_MODE=true</code> to activate live checks.</p><p>Driver profile: ${profile_id}</p><p>Mock report ID: ${reportId}</p>`,
        }),
      }).catch(() => {});
    }
  } else {
    try {
      ({ reportKey: reportId, inviteUrl } = await orderBgcReport(profile.email));
      mocked = false;
    } catch (e) {
      console.error('[driver-bgc] BGC API error:', e.upstreamStatus, JSON.stringify(e.upstreamBody || e.message));
      if (e.code === 'no_api_token') return resp(400, { error: 'BGC_API_TOKEN not configured' });
      return resp(502, { error: 'bgc_initiation_failed', upstream_status: e.upstreamStatus, upstream_body: e.upstreamBody });
    }
  }

  // Upsert the drivers row with BGC fields
  if (driverRow) {
    await supabase
      .from('drivers')
      .update({ bgc_status: 'pending_check', bgc_report_id: reportId, bgc_invite_url: inviteUrl, bgc_checked_at: new Date().toISOString() })
      .eq('profile_id', profile_id);
  } else {
    await supabase.from('drivers').insert({
      profile_id,
      full_name:            profile.full_name || '',
      email:                profile.email,
      phone:                '',
      status:               'pending',
      vehicle_class:        [],
      hourly_rate_cents:    0,
      per_job_rate_cents:   0,
      stripe_payouts_enabled: false,
      total_ratings:        0,
      total_rides_completed: 0,
      bgc_status:           'pending_check',
      bgc_report_id:        reportId,
      bgc_invite_url:       inviteUrl,
      bgc_checked_at:       new Date().toISOString(),
    });
  }

  return resp(200, { success: true, bgc_report_id: reportId, bgc_invite_url: inviteUrl, mocked });
};
