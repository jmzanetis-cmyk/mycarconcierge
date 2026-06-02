// ============================================================================
// provider-admin
//
// Privileged provider lifecycle endpoints. Replaces the browser-side
// supabaseClient.from('profiles').update({ suspension_reason, suspended_at })
// calls in www/admin.js so suspend/activate cannot be performed by anyone who
// just happens to reach the admin page — the ADMIN_PASSWORD header is required
// and every action leaves an admin_audit_log row.
//
// Routes (mounted at /.netlify/functions/provider-admin/* and proxied from
// /api/admin/provider-actions/* via www/_redirects):
//
//   POST /suspend           { provider_ids: uuid[], reason: string }
//   POST /activate          { provider_ids: uuid[] }
//   POST /check-low-rated   { rating_threshold?: number, autosuspend?: boolean, reason?: string }
//   POST /adjust-credits    { provider_ids: uuid[], delta: integer, reason?: string }
//
// All routes require the x-admin-password header to match ADMIN_PASSWORD.
// All routes use the service-role Supabase client so they bypass RLS.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const utils = require('./utils');
const { notifySensitiveAuditAction } = require('./_shared/sensitive-audit-alert');
const { alertOnAuditFailure } = require('../../lib/audit-warning-alert');

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'My Car Concierge <noreply@mycarconcierge.com>';

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

// Best-effort audit row writer. Never throws — audit failures must not block the
// privileged action they describe (the action already happened).
async function audit(supabase, row) {
  try {
    await supabase.from('admin_audit_log').insert(row);
  } catch (e) {
    console.error('[provider-admin] audit write failed:', e.message);
    await alertOnAuditFailure(supabase, {
      action: row.action || 'unknown',
      targetType: row.target_type || 'provider',
      targetId: row.target_id || null,
      metadata: row.metadata || null,
      error: e,
    });
  }
}

// Best-effort email send. Returns boolean. Never throws.
async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return true;
  } catch (e) {
    console.error('[provider-admin] email send failed:', e.message);
    return false;
  }
}

async function suspendProviders(supabase, providerIds, reason, source = 'manual', opts = {}) {
  // Returns { updated: N, failed: [{id,error}], updated_ids: [...] } per the
  // task spec contract. updated_ids is included for the admin UI's audit trail
  // but the canonical "did it work" signal is the numeric `updated` count.
  const updatedIdsArr = [];
  const failed = [];
  const suspendedAt = new Date().toISOString();
  // Task #127 — when set_role_suspended is true, also flip profiles.role
  // to 'suspended', which is what fires the Gatekeeper Postgres trigger
  // shipped in Task #123.
  const setRoleSuspended = !!opts.setRoleSuspended;

  const updateRow = { suspension_reason: reason, suspended_at: suspendedAt };
  if (setRoleSuspended) updateRow.role = 'suspended';

  // Batch update in a single statement — atomic for the matched rows.
  const { data, error } = await supabase
    .from('profiles')
    .update(updateRow)
    .in('id', providerIds)
    .select('id, email, full_name, business_name');

  if (error) {
    return { updated: 0, failed: providerIds.map(id => ({ id, error: error.message })), updated_ids: [] };
  }

  const returnedIds = new Set((data || []).map(r => r.id));
  for (const id of providerIds) {
    if (returnedIds.has(id)) updatedIdsArr.push(id);
    else failed.push({ id, error: 'profile not found' });
  }

  // Fan out: audit + email + notification per provider. All best-effort, in
  // parallel. Email failures must not roll back the suspend.
  const suspendAction = source === 'autosuspend' ? 'autosuspend_low_rated' : 'suspend_provider';
  await Promise.all((data || []).map(async (p) => {
    await audit(supabase, {
      action: suspendAction,
      target_id: p.id, target_type: 'profile',
      reason, metadata: { source, suspended_at: suspendedAt },
      performed_by: 'admin'
    });
    // Task #427 — admin notification for sensitive action
    await notifySensitiveAuditAction({
      action: suspendAction,
      target: `${p.full_name || p.business_name || p.email || p.id}`,
      reason,
      performedBy: 'admin',
      metadata: { provider_id: p.id, source }
    });
    if (p.email) {
      await sendEmail(p.email,
        'Your My Car Concierge provider account has been suspended',
        `<p>Hi ${p.full_name || p.business_name || 'there'},</p>
         <p>Your provider account on My Car Concierge has been suspended for the following reason:</p>
         <blockquote style="border-left:3px solid #b8942d; padding-left:12px; color:#555;">${reason}</blockquote>
         <p>You will not receive new bookings while suspended. Please reply to this email or contact support if you'd like to discuss reinstatement.</p>
         <p>— My Car Concierge</p>`);
    }
    // In-app notification mirrors the email so providers see it on next login.
    try {
      await supabase.from('notifications').insert({
        user_id: p.id, type: 'account_suspended',
        title: 'Account Suspended',
        message: `Your provider account has been suspended. Reason: ${reason}`
      });
    } catch (e) { /* non-critical */ }
  }));

  return { updated: updatedIdsArr.length, failed, updated_ids: updatedIdsArr };
}

