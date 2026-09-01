// ============================================================================
// MCC — Upsell / Additional Work Approval Flow
//
// The "Additional Work" surface was live in the UI (members-core.js:1235-1531,
// providers.js:2005-2075 + 3418-3618) but silently broken end-to-end since the
// Express→Netlify migration: the client wrote to upsell_requests (missing the
// money-path columns) and approve/decline just flipped a status field —
// no PaymentIntent was ever created or captured. Members clicked Approve
// believing they'd authorized the charge; providers did the extra work and
// were never paid for it.
//
// This handler is the money-path backend, built against additional_work_requests
// (which already has estimated_cost NOT NULL / payment_intent_id / captured_at /
// capture_error) as extended by migration 20260901a.
//
// Routes (mapped in www/_redirects):
//   POST   /api/upsell                          — provider submits an upsell/update request
//   POST   /api/upsell/:id/approve              — member approves; creates manual-capture PI
//   POST   /api/upsell/:id/confirm-authorization — member confirmed card via Stripe.js (reconcile)
//   POST   /api/upsell/:id/decline              — member declines; cancels PI if authorized
//   POST   /api/upsell/:id/respond              — non-money member action (acknowledge/reply/request_call)
//   POST   /api/upsell/:id/suspend-work         — provider suspends work after member miss-window
//   GET    /api/upsell/mine                     — member's own upsell list
//   GET    /api/upsell/for-package/:package_id  — participant view for one job
//
// Capture happens later, inside care-plans.js handleComplete — that handler
// iterates every approved supplemental PI on the same care_plan and captures
// them idempotently. A per-row failure records capture_error + notifies both
// parties but does NOT block the base job's completion.
//
// Pattern matches care-plans.js:
//   - manual-capture PaymentIntent at member-approve time
//   - reviewer-guard bypasses Stripe entirely for App Store reviewer accounts
//   - service-role Supabase client (RLS bypass); auth checked via bearer JWT
//   - audit log on every money-touching action
// ============================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
const { audit: sharedAudit } = require('./_shared/audit');
const { isReviewerAccount } = require('./_shared/reviewer-guard');
const { dispatchBidAcceptedPush } = require('./notifications-bid-accepted-push');

// Money-path audit wrapper — mirrors care-plans.js.
const audit = (supabase, row) =>
  sharedAudit(supabase, row, {
    alertOnFailure: true,
    logOnFailure: true,
    logPrefix: '[upsell]',
  });

function supabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function stripRoute(path) {
  return (path || '').replace(/.*\/api\/upsell\/?/, '').replace(/\/$/, '');
}

// Shape validators — kept small and inline, mirroring care-plans.js style.
const UPDATE_TYPES = ['cost_increase', 'car_ready', 'work_paused', 'question', 'request_call'];
const URGENCY_LEVELS = ['critical', 'recommended', 'optional'];
const RESPOND_ACTIONS = ['acknowledge', 'reply', 'request_call'];

