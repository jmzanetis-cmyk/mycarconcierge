// ============================================================================
// provider-application-review
//
// Privileged endpoints for reviewing provider applications. Replaces the
// browser-side supabaseClient.from('provider_applications').update(...) /
// supabaseClient.from('profiles').update({ role: 'provider' }) writes in
// www/admin.js (`approveApplication`, `rejectApplication`, `requestMoreInfo`)
// so an admin browser session is no longer trusted to mutate
// provider_applications or arbitrary profiles.role rows.
//
// Routes (mounted at /.netlify/functions/provider-application-review/* and
// proxied from /api/admin/provider-application/* via www/_redirects):
//
//   POST /approve       { application_id, admin_notes?, reviewed_by?,
//                         license_verified?, insurance_verified?,
//                         certifications_verified?, reviews_checked?,
//                         references_contacted? }
//   POST /reject        { application_id, reason, admin_notes?, reviewed_by? }
//   POST /request-info  { application_id, info_requested,
//                         admin_notes?, reviewed_by? }
//
// All routes require the x-admin-password (or x-admin-token) header to match
// ADMIN_PASSWORD. All routes use the service-role Supabase client so they
// bypass RLS, and every action writes an admin_audit_log row.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { notifySensitiveAuditAction } = require('./_shared/sensitive-audit-alert');
const utils = require('./utils');

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'My Car Concierge <noreply@mycarconcierge.com>';

// Best-effort email send. Returns boolean. Never throws — Task #238 requires
// that notification failures do not roll back the underlying status change.
async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return true;
  } catch (e) {
    console.error('[provider-application-review] email send failed:', e.message);
    return false;
  }
}