async function activateProviders(supabase, providerIds) {
  const updatedIdsArr = [];
  const failed = [];

  // Task #127 — also pull `role` so we can restore profiles whose role was
  // flipped to 'suspended' by the suspend route. Without this the netlify
  // (proxied) activate path leaves the role at 'suspended', diverging from
  // the in-process www/server.js behavior.
  const { data, error } = await supabase
    .from('profiles')
    .update({ suspension_reason: null, suspended_at: null })
    .in('id', providerIds)
    .select('id, email, full_name, business_name, role');

  if (error) {
    return { updated: 0, failed: providerIds.map(id => ({ id, error: error.message })), updated_ids: [] };
  }

  const returnedIds = new Set((data || []).map(r => r.id));
  for (const id of providerIds) {
    if (returnedIds.has(id)) updatedIdsArr.push(id);
    else failed.push({ id, error: 'profile not found' });
  }

  // Restore role only for profiles currently sitting at 'suspended' so we
  // don't accidentally promote a member or otherwise change a non-suspended role.
  const suspendedRoleIds = (data || []).filter(p => p.role === 'suspended').map(p => p.id);
  if (suspendedRoleIds.length > 0) {
    try {
      await supabase.from('profiles').update({ role: 'provider' }).in('id', suspendedRoleIds);
    } catch (e) { console.error('[provider-admin] role restore failed:', e.message); }
  }

  await Promise.all((data || []).map(async (p) => {
    await audit(supabase, {
      action: 'activate_provider',
      target_id: p.id, target_type: 'profile',
      performed_by: 'admin'
    });
    // Task #427 — admin notification for sensitive action
    await notifySensitiveAuditAction({
      action: 'activate_provider',
      target: `${p.full_name || p.business_name || p.email || p.id}`,
      performedBy: 'admin',
      metadata: { provider_id: p.id }
    });
    if (p.email) {
      await sendEmail(p.email,
        'Your My Car Concierge provider account is reactivated',
        `<p>Hi ${p.full_name || p.business_name || 'there'},</p>
         <p>Good news — your provider account has been reactivated. You'll start receiving new booking opportunities again right away.</p>
         <p>— My Car Concierge</p>`);
    }
    try {
      await supabase.from('notifications').insert({
        user_id: p.id, type: 'account_reactivated',
        title: 'Account Reactivated',
        message: 'Your provider account has been reactivated and you will receive new bookings.'
      });
    } catch (e) { /* non-critical */ }
  }));

  return { updated: updatedIdsArr.length, failed, updated_ids: updatedIdsArr };
}