function isValidUuid(s) {
  return typeof s === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Resolve the care_plan_id for a given maintenance_packages id, if any.
// The two tables are dual-written by savePackage() but have no FK; join on
// (member_id, title). This is fragile by design — if a member happens to have
// two care_plans with the same title, we can't distinguish. Nullable on
// purpose: the money path enforces non-null below (visible 400 error, "no
// care_plan found — use non-money update type"), non-money update_types
// tolerate null.
//
// FAIL-SAFE ON AMBIGUITY: if the (member_id, title) query returns >1 row,
// return null so callers route into the money-path error branch — a
// wrong-but-loud failure is fine; wrong-and-silent (picking whichever row
// happens to be newest and attaching a supplemental PI to it) is not.
// Prospective risk only right now: prod has zero duplicate (member_id, title)
// pairs on care_plans today (checked 2026-09-01), but nothing in the schema
// prevents one from appearing tomorrow. The durable fix is a real FK from
// maintenance_packages → care_plans populated at savePackage() time; flagged
// as a fast-follow, not built here.
async function resolveCarePlanId(sb, packageId, memberId) {
  const { data: pkg } = await sb
    .from('maintenance_packages')
    .select('id, title, member_id')
    .eq('id', packageId)
    .maybeSingle();
  if (!pkg) return null;
  const targetMember = memberId || pkg.member_id;
  if (!targetMember) return null;
  // Ambiguity-safe lookup: fetch up to 2 rows and treat >1 as unresolved.
  const { data: candidates, error } = await sb
    .from('care_plans')
    .select('id, provider_id, stripe_payment_intent_id, provider_stripe_account_id, status, title')
    .eq('member_id', targetMember)
    .eq('title', pkg.title)
    .order('created_at', { ascending: false })
    .limit(2);
  if (error || !candidates || candidates.length === 0) return null;
  if (candidates.length > 1) {
    console.warn(
      '[upsell] care_plan resolution ambiguous — refusing to guess. member_id=%s, title=%s, candidate_count=%d',
      targetMember, pkg.title, candidates.length
    );
    return null;
  }
  return candidates[0];
}

// Fire-and-forget notification pair (in-app row + push). Non-fatal — a
// notification failure never blocks a money operation.
async function notifyUser(sb, { userId, callerId, type, title, message, entityId, planTitle, amount }) {
  if (!userId) return;
  try {
    await sb.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      entity_type: 'additional_work_request',
      entity_id: entityId || null,
    });
  } catch (err) {
    console.warn('[upsell] in-app notification insert failed:', err.message);
  }
  // Reuse dispatchBidAcceptedPush's shape — it's a single-recipient FCM v1
  // push with a reviewer-guard on the caller side. We only pass caller when
  // the sender is a reviewer account so real users (Chris) don't get pinged
  // during App Review demo runs.
  try {
    await dispatchBidAcceptedPush(sb, userId, planTitle || title, amount != null ? Number(amount) : 0, callerId);
  } catch (err) {
    console.warn('[upsell] push dispatch failed:', err.message);
  }
}