// Best-effort in-app notification insert. Mirrors the suspend/activate pattern
// in provider-admin.js so applicants see the status change next time they log
// in even if email delivery fails.
async function notify(supabase, userId, type, title, message) {
  if (!userId) return false;
  try {
    // Supabase reports insert failures via the returned { error } object
    // rather than by throwing, so we have to inspect both the response and
    // any thrown exception to avoid silently swallowing failures.
    const { error } = await supabase.from('notifications').insert({ user_id: userId, type, title, message });
    if (error) {
      console.error('[provider-application-review] notification insert failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[provider-application-review] notification insert threw:', e.message);
    return false;
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function greetingName(app) {
  return app.contact_name || app.business_name || 'there';
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Admin-Password, x-admin-password',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Local wrapper around the shared audit helper, pre-bound to this file's
// pre-extraction behaviour: log on failure, no ops alert. See
// netlify/functions/_shared/audit.js.
const { audit: sharedAudit } = require('./_shared/audit');
const audit = (supabase, row) =>
  sharedAudit(supabase, row, {
    alertOnFailure: false,
    logOnFailure: true,
    logPrefix: '[provider-application-review]',
  });

// Load the application; returns { app, error } where error is a jsonResponse
// suitable for returning directly from the handler when the lookup fails.
async function loadApplication(supabase, applicationId) {
  const { data, error } = await supabase
    .from('provider_applications')
    .select('id, user_id, business_name, contact_name, email, status, admin_notes')
    .eq('id', applicationId)
    .single();
  if (error || !data) {
    return { app: null, error: jsonResponse(404, { error: 'application not found' }) };
  }
  return { app: data, error: null };
}

async function approveApplication(supabase, body) {
  const applicationId = body.application_id;
  if (!isUuid(applicationId)) return jsonResponse(400, { error: 'application_id (uuid) required' });

  const { app, error: loadErr } = await loadApplication(supabase, applicationId);
  if (loadErr) return loadErr;

  const reviewedBy = isUuid(body.reviewed_by) ? body.reviewed_by : null;
  const reviewedAt = new Date().toISOString();
  const adminNotes = typeof body.admin_notes === 'string' ? body.admin_notes : null;

  const updateRow = {
    status: 'approved',
    admin_notes: adminNotes,
    reviewed_by: reviewedBy,
    reviewed_at: reviewedAt,
    license_verified:        !!body.license_verified,
    insurance_verified:      !!body.insurance_verified,
    certifications_verified: !!body.certifications_verified,
    reviews_checked:         !!body.reviews_checked,
    references_contacted:    !!body.references_contacted
  };

  // Order matters here: promote profile role FIRST. If that fails we abort
  // the approval entirely so we never end up with an "approved" application
  // whose user still has the wrong role. Retrying the approve is safe — the
  // role update is idempotent (it just re-asserts role = 'provider'), and
  // the application status update only runs once role promotion has
  // succeeded. If the application status update fails afterward, the role
  // is already correct and a retry will simply complete the status flip.
  if (app.user_id) {
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ role: 'provider' })
      .eq('id', app.user_id);
    if (profileErr) {
      console.error('[provider-application-review] profile role update failed:', profileErr.message);
      return jsonResponse(500, {
        error: 'failed to promote applicant to provider role',
        details: profileErr.message
      });
    }
  }

  const { error: updateErr } = await supabase
    .from('provider_applications')
    .update(updateRow)
    .eq('id', applicationId);
  if (updateErr) {
    // Profile role was already flipped to 'provider' above. Surface that in
    // the error so the operator knows a retry is safe (role flip is
    // idempotent) and the only thing left is the status update.
    console.error('[provider-application-review] application status update failed:', updateErr.message);
    return jsonResponse(500, {
      error: 'failed to update application status (profile role was already promoted; safe to retry)',
      details: updateErr.message,
      profile_role_promoted: true
    });
  }

  // Create the provider_stats row. Best-effort — if it already exists or the
  // insert otherwise errors we still consider the approval successful, but
  // log the error so it shows up in observability rather than disappearing.
  let providerStatsError = null;
  if (app.user_id) {
    const { error: statsErr } = await supabase
      .from('provider_stats')
      .insert({ provider_id: app.user_id });
    if (statsErr) {
      providerStatsError = statsErr.message;
      console.error('[provider-application-review] provider_stats insert failed:', statsErr.message);
    }
  }

  await audit(supabase, {
    action: 'approve_provider_application',
    target_id: applicationId,
    target_type: 'provider_application',
    metadata: {
      user_id: app.user_id,
      business_name: app.business_name,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt,
      verifications: {
        license:        updateRow.license_verified,
        insurance:      updateRow.insurance_verified,
        certifications: updateRow.certifications_verified,
        reviews:        updateRow.reviews_checked,
        references:     updateRow.references_contacted
      },
      provider_stats_error: providerStatsError
    },
    performed_by: 'admin'
  });
  // Task #427 — admin notification for sensitive action
  await notifySensitiveAuditAction({
    action: 'approve_provider_application',
    target: app.business_name || app.email || applicationId,
    performedBy: reviewedBy || 'admin',
    metadata: { application_id: applicationId, user_id: app.user_id }
  });

  // Task #238 — best-effort applicant notification (email + in-app row).
  // Failures must not roll back the approval; we already have the status
  // change committed and audited above.
  const approveSubject = 'Welcome to My Car Concierge — your provider application is approved';
  const approveHtml =
    `<p>Hi ${escapeHtml(greetingName(app))},</p>
     <p>Great news — your provider application${app.business_name ? ` for <strong>${escapeHtml(app.business_name)}</strong>` : ''} has been approved on My Car Concierge.</p>
     <p>You can now sign in and head to your provider dashboard to start receiving booking opportunities, set up your service offerings, and complete any optional onboarding steps.</p>
     <p><a href="https://mycarconcierge.com/providers.html" style="display:inline-block;padding:10px 18px;background:#b8942d;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Open your provider dashboard</a></p>
     <p>Welcome aboard,<br/>— My Car Concierge</p>`;
  await sendEmail(app.email, approveSubject, approveHtml);
  await notify(supabase, app.user_id, 'provider_application_approved',
    'Provider application approved',
    'Your provider application has been approved. Visit your provider dashboard to get started.');

  return jsonResponse(200, {
    application_id: applicationId,
    status: 'approved',
    user_id: app.user_id,
    provider_stats_error: providerStatsError
  });
}

async function rejectApplicationFn(supabase, body) {
  const applicationId = body.application_id;
  if (!isUuid(applicationId)) return jsonResponse(400, { error: 'application_id (uuid) required' });
  const reason = (body.reason || '').toString().trim();
  if (reason.length < 3 || reason.length > 1000) {
    return jsonResponse(400, { error: 'reason must be 3-1000 characters' });
  }

  const { app, error: loadErr } = await loadApplication(supabase, applicationId);
  if (loadErr) return loadErr;

  const reviewedBy = isUuid(body.reviewed_by) ? body.reviewed_by : null;
  const reviewedAt = new Date().toISOString();
  const adminNotes = typeof body.admin_notes === 'string' ? body.admin_notes : null;

  const { error: updateErr } = await supabase
    .from('provider_applications')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      admin_notes: adminNotes,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt
    })
    .eq('id', applicationId);
  if (updateErr) {
    return jsonResponse(500, { error: 'failed to update application', details: updateErr.message });
  }

  await audit(supabase, {
    action: 'reject_provider_application',
    target_id: applicationId,
    target_type: 'provider_application',
    reason,
    metadata: {
      user_id: app.user_id,
      business_name: app.business_name,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt
    },
    performed_by: 'admin'
  });
  // Task #427 — admin notification for sensitive action
  await notifySensitiveAuditAction({
    action: 'reject_provider_application',
    target: app.business_name || app.email || applicationId,
    reason,
    performedBy: reviewedBy || 'admin',
    metadata: { application_id: applicationId, user_id: app.user_id }
  });

  // Task #238 — best-effort applicant notification (email + in-app row).
  const rejectSubject = 'Update on your My Car Concierge provider application';
  const rejectHtml =
    `<p>Hi ${escapeHtml(greetingName(app))},</p>
     <p>Thank you for applying to become a provider on My Car Concierge${app.business_name ? ` with <strong>${escapeHtml(app.business_name)}</strong>` : ''}. After review, we are unable to approve your application at this time for the following reason:</p>
     <blockquote style="border-left:3px solid #b8942d;padding-left:12px;color:#555;">${escapeHtml(reason)}</blockquote>
     <p>If you believe this was in error or you'd like to address the issue and reapply, please reply to this email and our team will be glad to help.</p>
     <p>— My Car Concierge</p>`;
  await sendEmail(app.email, rejectSubject, rejectHtml);
  await notify(supabase, app.user_id, 'provider_application_rejected',
    'Provider application not approved',
    `Your provider application was not approved. Reason: ${reason}`);

  return jsonResponse(200, { application_id: applicationId, status: 'rejected' });
}