// Apply a signed integer delta to profiles.bid_credits for each provider id.
// Returns { updated, failed: [{id,error}], updated_ids, results: [{id, before, after, delta}] }.
// We read current values then write per-row so we can:
//   * audit the before/after balance for each provider, and
//   * skip rows whose resulting balance would be negative (returned in failed).
// The race window between read and write is acceptable for an infrequent
// admin action; the audit row records the values actually written.
async function adjustCredits(supabase, providerIds, delta, reason) {
  const { data: rows, error: readErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, business_name, bid_credits')
    .in('id', providerIds);

  if (readErr) {
    return { updated: 0, failed: providerIds.map(id => ({ id, error: readErr.message })), updated_ids: [], results: [] };
  }

  const byId = new Map((rows || []).map(r => [r.id, r]));
  const updatedIdsArr = [];
  const failed = [];
  const results = [];

  for (const id of providerIds) {
    const row = byId.get(id);
    if (!row) {
      failed.push({ id, error: 'profile not found' });
      continue;
    }
    const before = isFinite(row.bid_credits) ? row.bid_credits : 0;
    const after = before + delta;
    if (after < 0) {
      failed.push({ id, error: `would make balance negative (current=${before}, delta=${delta})` });
      continue;
    }

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ bid_credits: after })
      .eq('id', id);

    if (updErr) {
      failed.push({ id, error: updErr.message });
      continue;
    }

    updatedIdsArr.push(id);
    results.push({ id, before, after, delta });

    await audit(supabase, {
      action: 'adjust_bid_credits',
      target_id: id, target_type: 'profile',
      reason: reason || null,
      metadata: { before, after, delta },
      performed_by: 'admin'
    });
  }

  return { updated: updatedIdsArr.length, failed, updated_ids: updatedIdsArr, results };
}

// Collect ids from both `provider_id` (singular) and `provider_ids` (array)
// so callers can use either shape (kept for the proxied per-provider routes).
function _collectProviderIds(body) {
  const rawIds = [];
  if (typeof body.provider_id === 'string') rawIds.push(body.provider_id);
  if (Array.isArray(body.provider_ids)) rawIds.push(...body.provider_ids);
  return Array.from(new Set(rawIds.filter(isUuid)));
}

async function _handleSuspend(supabase, body) {
  const ids = _collectProviderIds(body);
  const reason = (body.reason || '').toString().trim();
  const setRoleSuspended = !!body.set_role_suspended;
  if (ids.length < 1 || ids.length > 100) return jsonResponse(400, { error: 'provider_ids must be 1-100 valid uuids' });
  if (reason.length < 5 || reason.length > 500) return jsonResponse(400, { error: 'reason must be 5-500 characters' });
  const result = await suspendProviders(supabase, ids, reason, 'manual', { setRoleSuspended });
  return jsonResponse(200, result);
}

async function _handleActivate(supabase, body) {
  const ids = _collectProviderIds(body);
  if (ids.length < 1 || ids.length > 100) return jsonResponse(400, { error: 'provider_ids must be 1-100 valid uuids' });
  const result = await activateProviders(supabase, ids);
  return jsonResponse(200, result);
}

async function _handleCheckLowRated(supabase, body) {
  const threshold = isFinite(body.rating_threshold) ? body.rating_threshold : 4;
  const autosuspend = !!body.autosuspend;
  const reason = (body.reason || `Rating below ${threshold} stars - automatic suspension`).toString().trim();

  const { data: stats, error: statsErr } = await supabase
    .from('provider_stats')
    .select('provider_id, average_rating, suspended')
    .lt('average_rating', threshold)
    .not('average_rating', 'is', null);
  if (statsErr) return jsonResponse(500, { error: statsErr.message });

  const candidateIds = (stats || []).filter(s => !s.suspended).map(s => s.provider_id);
  let profiles = [];
  if (candidateIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, business_name, email, suspension_reason')
      .in('id', candidateIds)
      .is('suspension_reason', null);
    if (error) return jsonResponse(500, { error: error.message });
    profiles = data || [];
  }
  const ratingByProviderId = new Map((stats || []).map(s => [s.provider_id, s.average_rating]));
  const lowRated = profiles.map(p => ({ ...p, avg_rating: ratingByProviderId.get(p.id) }));

  await audit(supabase, {
    action: 'check_low_rated',
    target_type: 'profile',
    metadata: { threshold, found: lowRated.length, autosuspend },
    performed_by: 'admin'
  });

  const providerSummaries = lowRated.map(p => ({ id: p.id, name: p.business_name || p.full_name, avg_rating: p.avg_rating }));
  if (autosuspend && lowRated.length > 0) {
    const result = await suspendProviders(supabase, lowRated.map(p => p.id), reason, 'autosuspend');
    return jsonResponse(200, {
      found: lowRated.length, threshold,
      providers: providerSummaries,
      autosuspend: true,
      suspended: result.updated, failed: result.failed
    });
  }
  return jsonResponse(200, {
    found: lowRated.length, threshold,
    providers: providerSummaries,
    autosuspend: false
  });
}