// ── POST /api/upsell — provider submits ──────────────────────────────────────
async function handleSubmit(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const {
    package_id, care_plan_id: bodyCarePlanId, title, description,
    estimated_cost, update_type = 'cost_increase',
    urgency = 'recommended', is_urgent = false, requires_response,
    photo_urls,
  } = body;

  if (!package_id || !isValidUuid(package_id)) return json(400, { error: 'package_id (uuid) required' });
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return json(400, { error: 'title required' });
  }
  if (!UPDATE_TYPES.includes(update_type)) {
    return json(400, { error: 'update_type must be one of ' + UPDATE_TYPES.join(', ') });
  }
  if (urgency != null && !URGENCY_LEVELS.includes(urgency)) {
    return json(400, { error: 'urgency must be one of ' + URGENCY_LEVELS.join(', ') });
  }

  // cost_increase / work_paused with a numeric cost require estimated_cost.
  const costNum = estimated_cost != null ? Number(estimated_cost) : null;
  if (update_type === 'cost_increase') {
    if (!(Number.isFinite(costNum) && costNum > 0)) {
      return json(400, { error: 'estimated_cost required for cost_increase (> 0)' });
    }
  }

  // Verify the caller is the accepted provider for this package. Server.js
  // used maintenance_packages.accepted_bid_id → bids.provider_id — we mirror
  // that path here.
  const { data: pkg, error: pkgErr } = await sb
    .from('maintenance_packages')
    .select('id, member_id, status, accepted_bid_id, title')
    .eq('id', package_id)
    .maybeSingle();
  if (pkgErr || !pkg) return json(404, { error: 'Package not found' });

  if (!pkg.accepted_bid_id) return json(400, { error: 'Package has no accepted bid' });

  const { data: bid } = await sb
    .from('bids')
    .select('id, provider_id')
    .eq('id', pkg.accepted_bid_id)
    .maybeSingle();
  if (!bid || bid.provider_id !== user.id) {
    return json(403, { error: 'Only the accepted provider can send updates on this job' });
  }

  // Resolve care_plan_id: prefer body value if provided (client already knows
  // it), otherwise look up by (member_id, title).
  let carePlanId = null;
  let carePlan = null;
  if (bodyCarePlanId && isValidUuid(bodyCarePlanId)) {
    const { data: cp } = await sb
      .from('care_plans')
      .select('id, provider_id, provider_stripe_account_id, status')
      .eq('id', bodyCarePlanId)
      .maybeSingle();
    if (cp) {
      carePlan = cp;
      carePlanId = cp.id;
    }
  }
  if (!carePlanId) {
    const resolved = await resolveCarePlanId(sb, package_id, pkg.member_id);
    if (resolved) { carePlan = resolved; carePlanId = resolved.id; }
  }

  // Money path requires a care_plan_id — the supplemental PI's transfer_data
  // needs the same connected account, and handleComplete looks up supplementals
  // by care_plan_id. Non-money update_types tolerate no care_plan_id.
  if (update_type === 'cost_increase' && !carePlanId) {
    return json(400, {
      error: 'No care_plan found for this job — cost_increase requires a care_plan link. '
           + 'If this is a legacy maintenance_packages-only job, use a non-money update type.',
    });
  }

  // Response window: 4h for cost_increase, 24h for other requires_response
  // types, no expiry for car_ready (info-only).
  const responseRequired = requires_response !== undefined
    ? Boolean(requires_response)
    : (update_type !== 'car_ready');
  const deadlineHours = update_type === 'cost_increase' ? 4 : 24;
  const expiresAt = responseRequired
    ? new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString()
    : null;

  const insertRow = {
    package_id,
    care_plan_id: carePlanId,
    provider_id: user.id,
    member_id: pkg.member_id,
    title: String(title).slice(0, 200),
    description: description ? String(description).slice(0, 2000) : null,
    estimated_cost: costNum,
    update_type,
    urgency: urgency || null,
    is_urgent: Boolean(is_urgent) || update_type === 'work_paused' || update_type === 'request_call',
    requires_response: responseRequired,
    expires_at: expiresAt,
    photo_urls: Array.isArray(photo_urls) ? photo_urls.slice(0, 10) : null,
    call_requested: update_type === 'request_call',
    status: 'pending',
  };

  const { data: inserted, error: insErr } = await sb
    .from('additional_work_requests')
    .insert(insertRow)
    .select('id')
    .single();
  if (insErr) {
    console.error('[upsell] insert failed:', insErr);
    return json(500, { error: insErr.message || 'Failed to record request' });
  }

  await audit(sb, {
    action: 'upsell_submitted',
    target_id: inserted.id,
    target_type: 'additional_work_request',
    performed_by: user.id,
    metadata: {
      package_id,
      care_plan_id: carePlanId,
      update_type,
      estimated_cost: costNum,
      is_urgent: insertRow.is_urgent,
    },
  });

  // Notify member (in-app + push).
  const notifyTitle = update_type === 'cost_increase'
    ? 'Additional work requested'
    : update_type === 'car_ready'   ? 'Your car is ready'
    : update_type === 'work_paused' ? 'Work paused — action needed'
    : update_type === 'question'    ? 'Your provider has a question'
    : 'Your provider requested a call';
  const notifyBody = update_type === 'cost_increase'
    ? `Your provider requested approval for $${costNum.toFixed(2)}: ${insertRow.title}`
    : insertRow.title;
  await notifyUser(sb, {
    userId: pkg.member_id,
    callerId: user.id,
    type: 'additional_work_' + update_type,
    title: notifyTitle,
    message: notifyBody,
    entityId: inserted.id,
    planTitle: pkg.title,
    amount: costNum,
  });

  return json(201, { success: true, id: inserted.id, care_plan_id: carePlanId });
}

