// ============================================================================
// provider-admin
//
// Privileged provider lifecycle endpoints. Replaces the browser-side
// supabaseClient.from('profiles').update({ suspension_reason, suspended_at })
// calls in www/admin.js so suspend/activate cannot be performed by anyone who
// just happens to reach the admin page — a valid admin Bearer JWT is required
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
// All routes require a Supabase Bearer JWT with role 'admin' (authenticateBearerAdmin).
// All routes use the service-role Supabase client so they bypass RLS.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const utils = require('./utils');
const { notifySensitiveAuditAction } = require('./_shared/sensitive-audit-alert');
const { audit: sharedAudit } = require('./_shared/audit');

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Local wrapper pre-binds this file's audit flags so the 7 existing call
// sites stay byte-identical (still `await audit(supabase, row)`). Behaviour
// equivalent to the pre-extraction local helper: log on failure AND alert
// ops via alertOnAuditFailure. See netlify/functions/_shared/audit.js.
const audit = (supabase, row) =>
  sharedAudit(supabase, row, {
    alertOnFailure: true,
    logOnFailure: true,
    logPrefix: '[provider-admin]',
  });

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
         <p>You will not receive new bookings while suspended.</p>
         <p><strong>To request reinstatement:</strong> sign in to the provider portal and submit a Corrective Action Response. Our team will review your response and respond with a decision.</p>
         <p>— My Car Concierge</p>`);
    }
    // In-app notification mirrors the email so providers see it on next login.
    try {
      await supabase.from('notifications').insert({
        user_id: p.id, type: 'account_suspended',
        title: 'Account Suspended — Action Required',
        message: `Your provider account has been suspended. Reason: ${reason}. To request reinstatement, submit a Corrective Action Response from your provider portal.`
      });
    } catch (e) { /* non-critical */ }
    // 1c-CAPA: light up the CAR form by flipping car_required + mirroring
    // suspension state on provider_stats (Option A — profiles is source of
    // truth for the bid gate, provider_stats kept in sync for the CAR UI).
    // Best-effort like the audit/email/notification fan-out — the suspension
    // itself has already landed on profiles. Not aggregating complaint
    // reasons in this commit; submit_corrective_action handles null
    // primary_complaint_reason gracefully ('unspecified' fallback).
    try {
      await supabase.from('provider_stats').upsert({
        provider_id:      p.id,
        car_required:     true,
        suspended:        true,
        suspended_reason: reason,
        suspended_at:     suspendedAt
      }, { onConflict: 'provider_id' });
    } catch (e) {
      console.error('[suspendProviders] provider_stats CAR upsert failed:', e.message);
    }
  }));

  return { updated: updatedIdsArr.length, failed, updated_ids: updatedIdsArr };
}

async function activateProviders(supabase, providerIds, opts = {}) {
  const updatedIdsArr = [];
  const failed = [];
  const adminOverride = !!opts.adminOverride;

  // 1c-CAPA: lenient CAR guard. If a provider has provider_stats.car_required=true
  // AND no corrective_action_responses row with status='approved', refuse to
  // reinstate via this route — push into failed[] with a clear message. The
  // intent is that the CAR review flow (review_corrective_action) is the
  // canonical reinstatement path; bulk Activate is for clean rollbacks or
  // admin overrides. adminOverride=true bypasses the guard entirely.
  if (!adminOverride && providerIds.length > 0) {
    const { data: statsRows, error: statsErr } = await supabase
      .from('provider_stats')
      .select('provider_id, car_required')
      .in('provider_id', providerIds);
    if (statsErr) {
      return {
        updated: 0,
        failed: providerIds.map(id => ({ id, error: 'provider_stats check failed: ' + statsErr.message })),
        updated_ids: []
      };
    }
    const carRequiredIds = new Set(
      (statsRows || []).filter(r => r.car_required === true).map(r => r.provider_id)
    );

    let approvedCarProviderIds = new Set();
    if (carRequiredIds.size > 0) {
      const { data: carRows, error: carErr } = await supabase
        .from('corrective_action_responses')
        .select('provider_id')
        .in('provider_id', Array.from(carRequiredIds))
        .eq('status', 'approved');
      if (carErr) {
        return {
          updated: 0,
          failed: providerIds.map(id => ({ id, error: 'CAR check failed: ' + carErr.message })),
          updated_ids: []
        };
      }
      approvedCarProviderIds = new Set((carRows || []).map(r => r.provider_id));
    }

    const allowedIds = [];
    for (const id of providerIds) {
      if (carRequiredIds.has(id) && !approvedCarProviderIds.has(id)) {
        failed.push({ id, error: 'car_required but no approved CAR — pass admin_override to bypass' });
      } else {
        allowedIds.push(id);
      }
    }
    if (allowedIds.length === 0) {
      return { updated: 0, failed, updated_ids: [] };
    }
    providerIds = allowedIds;
  }

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

  // 1c-CAPA: keep provider_stats in sync (Option A — profiles is source of
  // truth; provider_stats mirrored so the CAR UI stays accurate). Best-effort.
  // review_corrective_action's approve branch also performs this clear when
  // it lifts the suspension; running it again here is idempotent.
  if (updatedIdsArr.length > 0) {
    try {
      await supabase.from('provider_stats').update({
        suspended:            false,
        suspended_reason:     null,
        suspension_lifted_at: new Date().toISOString(),
        car_required:         false
      }).in('provider_id', updatedIdsArr);
    } catch (e) {
      console.error('[activateProviders] provider_stats clear failed:', e.message);
    }
  }

  return { updated: updatedIdsArr.length, failed, updated_ids: updatedIdsArr };
}

// Step 1b — verifyProviders mirrors suspendProviders/activateProviders.
// Sets profiles.verification_status='verified' for the given ids, then fans
// out audit + sensitive-action notification + email + in-app notification
// per provider. All side effects are best-effort and non-fatal — the verify
// itself has already landed by the time any of them fire.
// Returns the standard contract: { updated, failed: [{id,error}], updated_ids }.
async function verifyProviders(supabase, providerIds, reason) {
  const updatedIdsArr = [];
  const failed = [];
  const verifiedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update({ verification_status: 'verified' })
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

  await Promise.all((data || []).map(async (p) => {
    await audit(supabase, {
      action: 'verify_provider',
      target_id: p.id, target_type: 'profile',
      reason: reason || null,
      metadata: { verified_at: verifiedAt },
      performed_by: 'admin'
    });
    await notifySensitiveAuditAction({
      action: 'verify_provider',
      target: `${p.full_name || p.business_name || p.email || p.id}`,
      reason: reason || null,
      performedBy: 'admin',
      metadata: { provider_id: p.id }
    });
    if (p.email) {
      await sendEmail(p.email,
        "You're verified to place bids on My Car Concierge",
        `<p>Hi ${p.full_name || p.business_name || 'there'},</p>
         <p>Your provider account on My Car Concierge has been verified by our team. You can now place bids on open care plans through the provider portal.</p>
         ${reason ? `<p>Notes from the admin team:</p><blockquote style="border-left:3px solid #4ade80; padding-left:12px; color:#555;">${reason}</blockquote>` : ''}
         <p>— My Car Concierge</p>`);
    }
    try {
      await supabase.from('notifications').insert({
        user_id: p.id, type: 'account_verified',
        title: 'Account Verified',
        message: "You're verified to place bids on My Car Concierge. Open the provider portal to start bidding."
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
  // 1c-CAPA: body.admin_override bypasses the CAR-required guard inside
  // activateProviders. Admin UI prompt is a follow-up; backend support now.
  const adminOverride = !!body.admin_override;
  const result = await activateProviders(supabase, ids, { adminOverride });
  return jsonResponse(200, result);
}

// Step 1b — admin Verify Provider action. Sets verification_status='verified'
// on profiles, which is the entry gate referenced by plan_bids / care_plans
// RLS and the /api/plan-bids endpoint. Reason is optional.
async function _handleVerifyProvider(supabase, body) {
  const ids = _collectProviderIds(body);
  if (ids.length < 1 || ids.length > 100) return jsonResponse(400, { error: 'provider_ids must be 1-100 valid uuids' });
  const reason = (body.reason || '').toString().trim().slice(0, 500);
  const result = await verifyProviders(supabase, ids, reason);
  return jsonResponse(200, result);
}

// Step 1c — flag-for-admin-review (no auto-suspend). Aggregates from the live
// provider_reviews table via the low_rated_providers RPC (migration
// 20260620_low_rated_providers_rpc.sql). Default thresholds match the build
// plan: avg rating < 3.0 stars AND at least 10 published reviews. Caller may
// override either via body.rating_threshold / body.min_reviews. Returns the
// candidate list only — admins act on it through the existing manual Suspend
// flow (which sets role='suspended' after the Step 1c admin.js fix).
async function _handleCheckLowRated(supabase, body) {
  const thresholdRaw  = Number(body.rating_threshold);
  const minReviewsRaw = Number(body.min_reviews);
  const threshold     = Number.isFinite(thresholdRaw)  && thresholdRaw  > 0 ? thresholdRaw  : 3.0;
  const minReviews    = Number.isFinite(minReviewsRaw) && minReviewsRaw >= 1
    ? Math.floor(minReviewsRaw)
    : 10;

  const { data: candidates, error: rpcErr } = await supabase.rpc('low_rated_providers', {
    p_threshold:   threshold,
    p_min_reviews: minReviews
  });
  if (rpcErr) return jsonResponse(500, { error: rpcErr.message });

  let flagged = [];
  const candidateIds = (candidates || []).map(c => c.provider_id);
  if (candidateIds.length > 0) {
    // Hide providers already suspended — don't re-flag what an admin already actioned.
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, business_name, email')
      .in('id', candidateIds)
      .is('suspension_reason', null)
      .neq('role', 'suspended');
    if (profErr) return jsonResponse(500, { error: profErr.message });

    const byId = new Map(candidates.map(c => [c.provider_id, c]));
    flagged = (profiles || []).map(p => ({
      id:           p.id,
      name:         p.business_name || p.full_name || 'Unnamed',
      email:        p.email,
      avg_rating:   Number(byId.get(p.id).avg_rating),
      review_count: byId.get(p.id).review_count
    }));
  }

  await audit(supabase, {
    action:       'check_low_rated',
    target_type:  'profile',
    metadata:     { threshold, min_reviews: minReviews, found: flagged.length },
    performed_by: 'admin'
  });

  return jsonResponse(200, {
    found:       flagged.length,
    threshold,
    min_reviews: minReviews,
    providers:   flagged
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
  'POST verify':               _handleVerifyProvider,     // Step 1b — verification entry gate
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