// Task #240: server-side handler for the "approve provider application"
// flow. Replaces the browser-side `supabaseClient.from('profiles').update({
// role: 'provider', is_founding_provider: true, ... })` call in
// www/admin.js so the last unaudited admin write to profiles can be
// removed and the "Admins can update any profile" RLS policy dropped.
//
// Body: {
//   application_id: uuid                        // pilot_applications row to mark approved
//   profile_id?: uuid                           // existing profile to upgrade (skipped if absent)
//   business_name, business_phone, city, state  // applicant fields copied to profile
//   approved_by?: uuid                          // current admin user id (audit)
// }
async function _handleApproveApplication(supabase, body) {
  const applicationId = String(body.application_id || '').trim();
  const profileId = body.profile_id ? String(body.profile_id).trim() : null;
  const approvedBy = body.approved_by ? String(body.approved_by).trim() : null;
  if (!isUuid(applicationId)) return jsonResponse(400, { error: 'application_id must be a valid uuid' });
  if (profileId && !isUuid(profileId)) return jsonResponse(400, { error: 'profile_id must be a valid uuid' });
  if (approvedBy && !isUuid(approvedBy)) return jsonResponse(400, { error: 'approved_by must be a valid uuid' });

  const businessName = (body.business_name || '').toString().trim().slice(0, 200);
  const businessPhone = (body.business_phone || '').toString().trim().slice(0, 50);
  const city = (body.city || '').toString().trim().slice(0, 100);
  const state = (body.state || '').toString().trim().slice(0, 100);

  // 1) Mark the pilot_applications row approved.
  const { error: appErr } = await supabase
    .from('pilot_applications')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: approvedBy
    })
    .eq('id', applicationId);
  if (appErr) return jsonResponse(500, { error: 'Failed to mark application approved: ' + appErr.message });

  // 2) Upgrade the matched profile (if one exists) to a founding provider.
  let profileUpdated = false;
  if (profileId) {
    const profileUpdate = { role: 'provider', is_founding_provider: true };
    if (businessName) profileUpdate.business_name = businessName;
    if (businessPhone) profileUpdate.business_phone = businessPhone;
    if (city) profileUpdate.city = city;
    if (state) profileUpdate.state = state;
    const { error: profErr } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', profileId);
    if (profErr) return jsonResponse(500, { error: 'Failed to upgrade profile: ' + profErr.message });
    profileUpdated = true;

    // Ensure a provider_stats row exists. Best-effort — don't fail the
    // whole flow if this single upsert errors.
    try {
      await supabase.from('provider_stats').upsert({ provider_id: profileId }, { onConflict: 'provider_id' });
    } catch (e) {
      console.error('[provider-admin] provider_stats upsert failed:', e.message);
    }
  }

  await audit(supabase, {
    action: 'approve_provider_application',
    target_id: profileId || applicationId,
    target_type: profileId ? 'profile' : 'pilot_application',
    metadata: {
      application_id: applicationId,
      profile_id: profileId,
      profile_updated: profileUpdated,
      business_name: businessName || null,
      city: city || null,
      state: state || null
    },
    performed_by: approvedBy || 'admin'
  });

  return jsonResponse(200, { ok: true, profile_updated: profileUpdated });
}