// ── POST /api/upsell/:id/approve — member approves; creates PI ────────────────
async function handleApprove(event, sb, user, awrId) {
  if (!isValidUuid(awrId)) return json(400, { error: 'Invalid request id' });

  const { data: row, error: rowErr } = await sb
    .from('additional_work_requests')
    .select(`
      id, package_id, care_plan_id, provider_id, member_id, title,
      estimated_cost, status, update_type, payment_intent_id
    `)
    .eq('id', awrId)
    .maybeSingle();
  if (rowErr || !row) return json(404, { error: 'Request not found' });
  if (row.member_id !== user.id) return json(403, { error: 'Only the member can approve this request' });
  if (row.update_type !== 'cost_increase') {
    return json(400, { error: 'Approve is only valid for cost_increase updates' });
  }
  if (row.status !== 'pending') return json(400, { error: `Request is already ${row.status}` });
  if (!row.care_plan_id) return json(400, { error: 'Request has no care_plan link — cannot create supplemental PI' });

  const amountCents = Math.round(Number(row.estimated_cost) * 100);
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return json(400, { error: 'estimated_cost must be at least $0.50' });
  }

  // Look up the base care_plan for provider account destination.
  const { data: plan } = await sb
    .from('care_plans')
    .select('id, provider_id, provider_stripe_account_id, stripe_payment_intent_id, member_id, title')
    .eq('id', row.care_plan_id)
    .maybeSingle();
  if (!plan) return json(400, { error: 'care_plan_id references a missing plan' });

  // Provider Stripe account for transfer_data (destination charge).
  const providerStripeAccountId = plan.provider_stripe_account_id
    || (await sb.from('profiles').select('stripe_account_id').eq('id', row.provider_id).maybeSingle()).data?.stripe_account_id
    || null;

  // Reviewer guard — mirror care-plans.js:434. Skip Stripe entirely and mark
  // the row as fully approved (state consistent for the reviewer's demo run).
  if (await isReviewerAccount(sb, user.id)) {
    const now = new Date().toISOString();
    const { error: upErr } = await sb.from('additional_work_requests').update({
      status: 'approved',
      approved_at: now,
      responded_at: now,
      updated_at: now,
    }).eq('id', awrId).eq('status', 'pending'); // idempotency guard
    if (upErr) return json(500, { error: upErr.message });

    await audit(sb, {
      action: 'upsell_approved',
      target_id: awrId,
      target_type: 'additional_work_request',
      performed_by: user.id,
      metadata: { care_plan_id: row.care_plan_id, amount_cents: amountCents, reviewer_mock: true },
    });
    await notifyUser(sb, {
      userId: row.provider_id, callerId: user.id,
      type: 'additional_work_approved',
      title: 'Additional work approved',
      message: `Your request "${row.title}" was approved (reviewer demo — no live charge).`,
      entityId: awrId, planTitle: plan.title, amount: Number(row.estimated_cost),
    });
    return json(200, { success: true, reviewer_mock: true });
  }

  const st = stripe();
  if (!st) return json(500, { error: 'Payment system unavailable' });

  // Idempotent: if we've already made a PI for this row, return its client_secret.
  if (row.payment_intent_id) {
    try {
      const existing = await st.paymentIntents.retrieve(row.payment_intent_id);
      if (existing.client_secret && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)) {
        return json(200, {
          success: true,
          client_secret: existing.client_secret,
          payment_intent_id: existing.id,
          idempotent: true,
        });
      }
    } catch (_e) { /* fall through and create a new one */ }
  }

  const piParams = {
    amount: amountCents,
    currency: 'usd',
    capture_method: 'manual',
    metadata: {
      type: 'additional_work',
      additional_work_request_id: awrId,
      care_plan_id: row.care_plan_id,
      package_id: row.package_id,
      provider_id: row.provider_id,
      member_id: row.member_id,
    },
  };
  if (providerStripeAccountId) {
    piParams.transfer_data = { destination: providerStripeAccountId };
  }

  let pi;
  try {
    pi = await st.paymentIntents.create(piParams);
  } catch (stripeErr) {
    console.error('[upsell] PI create failed:', stripeErr);
    return json(500, { error: stripeErr.message || 'Failed to create payment intent' });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb.from('additional_work_requests').update({
    status: 'authorization_pending',
    payment_intent_id: pi.id,
    responded_at: now,
    updated_at: now,
  }).eq('id', awrId).eq('status', 'pending'); // idempotency guard
  if (upErr) {
    console.error('[upsell] update to authorization_pending failed:', upErr);
    return json(500, { error: upErr.message });
  }

  await audit(sb, {
    action: 'upsell_authorization_pending',
    target_id: awrId,
    target_type: 'additional_work_request',
    performed_by: user.id,
    metadata: {
      care_plan_id: row.care_plan_id,
      amount_cents: amountCents,
      stripe_payment_intent_id: pi.id,
    },
  });

  return json(200, {
    success: true,
    client_secret: pi.client_secret,
    payment_intent_id: pi.id,
  });
}