async function requestApplicationInfo(supabase, body) {
  const applicationId = body.application_id;
  if (!isUuid(applicationId)) return jsonResponse(400, { error: 'application_id (uuid) required' });
  const infoRequested = (body.info_requested || '').toString().trim();
  if (infoRequested.length < 3 || infoRequested.length > 2000) {
    return jsonResponse(400, { error: 'info_requested must be 3-2000 characters' });
  }

  const { app, error: loadErr } = await loadApplication(supabase, applicationId);
  if (loadErr) return loadErr;

  // Append the request line to whatever admin_notes the client passed (the
  // current value of the textarea). Falling back to the row's stored notes
  // keeps the original behavior if the client didn't send any.
  const baseNotes = typeof body.admin_notes === 'string'
    ? body.admin_notes
    : (app.admin_notes || '');
  const newNotes = `${baseNotes || ''}\n\nRequested: ${infoRequested}`;

  const reviewedBy = isUuid(body.reviewed_by) ? body.reviewed_by : null;

  const { error: updateErr } = await supabase
    .from('provider_applications')
    .update({
      status: 'more_info_needed',
      admin_notes: newNotes
    })
    .eq('id', applicationId);
  if (updateErr) {
    return jsonResponse(500, { error: 'failed to update application', details: updateErr.message });
  }

  await audit(supabase, {
    action: 'request_application_info',
    target_id: applicationId,
    target_type: 'provider_application',
    metadata: {
      user_id: app.user_id,
      business_name: app.business_name,
      info_requested: infoRequested,
      reviewed_by: reviewedBy
    },
    performed_by: 'admin'
  });

  // Task #238 — best-effort applicant notification (email + in-app row).
  const infoSubject = 'We need a bit more information on your My Car Concierge application';
  const infoHtml =
    `<p>Hi ${escapeHtml(greetingName(app))},</p>
     <p>Thanks for applying to become a provider on My Car Concierge${app.business_name ? ` with <strong>${escapeHtml(app.business_name)}</strong>` : ''}. Before we can finish reviewing your application, our team needs the following:</p>
     <blockquote style="border-left:3px solid #b8942d;padding-left:12px;color:#555;white-space:pre-wrap;">${escapeHtml(infoRequested)}</blockquote>
     <p>Please reply to this email with the requested details and we'll pick the review back up as soon as we receive them.</p>
     <p>— My Car Concierge</p>`;
  await sendEmail(app.email, infoSubject, infoHtml);
  await notify(supabase, app.user_id, 'provider_application_info_requested',
    'More information requested on your application',
    `Our team needs more information on your provider application: ${infoRequested}`);

  return jsonResponse(200, { application_id: applicationId, status: 'more_info_needed' });
}