// Task #240: server-side handler for the member↔provider role flip in the
// admin User Management tab. Replaces the browser-side
// `supabaseClient.from('profiles').update({ role: ..., also_member: ...,
// also_provider: ... })` call in www/admin.js's updateUserRole().
//
// Body: {
//   user_id: uuid,
//   role: 'member' | 'provider' | null,            // optional canonical role
//   also_member?: boolean,                          // optional dual-role flags
//   also_provider?: boolean,
//   actor_id?: uuid                                 // current admin user id (audit)
// }
async function _handleUpdateUserRole(supabase, body) {
  const userId = String(body.user_id || '').trim();
  const actorId = body.actor_id ? String(body.actor_id).trim() : null;
  if (!isUuid(userId)) return jsonResponse(400, { error: 'user_id must be a valid uuid' });
  if (actorId && !isUuid(actorId)) return jsonResponse(400, { error: 'actor_id must be a valid uuid' });

  // Whitelisted role-related boolean flags. The schema currently has both
  // legacy `also_member`/`also_provider` and `is_also_member`/`is_also_provider`
  // columns in active use across admin.js (the role-flip table writes the
  // first pair, the dual-role checkboxes write the second). Allow either.
  const BOOL_FIELDS = ['also_member', 'also_provider', 'is_also_member', 'is_also_provider', 'is_founding_provider'];
  const updates = {};
  if (body.role === 'member' || body.role === 'provider') updates.role = body.role;
  for (const field of BOOL_FIELDS) {
    if (typeof body[field] === 'boolean') updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return jsonResponse(400, { error: 'no role fields to update' });
  }

  // Snapshot the prior values so the audit row records what changed.
  const { data: before, error: beforeErr } = await supabase
    .from('profiles')
    .select(['role', ...BOOL_FIELDS].join(','))
    .eq('id', userId)
    .maybeSingle();
  if (beforeErr) return jsonResponse(500, { error: 'Failed to load profile: ' + beforeErr.message });
  if (!before) return jsonResponse(404, { error: 'profile not found' });

  const { error: updErr } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  if (updErr) return jsonResponse(500, { error: 'Failed to update role: ' + updErr.message });

  await audit(supabase, {
    action: 'update_user_role',
    target_id: userId,
    target_type: 'profile',
    metadata: {
      before: { role: before.role, also_member: before.also_member, also_provider: before.also_provider },
      after: { ...before, ...updates }
    },
    performed_by: actorId || 'admin'
  });

  return jsonResponse(200, { ok: true, updated: updates });
}

async function _handleAdjustCredits(supabase, body) {
  const ids = _collectProviderIds(body);
  if (ids.length < 1 || ids.length > 100) return jsonResponse(400, { error: 'provider_ids must be 1-100 valid uuids' });

  // delta must be a finite, non-zero integer within sensible bounds.
  const delta = Number(body.delta);
  if (!Number.isInteger(delta) || delta === 0) return jsonResponse(400, { error: 'delta must be a non-zero integer' });
  if (delta < -10000 || delta > 10000) return jsonResponse(400, { error: 'delta must be between -10000 and 10000' });

  const reason = (body.reason || '').toString().trim();
  if (reason.length > 500) return jsonResponse(400, { error: 'reason must be at most 500 characters' });

  const result = await adjustCredits(supabase, ids, delta, reason);
  return jsonResponse(200, result);
}

// Dispatch map: "METHOD route" → handler(supabase, body). Matches the
// pattern used by agent-fleet-admin.js (Task #260) so future routes are
// added by a single table entry instead of another `if` branch.
const ROUTES = {
  'POST suspend':              _handleSuspend,
  'POST activate':             _handleActivate,
  'POST check-low-rated':      _handleCheckLowRated,
  'POST adjust-credits':       _handleAdjustCredits,
  'POST approve-application':  _handleApproveApplication, // Task #240
  'POST update-user-role':     _handleUpdateUserRole      // Task #240
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return jsonResponse(401, { error: 'Unauthorized' });

  const route = (event.path || '')
    .replace(/^\/?\.netlify\/functions\/provider-admin\/?/, '')
    .replace(/^\/?api\/admin\/provider-actions\/?/, '')
    .replace(/^\/+/, '');
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'invalid JSON body' }); }
  }

  const handler = ROUTES[`${method} ${route}`];
  if (!handler) return jsonResponse(404, { error: 'Not found', path: route, method });

  try {
    return await handler(supabase, body);
  } catch (e) {
    console.error('[provider-admin] handler error:', e);
    return jsonResponse(500, { error: e.message });
  }
};