// ── POST /api/upsell/:id/confirm-authorization ───────────────────────────────
// Client calls this after Stripe.js successfully confirmed the card. We
// retrieve the PI from Stripe and, if it's in requires_capture, flip the row
// to 'approved'. Mirrors care-plans.js:reconcileHeldFromStripe idempotency.
async function handleConfirmAuthorization(event, sb, user, awrId) {
  if (!isValidUuid(awrId)) return json(400, { error: 'Invalid request id' });

  const { data: row } = await sb
    .from('additional_work_requests')
    .select('id, provider_id, member_id, status, payment_intent_id, care_plan_id, estimated_cost, title')
    .eq('id', awrId)
    .maybeSingle();
  if (!row) return json(404, { error: 'Request not found' });
  if (row.member_id !== user.id) return json(403, { error: 'Only the member can confirm this request' });
  if (row.status !== 'authorization_pending') {
    return json(400, { error: `Cannot confirm authorization from status ${row.status}` });
  }
  if (!row.payment_intent_id) return json(400, { error: 'Request has no payment intent yet' });

  const st = stripe();
  if (!st) return json(500, { error: 'Payment system unavailable' });

  let pi;
  try {
    pi = await st.paymentIntents.retrieve(row.payment_intent_id);
  } catch (retrErr) {
    console.error('[upsell] PI retrieve failed:', retrErr);
    return json(500, { error: retrErr.message });
  }

  if (pi.status !== 'requires_capture') {
    return json(400, {
      error: 'Payment not yet authorized',
      payment_status: pi.status,
    });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb.from('additional_work_requests').update({
    status: 'approved',
    approved_at: now,
    updated_at: now,
  }).eq('id', awrId).eq('status', 'authorization_pending'); // idempotency
  if (upErr) return json(500, { error: upErr.message });

  const { data: plan } = row.care_plan_id
    ? await sb.from('care_plans').select('title').eq('id', row.care_plan_id).maybeSingle()
    : { data: null };

  await audit(sb, {
    action: 'upsell_approved',
    target_id: awrId,
    target_type: 'additional_work_request',
    performed_by: user.id,
    metadata: {
      care_plan_id: row.care_plan_id,
      stripe_payment_intent_id: row.payment_intent_id,
      pi_status: pi.status,
    },
  });
  await notifyUser(sb, {
    userId: row.provider_id, callerId: user.id,
    type: 'additional_work_approved',
    title: 'Additional work approved',
    message: `Your request "${row.title}" was approved and payment is held.`,
    entityId: awrId, planTitle: plan?.title, amount: Number(row.estimated_cost),
  });

  return json(200, { success: true, status: 'approved' });
}

// ── POST /api/upsell/:id/decline — member declines ───────────────────────────
async function handleDecline(event, sb, user, awrId) {
  if (!isValidUuid(awrId)) return json(400, { error: 'Invalid request id' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
  const memberResponseNote = body.member_response_note
    ? String(body.member_response_note).slice(0, 1000)
    : null;

  const { data: row } = await sb
    .from('additional_work_requests')
    .select('id, provider_id, member_id, status, payment_intent_id, care_plan_id, estimated_cost, title')
    .eq('id', awrId)
    .maybeSingle();
  if (!row) return json(404, { error: 'Request not found' });
  if (row.member_id !== user.id) return json(403, { error: 'Only the member can decline this request' });
  if (!['pending', 'authorization_pending'].includes(row.status)) {
    return json(400, { error: `Cannot decline from status ${row.status}` });
  }

  // Cancel the PI if one was created (authorization_pending path). Non-fatal:
  // if the PI is already terminal, log + continue.
  if (row.payment_intent_id) {
    const st = stripe();
    if (st) {
      try {
        const pi = await st.paymentIntents.retrieve(row.payment_intent_id);
        if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(pi.status)) {
          await st.paymentIntents.cancel(row.payment_intent_id);
        }
      } catch (cancelErr) {
        console.warn('[upsell] PI cancel non-fatal error:', cancelErr.message);
      }
    }
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb.from('additional_work_requests').update({
    status: 'declined',
    declined_at: now,
    responded_at: now,
    member_response_note: memberResponseNote,
    member_action: 'declined',
    updated_at: now,
  }).eq('id', awrId).in('status', ['pending', 'authorization_pending']);
  if (upErr) return json(500, { error: upErr.message });

  await audit(sb, {
    action: 'upsell_declined',
    target_id: awrId,
    target_type: 'additional_work_request',
    performed_by: user.id,
    metadata: {
      care_plan_id: row.care_plan_id,
      stripe_payment_intent_id: row.payment_intent_id,
      had_authorized_payment: Boolean(row.payment_intent_id),
    },
  });

  const { data: plan } = row.care_plan_id
    ? await sb.from('care_plans').select('title').eq('id', row.care_plan_id).maybeSingle()
    : { data: null };
  await notifyUser(sb, {
    userId: row.provider_id, callerId: user.id,
    type: 'additional_work_declined',
    title: 'Additional work declined',
    message: `Your request "${row.title}" was declined${memberResponseNote ? ': ' + memberResponseNote.slice(0, 80) : ''}.`,
    entityId: awrId, planTitle: plan?.title, amount: Number(row.estimated_cost),
  });

  return json(200, { success: true });
}

// ── POST /api/upsell/:id/respond ──────────────────────────────────────────────
// Non-money member responses: acknowledge (car_ready etc.), reply (question),
// request_call. Purely a status flip + notification.
async function handleRespond(event, sb, user, awrId) {
  if (!isValidUuid(awrId)) return json(400, { error: 'Invalid request id' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
  const { action, member_response } = body;
  if (!RESPOND_ACTIONS.includes(action)) {
    return json(400, { error: 'action must be one of ' + RESPOND_ACTIONS.join(', ') });
  }

  const { data: row } = await sb
    .from('additional_work_requests')
    .select('id, provider_id, member_id, status, care_plan_id, update_type, title')
    .eq('id', awrId)
    .maybeSingle();
  if (!row) return json(404, { error: 'Request not found' });
  if (row.member_id !== user.id) return json(403, { error: 'Only the member can respond' });
  if (row.status !== 'pending') return json(400, { error: `Cannot respond from status ${row.status}` });

  const now = new Date().toISOString();
  const patch = {
    responded_at: now,
    updated_at: now,
  };
  let notifyType = 'additional_work_responded';
  let notifyBody = row.title;

  if (action === 'acknowledge') {
    patch.status = 'approved';
    patch.member_action = 'acknowledged';
    notifyBody = `Member acknowledged: ${row.title}`;
  } else if (action === 'reply') {
    if (!member_response || typeof member_response !== 'string') {
      return json(400, { error: 'member_response required for reply action' });
    }
    patch.status = 'approved';
    patch.member_action = 'replied';
    patch.member_response = member_response.slice(0, 2000);
    notifyBody = `Member replied: ${member_response.slice(0, 100)}`;
  } else if (action === 'request_call') {
    patch.call_requested = true;
    patch.member_action = 'call_me';
    // Do NOT flip status yet — provider still needs to call.
    notifyBody = 'Member requested a call back';
  }

  const { error: upErr } = await sb.from('additional_work_requests').update(patch)
    .eq('id', awrId).eq('status', 'pending');
  if (upErr) return json(500, { error: upErr.message });

  await audit(sb, {
    action: 'upsell_' + action,
    target_id: awrId,
    target_type: 'additional_work_request',
    performed_by: user.id,
    metadata: { update_type: row.update_type },
  });

  const { data: plan } = row.care_plan_id
    ? await sb.from('care_plans').select('title').eq('id', row.care_plan_id).maybeSingle()
    : { data: null };
  await notifyUser(sb, {
    userId: row.provider_id, callerId: user.id,
    type: notifyType,
    title: 'Member responded',
    message: notifyBody,
    entityId: awrId, planTitle: plan?.title,
  });

  return json(200, { success: true, status: patch.status || row.status });
}

// ── POST /api/upsell/:id/suspend-work — provider suspends after expiry ───────
async function handleSuspendWork(event, sb, user, awrId) {
  if (!isValidUuid(awrId)) return json(400, { error: 'Invalid request id' });

  const { data: row } = await sb
    .from('additional_work_requests')
    .select('id, provider_id, member_id, status, expires_at, care_plan_id, title, estimated_cost, payment_intent_id')
    .eq('id', awrId)
    .maybeSingle();
  if (!row) return json(404, { error: 'Request not found' });
  if (row.provider_id !== user.id) return json(403, { error: 'Only the provider can suspend work' });
  if (row.status !== 'pending') return json(400, { error: `Cannot suspend from status ${row.status}` });
  if (row.expires_at && new Date(row.expires_at) > new Date()) {
    return json(400, { error: 'Response window has not expired yet' });
  }

  // Cancel any dangling PI (shouldn't exist for a still-pending row, but
  // defense-in-depth in case of a race).
  if (row.payment_intent_id) {
    const st = stripe();
    if (st) {
      try { await st.paymentIntents.cancel(row.payment_intent_id); }
      catch (e) { console.warn('[upsell] suspend-work PI cancel non-fatal:', e.message); }
    }
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb.from('additional_work_requests').update({
    status: 'expired',
    work_suspended: true,
    suspended_at: now,
    updated_at: now,
  }).eq('id', awrId).eq('status', 'pending');
  if (upErr) return json(500, { error: upErr.message });

  await audit(sb, {
    action: 'upsell_work_suspended',
    target_id: awrId,
    target_type: 'additional_work_request',
    performed_by: user.id,
    metadata: { care_plan_id: row.care_plan_id },
  });

  const { data: plan } = row.care_plan_id
    ? await sb.from('care_plans').select('title').eq('id', row.care_plan_id).maybeSingle()
    : { data: null };
  await notifyUser(sb, {
    userId: row.member_id, callerId: user.id,
    type: 'additional_work_expired',
    title: 'Work suspended',
    message: `Your provider suspended work on "${row.title}" because you did not respond in time.`,
    entityId: awrId, planTitle: plan?.title, amount: Number(row.estimated_cost),
  });

  return json(200, { success: true });
}

// ── GET /api/upsell/mine ─────────────────────────────────────────────────────
async function handleListMine(sb, user) {
  const { data, error } = await sb
    .from('additional_work_requests')
    .select(`
      id, package_id, care_plan_id, provider_id, member_id,
      title, description, estimated_cost, status, update_type, urgency,
      is_urgent, requires_response, expires_at, member_action, member_response,
      call_requested, call_completed, work_suspended, suspended_at,
      photo_urls, rebid_package_id, member_response_note,
      created_at, responded_at, approved_at, declined_at, captured_at,
      capture_error, payment_intent_id
    `)
    .eq('member_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return json(500, { error: error.message });
  return json(200, { requests: data || [] });
}

// ── GET /api/upsell/for-package/:package_id ──────────────────────────────────
async function handleListForPackage(sb, user, packageId) {
  if (!isValidUuid(packageId)) return json(400, { error: 'Invalid package id' });
  // Access gate: caller must be the member OR the accepted provider on that package.
  const { data: pkg } = await sb
    .from('maintenance_packages')
    .select('id, member_id, accepted_bid_id')
    .eq('id', packageId)
    .maybeSingle();
  if (!pkg) return json(404, { error: 'Package not found' });
  let allowed = pkg.member_id === user.id;
  if (!allowed && pkg.accepted_bid_id) {
    const { data: bid } = await sb.from('bids').select('provider_id').eq('id', pkg.accepted_bid_id).maybeSingle();
    allowed = bid?.provider_id === user.id;
  }
  if (!allowed) return json(403, { error: 'Forbidden' });

  const { data, error } = await sb
    .from('additional_work_requests')
    .select('*')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false });
  if (error) return json(500, { error: error.message });
  return json(200, { requests: data || [] });
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const route = stripRoute(event.path);
  const segments = route.split('/').filter(Boolean);
  const method = event.httpMethod;

  // GET /api/upsell/mine
  if (method === 'GET' && segments[0] === 'mine') return handleListMine(sb, auth.user);

  // GET /api/upsell/for-package/:package_id
  if (method === 'GET' && segments[0] === 'for-package' && segments[1]) {
    return handleListForPackage(sb, auth.user, segments[1]);
  }

  // POST /api/upsell — submit
  if (method === 'POST' && segments.length === 0) return handleSubmit(event, sb, auth.user);

  // POST /api/upsell/:id/<action>
  if (method === 'POST' && segments[0] && segments[1]) {
    const id = segments[0];
    const action = segments[1];
    switch (action) {
      case 'approve':                return handleApprove(event, sb, auth.user, id);
      case 'confirm-authorization':  return handleConfirmAuthorization(event, sb, auth.user, id);
      case 'decline':                return handleDecline(event, sb, auth.user, id);
      case 'respond':                return handleRespond(event, sb, auth.user, id);
      case 'suspend-work':           return handleSuspendWork(event, sb, auth.user, id);
      default:                       return json(404, { error: 'Unknown action: ' + action });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