// Batched fetch of originating outreach lead rows for the admin
// provider-application review queue (Task #189). The browser admin client
// uses the anon JWT, so it cannot SELECT from outreach_leads (RLS only
// grants service_role). This endpoint accepts the small set of
// outreach_lead_id values referenced by the currently-loaded applications
// and returns just the columns needed to render the source badge and the
// detail-modal "Originating Lead" block. Read-only — never mutates.
async function listOutreachLeads(supabase, body) {
  const rawIds = Array.isArray(body?.lead_ids) ? body.lead_ids : [];
  // Dedupe + filter to UUIDs so a malformed id can't slip into the IN clause.
  const ids = Array.from(new Set(rawIds.filter(isUuid)));
  if (!ids.length) return jsonResponse(200, { leads: [] });
  // Hard cap: the admin queue is paginated client-side, but defend against a
  // pathological payload regardless.
  if (ids.length > 500) {
    return jsonResponse(400, { error: 'too many lead_ids (max 500)' });
  }

  const { data, error } = await supabase
    .from('outreach_leads')
    .select('id, name, source, location, type, created_at, status, email')
    .in('id', ids);
  if (error) {
    return jsonResponse(500, { error: 'failed to load outreach leads', details: error.message });
  }
  return jsonResponse(200, { leads: data || [] });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  // TODO: add auth test coverage (test-debt, no existing test to update)
  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  // Strip both the netlify-functions prefix and the proxy prefix so the same
  // handler works from either entry point.
  const route = (event.path || '')
    .replace(/^\/?\.netlify\/functions\/provider-application-review\/?/, '')
    .replace(/^\/?api\/admin\/provider-application\/?/, '')
    .replace(/^\/+/, '');
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'invalid JSON body' }); }
  }

  try {
    if (route === 'approve' && method === 'POST') {
      return await approveApplication(supabase, body);
    }
    if (route === 'reject' && method === 'POST') {
      return await rejectApplicationFn(supabase, body);
    }
    if (route === 'request-info' && method === 'POST') {
      return await requestApplicationInfo(supabase, body);
    }
    if (route === 'outreach-leads' && method === 'POST') {
      return await listOutreachLeads(supabase, body);
    }
    return jsonResponse(404, { error: 'Not found', path: route, method });
  } catch (e) {
    console.error('[provider-application-review] handler error:', e);
    return jsonResponse(500, { error: e.message });
  }
};
