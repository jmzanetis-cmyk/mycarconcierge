// ============================================================================
// driver-api  (Task #332)
//
// Single Netlify function backing the separate "MCC Driver" Replit project.
// Mounted at /.netlify/functions/driver-api/* and proxied from
// /api/driver/v1/* via www/_redirects.
//
// Routes:
//   POST /auth/send-code       { phone }                        — send OTP via Twilio Verify
//   POST /auth/verify-code     { phone, code }                  — exchange OTP for session token
//   POST /auth/refresh         { refresh_token }                — refresh access token
//   GET  /me                                                    — driver profile
//   GET  /jobs?status=&from=&to=                                — assigned jobs (with embedded legs)
//   GET  /jobs/:id                                              — single job
//   POST /jobs/:id/accept
//   POST /jobs/:id/decline     { reason }
//   POST /jobs/:id/legs/:leg_id/start
//   POST /jobs/:id/legs/:leg_id/complete
//   POST /jobs/:id/legs/:leg_id/location  { pings: [{lat,lng,...}] }  (≤50)
//   GET  /earnings?range=today|week|month|all
//
// SECURITY MODEL
//   - The Driver app NEVER receives the Supabase service-role key.
//   - All privileged writes happen here using the service-role client.
//   - Auth uses NATIVE Supabase JWTs. After Twilio Verify confirms the
//     OTP, the server calls auth.admin.generateLink({type:'magiclink',email})
//     and exchanges the resulting hashed_token via an anon-client
//     verifyOtp() to mint a real Supabase session (access + refresh).
//     Token validation on subsequent requests uses supabase.auth.getUser().
//     Refresh uses supabase.auth.refreshSession(). Lifecycle / revocation
//     is owned entirely by Supabase Auth.
//   - Phones not present in `drivers` with status='active' are rejected at
//     send-code time so unknown phones can't enumerate the driver roster.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceSupabase() {
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function errorResponse(statusCode, code, message, extra = {}) {
  return jsonResponse(statusCode, { error: { code, message, ...extra } });
}

function getBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function normalizePhone(p) {
  if (typeof p !== 'string') return null;
  const trimmed = p.trim();
  // Accept E.164 (+12015550100). Reject anything else so we don't try to
  // SMS a malformed number through Twilio.
  return /^\+[1-9]\d{1,14}$/.test(trimmed) ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Driver session tokens are NATIVE SUPABASE JWTs minted via the admin
// generateLink + anon-client verifyOtp flow. The Driver app receives a
// real Supabase access_token + refresh_token pair, so RLS policies on
// drivers / concierge_jobs / etc that gate on `auth.uid() = drivers.profile_id`
// work directly against the driver's session — the Driver Replit project
// can talk to Supabase with the anon key, and the lifecycle (refresh /
// expiry / revocation) is managed by Supabase, not by us.
//
// Requires drivers.profile_id linked to an auth.users row whose email
// matches drivers.email.
// ---------------------------------------------------------------------------

let _anonClient = null;
function getAnonClient() {
  if (_anonClient) return _anonClient;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const { createClient } = require('@supabase/supabase-js');
  _anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _anonClient;
}

async function mintSupabaseSession(supabase, driver) {
  if (!driver.email) {
    return { error: errorResponse(409, 'DRIVER_NO_EMAIL', 'Driver has no email on file — admin must link an auth user') };
  }
  const anon = getAnonClient();
  if (!anon) {
    return { error: errorResponse(503, 'AUTH_UNAVAILABLE', 'Supabase anon key not configured') };
  }
  // Step 1: admin generates a one-time hashed magiclink token for the
  // driver's email (no email is actually sent — we exchange the token
  // server-side immediately).
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink', email: driver.email
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return { error: errorResponse(500, 'AUTH_LINK_FAILED', linkErr?.message || 'no token returned') };
  }
  // Step 2: anon client exchanges the hashed token for a real Supabase
  // session (access_token + refresh_token).
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token, type: 'magiclink'
  });
  if (vErr || !sess?.session) {
    return { error: errorResponse(500, 'AUTH_VERIFY_FAILED', vErr?.message || 'no session returned') };
  }
  return {
    response: jsonResponse(200, {
      access_token: sess.session.access_token,
      refresh_token: sess.session.refresh_token,
      token_type: 'Bearer',
      expires_in: sess.session.expires_in,
      expires_at: sess.session.expires_at,
      driver: { id: driver.id, full_name: driver.full_name, phone: driver.phone }
    })
  };
}

// ---------------------------------------------------------------------------
// Twilio Verify (REST). We hit the Verify API directly so the function has
// no extra deps. Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
// TWILIO_VERIFY_SERVICE_SID. If TWILIO_VERIFY_SERVICE_SID is unset we return
// a 503 — the Driver app can detect this and tell the operator to configure
// the env var. We DO NOT silently fall back to a less-secure channel.
// ---------------------------------------------------------------------------

async function twilioVerifyStart(phone) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !verifySid) {
    return { ok: false, status: 503, error: 'twilio_verify_not_configured' };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({ To: phone, Channel: 'sms' });
  const resp = await fetch(`https://verify.twilio.com/v2/Services/${verifySid}/Verifications`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, status: resp.status, error: data.message || 'twilio_send_failed' };
  return { ok: true, status: data.status };
}

async function twilioVerifyCheck(phone, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !verifySid) {
    return { ok: false, status: 503, error: 'twilio_verify_not_configured' };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({ To: phone, Code: code });
  const resp = await fetch(`https://verify.twilio.com/v2/Services/${verifySid}/VerificationCheck`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, status: resp.status, error: data.message || 'twilio_check_failed' };
  return { ok: data.status === 'approved', status: data.status };
}

// ---------------------------------------------------------------------------
// Per-phone send-code rate limiter (3 per 15min). DB-backed via the
// driver_otp_send_log table so the limit is shared across all Netlify
// function instances and survives cold starts (in-memory counters are
// trivially bypassable under load). Fail-open on transient DB errors so
// drivers aren't permanently locked out by a database hiccup; Twilio
// Verify's own per-number throttle is the secondary defense.
// ---------------------------------------------------------------------------
async function checkSendCodeRateDB(supabase, phone) {
  const windowMs = 15 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data, error } = await supabase
    .from('driver_otp_send_log')
    .select('sent_at')
    .eq('phone', phone)
    .gte('sent_at', since)
    .order('sent_at', { ascending: true });
  if (error) return { allowed: true }; // fail-open
  const rows = data || [];
  if (rows.length >= 3) {
    const oldest = new Date(rows[0].sent_at).getTime();
    return { allowed: false, retry_after: Math.ceil((windowMs - (Date.now() - oldest)) / 1000) };
  }
  return { allowed: true };
}
async function logSendCode(supabase, phone) {
  try { await supabase.from('driver_otp_send_log').insert({ phone, sent_at: new Date().toISOString() }); } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// agent_events emission + audit log helpers (best-effort).
// ---------------------------------------------------------------------------
async function emitEvent(supabase, eventType, payload) {
  try {
    await supabase.from('agent_events').insert({
      event_type: eventType, payload, source: 'driver-api'
    });
  } catch (e) { /* best-effort */ }
}
async function audit(supabase, row) {
  try { await supabase.from('admin_audit_log').insert(row); } catch (e) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Stripe helpers (Task #334). Lazy-loaded so the function still boots when
// STRIPE_SECRET_KEY is unset in dev — onboarding/payout endpoints will
// degrade gracefully with a clear error code in that case.
// ---------------------------------------------------------------------------
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
    return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
  } catch (e) {
    console.error('[driver-api] stripe init failed:', e.message);
    return null;
  }
}

// Accrue per-job earnings into each accepted driver's wallet. Earnings sit
// at status='available' until the driver cashes out (Uber/Lyft model).
// Idempotent via the (driver_id, job_id) partial-unique index on
// driver_earnings — a job_completed replay won't double-credit.
//
// Note: NO Stripe transfer happens here. Money only moves when the driver
// (or admin on their behalf) hits POST /me/cashout. This keeps Stripe API
// calls off the leg-completion hot path and lets drivers batch their
// earnings into one transfer + one Instant Payout fee.
async function accrueJobEarnings(supabase, jobId) {
  const { data: assignments } = await supabase
    .from('concierge_job_drivers')
    .select('driver_id, role, accepted_at, driver:drivers(id, full_name, email, per_job_rate_cents, stripe_connect_account_id, stripe_payouts_enabled)')
    .eq('job_id', jobId)
    .not('accepted_at', 'is', null);
  if (!Array.isArray(assignments) || assignments.length === 0) return { credited: 0, skipped: 0 };

  let credited = 0, skipped = 0;
  for (const a of assignments) {
    const driver = a.driver;
    if (!driver) { skipped++; continue; }
    const amount = Number(driver.per_job_rate_cents || 0);
    if (amount <= 0) { skipped++; continue; }

    // 'available' only if the driver has a Connect account AND Stripe has
    // confirmed payouts are enabled — otherwise the row would be visible
    // as cashable but the cashout endpoint would 409 on PAYOUTS_DISABLED.
    // 'pending_account' covers both "no Connect account" and
    // "Connect account but onboarding incomplete / requirements due".
    // GET /me/stripe/status auto-promotes pending_account → available
    // the moment Stripe flips payouts_enabled on.
    const initialStatus = (driver.stripe_connect_account_id && driver.stripe_payouts_enabled)
      ? 'available'
      : 'pending_account';
    const { data: inserted, error: insErr } = await supabase
      .from('driver_earnings')
      .insert({
        driver_id: driver.id,
        job_id: jobId,
        amount_cents: amount,
        kind: 'base',
        payout_status: initialStatus,
        notes: `Auto-credited on concierge.job_completed (role=${a.role})`
      })
      .select('id')
      .single();
    if (insErr) {
      // 23505 = unique_violation → already credited for this job.
      if (insErr.code === '23505' || /duplicate key/i.test(insErr.message || '')) {
        skipped++;
        continue;
      }
      console.error('[driver-api] earnings insert failed:', insErr.message);
      skipped++;
      continue;
    }
    credited++;
    await emitEvent(supabase, 'concierge.driver_earned', {
      job_id: jobId, driver_id: driver.id, amount_cents: amount,
      earnings_id: inserted?.id, status: initialStatus
    });
  }
  return { credited, skipped };
}

// Cash-out implementation (driver wallet → bank). Reused by both
// POST /me/cashout (driver-initiated) and admin-triggered cashouts.
// Returns { statusCode, body } shapes so callers can map to their own
// response format.
//
// Flow:
//   1. Sum 'available' earnings for the driver. Reject if below MIN.
//   2. Insert driver_cashouts row (status='processing'). This becomes the
//      atomic anchor we update from this point on — even if Stripe fails
//      below, the cashout row records the attempt.
//   3. Flip the affected earnings rows to 'paid' + cashout_id BEFORE we
//      hit Stripe (so a concurrent cashout request can't double-spend the
//      same balance — earnings move out of 'available' immediately).
//   4. Create platform → connected-acct transfer (idempotency-keyed by
//      cashout id). If method='instant', also create a Stripe Payout on
//      the connected account with method=instant.
//   5. On success: cashout.status='paid', completed_at=now.
//      On failure: cashout.status='failed' + error; ROLL BACK the
//      earnings rows back to 'available' so the driver can retry.
async function executeCashout(supabase, driver, opts) {
  const method = opts.method === 'instant' ? 'instant' : 'standard';
  const initiatedByKind = opts.initiatedByKind || 'driver';
  const initiatedById   = opts.initiatedById   || driver.profile_id || null;

  if (!driver.stripe_connect_account_id) {
    return { statusCode: 409, body: { error: { code: 'NO_CONNECT_ACCOUNT', message: 'Connect your bank account before cashing out' } } };
  }
  if (!driver.stripe_payouts_enabled) {
    return { statusCode: 409, body: { error: { code: 'PAYOUTS_DISABLED', message: 'Finish Stripe verification before cashing out' } } };
  }

  // 1. Pull all available earnings for this driver, sum.
  const { data: rows, error: selErr } = await supabase
    .from('driver_earnings')
    .select('id, amount_cents')
    .eq('driver_id', driver.id)
    .eq('payout_status', 'available');
  if (selErr) return { statusCode: 500, body: { error: { code: 'DB_ERROR', message: selErr.message } } };
  const earningsIds = (rows || []).map(r => r.id);
  const gross = (rows || []).reduce((s, r) => s + (r.amount_cents || 0), 0);
  const MIN_CASHOUT = 100; // $1 floor to avoid sub-cent Stripe rejections
  if (gross < MIN_CASHOUT) {
    return { statusCode: 409, body: { error: { code: 'INSUFFICIENT_BALANCE', message: `Minimum cash-out is $${(MIN_CASHOUT/100).toFixed(2)} — you have $${(gross/100).toFixed(2)} available` } } };
  }

  // Instant fee = 1.5% (matches Stripe's default; we charge it to the driver
  // by reducing the payout amount, not the transfer amount).
  const feeCents = method === 'instant' ? Math.max(50, Math.round(gross * 0.015)) : 0;

  // 2. Insert cashout row.
  const { data: cashout, error: coErr } = await supabase
    .from('driver_cashouts')
    .insert({
      driver_id: driver.id,
      amount_cents: gross,
      fee_cents: feeCents,
      method,
      status: 'processing',
      initiated_by_kind: initiatedByKind,
      initiated_by_id: initiatedById
    })
    .select('id')
    .single();
  if (coErr || !cashout) {
    return { statusCode: 500, body: { error: { code: 'DB_ERROR', message: coErr?.message || 'cashout insert failed' } } };
  }
  const cashoutId = cashout.id;

  // 3. Reserve the earnings ATOMICALLY: only flip rows that are still
  // 'available' AND not already linked to another cashout. Postgres
  // serializes the per-row UPDATE locks, so two concurrent requests
  // racing on the same balance will see only one succeed per row — the
  // loser gets back fewer (or zero) reserved rows than it asked for and
  // we abort + roll back, ensuring no double-spend.
  const { data: reservedRows, error: resErr } = await supabase
    .from('driver_earnings')
    .update({ payout_status: 'paid', cashout_id: cashoutId, paid_at: new Date().toISOString() })
    .in('id', earningsIds)
    .eq('payout_status', 'available')   // critical: scope to still-available rows
    .is('cashout_id', null)              // critical: never re-claim a linked row
    .select('id, amount_cents');
  if (resErr) {
    await supabase.from('driver_cashouts').update({
      status: 'failed', error: 'reservation_failed: ' + resErr.message, completed_at: new Date().toISOString()
    }).eq('id', cashoutId);
    return { statusCode: 500, body: { error: { code: 'DB_ERROR', message: resErr.message } } };
  }
  // If we didn't reserve every row we read in step 1, a concurrent cashout
  // grabbed some of them. Roll back the partial reservation (flip back to
  // available) and abort with 409 so the caller can retry against the
  // freshly-updated balance.
  if (!Array.isArray(reservedRows) || reservedRows.length !== earningsIds.length) {
    const reservedIds = (reservedRows || []).map(r => r.id);
    if (reservedIds.length > 0) {
      await supabase.from('driver_earnings')
        .update({ payout_status: 'available', cashout_id: null, paid_at: null })
        .in('id', reservedIds);
    }
    await supabase.from('driver_cashouts').update({
      status: 'cancelled',
      error: `concurrent_cashout_race: reserved ${reservedIds.length} of ${earningsIds.length} rows`,
      completed_at: new Date().toISOString()
    }).eq('id', cashoutId);
    return { statusCode: 409, body: { error: { code: 'CONCURRENT_CASHOUT', message: 'Another cashout is in progress — try again in a moment' } } };
  }
  // Use the actually-reserved set going forward (defensive — earningsIds
  // and reservedRows are equivalent here, but this guards against future
  // refactors of the read step).
  const finalEarningsIds = reservedRows.map(r => r.id);

  const stripe = getStripe();
  if (!stripe) {
    await supabase.from('driver_cashouts').update({
      status: 'failed', error: 'stripe_unavailable', completed_at: new Date().toISOString()
    }).eq('id', cashoutId);
    // Roll back the reservation.
    await supabase.from('driver_earnings')
      .update({ payout_status: 'available', cashout_id: null, paid_at: null })
      .in('id', finalEarningsIds);
    return { statusCode: 503, body: { error: { code: 'STRIPE_UNAVAILABLE', message: 'Stripe not configured' } } };
  }

  // 4. Platform → connected-account transfer (always, for both methods).
  let transferId = null;
  try {
    const transfer = await stripe.transfers.create({
      amount: gross, currency: 'usd',
      destination: driver.stripe_connect_account_id,
      description: `MCC Driver cash-out (${method}) — ${cashoutId}`,
      metadata: { driver_id: driver.id, cashout_id: cashoutId, method }
    }, { idempotencyKey: `driver-cashout-transfer-${cashoutId}` });
    transferId = transfer.id;
  } catch (e) {
    const msg = (e?.message || 'transfer_failed').slice(0, 500);
    await supabase.from('driver_cashouts').update({
      status: 'failed', error: msg, completed_at: new Date().toISOString()
    }).eq('id', cashoutId);
    // Roll back earnings so driver can retry.
    await supabase.from('driver_earnings')
      .update({ payout_status: 'available', cashout_id: null, paid_at: null })
      .in('id', finalEarningsIds);
    await emitEvent(supabase, 'driver.cashout_failed', { cashout_id: cashoutId, driver_id: driver.id, error: msg });
    return { statusCode: 502, body: { error: { code: 'TRANSFER_FAILED', message: msg } } };
  }

  // 4b. Instant: also create a Stripe Payout on the connected account
  //     with method=instant. Standard cash-outs rely on the connected
  //     account's default automatic payout schedule (typically next
  //     business day for US ACH).
  let payoutId = null;
  if (method === 'instant') {
    const payoutAmount = gross - feeCents;
    try {
      const payout = await stripe.payouts.create({
        amount: payoutAmount, currency: 'usd', method: 'instant',
        description: `MCC Driver Instant Payout — ${cashoutId}`,
        metadata: { driver_id: driver.id, cashout_id: cashoutId }
      }, {
        stripeAccount: driver.stripe_connect_account_id,
        idempotencyKey: `driver-cashout-payout-${cashoutId}`
      });
      payoutId = payout.id;
    } catch (e) {
      const msg = (e?.message || 'instant_payout_failed').slice(0, 500);
      // Transfer already landed in the connected account — funds aren't
      // lost. Mark the cashout 'failed' but DO NOT roll back the earnings
      // (the money IS in the driver's Stripe balance, just not instantly
      // paid out). Admin retry will create the payout from there.
      await supabase.from('driver_cashouts').update({
        status: 'failed', error: 'instant_payout_failed: ' + msg,
        stripe_transfer_id: transferId, completed_at: new Date().toISOString()
      }).eq('id', cashoutId);
      await emitEvent(supabase, 'driver.cashout_instant_failed', { cashout_id: cashoutId, driver_id: driver.id, error: msg });
      return { statusCode: 502, body: { error: { code: 'INSTANT_PAYOUT_FAILED', message: msg, cashout_id: cashoutId } } };
    }
  }

  // 5. Success.
  await supabase.from('driver_cashouts').update({
    status: 'paid',
    stripe_transfer_id: transferId,
    stripe_payout_id: payoutId,
    completed_at: new Date().toISOString()
  }).eq('id', cashoutId);
  await emitEvent(supabase, 'driver.cashout_paid', {
    cashout_id: cashoutId, driver_id: driver.id, amount_cents: gross,
    fee_cents: feeCents, method
  });
  return {
    statusCode: 200,
    body: {
      success: true, cashout_id: cashoutId, amount_cents: gross,
      fee_cents: feeCents, net_cents: gross - feeCents, method,
      transfer_id: transferId, payout_id: payoutId
    }
  };
}

// ---------------------------------------------------------------------------
// Auth middleware: parse Bearer token, look up driver, ensure status=active.
// ---------------------------------------------------------------------------
async function authenticateDriver(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { error: errorResponse(401, 'AUTH_REQUIRED', 'Bearer token required') };
  // Verify the token via Supabase auth — drivers carry real Supabase
  // access tokens minted during /verify-code, so getUser is the canonical
  // validator and respects revocation/expiry without us reimplementing it.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return { error: errorResponse(401, 'AUTH_REQUIRED', 'Invalid or expired token') };
  }
  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, profile_id, full_name, phone, email, status, vehicle_class, hourly_rate_cents, per_job_rate_cents, onboarded_at, stripe_connect_account_id, stripe_payouts_enabled')
    .eq('profile_id', userData.user.id)
    .maybeSingle();
  if (error || !driver) return { error: errorResponse(401, 'AUTH_REQUIRED', 'No driver record linked to this user') };
  if (driver.status !== 'active') {
    return { error: errorResponse(403, 'DRIVER_NOT_ACTIVE', `Driver status is ${driver.status}`) };
  }
  return { driver };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleSendCode(event, supabase, body) {
  const phone = normalizePhone(body.phone);
  if (!phone) return errorResponse(400, 'BAD_REQUEST', 'phone must be in E.164 format');

  const rate = await checkSendCodeRateDB(supabase, phone);
  if (!rate.allowed) return errorResponse(429, 'RATE_LIMITED', 'Too many code requests', { retry_after: rate.retry_after });

  // Reject phones not present in drivers as 'active'. Returning the same
  // generic 200 vs 404 here would leak driver enumeration; we accept that
  // tradeoff explicitly because driver phones are not customer PII and the
  // operational cost of debugging "I'm not getting codes" is higher.
  const { data: driver } = await supabase
    .from('drivers').select('id, status').eq('phone', phone).maybeSingle();
  if (!driver)               return errorResponse(404, 'DRIVER_NOT_FOUND', 'Phone not registered as a driver');
  if (driver.status !== 'active') return errorResponse(403, 'DRIVER_NOT_ACTIVE', `Driver status is ${driver.status}`);

  const result = await twilioVerifyStart(phone);
  if (!result.ok) {
    return errorResponse(result.status === 503 ? 503 : 502, 'OTP_SEND_FAILED', result.error);
  }
  await logSendCode(supabase, phone);
  return jsonResponse(200, { sent: true, status: result.status });
}

async function handleVerifyCode(event, supabase, body) {
  const phone = normalizePhone(body.phone);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!phone) return errorResponse(400, 'BAD_REQUEST', 'phone must be in E.164 format');
  if (!/^[0-9]{4,10}$/.test(code)) return errorResponse(400, 'BAD_REQUEST', 'code must be 4-10 digits');

  const { data: driver } = await supabase
    .from('drivers')
    .select('id, profile_id, full_name, phone, email, status')
    .eq('phone', phone).maybeSingle();
  if (!driver)                    return errorResponse(404, 'DRIVER_NOT_FOUND', 'Phone not registered as a driver');
  if (driver.status !== 'active') return errorResponse(403, 'DRIVER_NOT_ACTIVE', `Driver status is ${driver.status}`);
  if (!driver.profile_id)         return errorResponse(409, 'DRIVER_NOT_LINKED', 'Driver has no profile_id linked — admin must link an auth user');

  const check = await twilioVerifyCheck(phone, code);
  if (!check.ok) {
    if (check.status === 503) return errorResponse(503, 'OTP_VERIFY_UNAVAILABLE', 'Verify service not configured');
    return errorResponse(401, 'OTP_INVALID', `Verification ${check.status || 'failed'}`);
  }

  await emitEvent(supabase, 'driver.signed_in', { driver_id: driver.id, phone: driver.phone });
  const session = await mintSupabaseSession(supabase, driver);
  if (session.error) return session.error;
  return session.response;
}

async function handleRefresh(event, supabase, body) {
  const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
  if (!token) return errorResponse(400, 'BAD_REQUEST', 'refresh_token required');
  const anon = getAnonClient();
  if (!anon) return errorResponse(503, 'AUTH_UNAVAILABLE', 'Supabase anon key not configured');
  // Native Supabase refresh — issues a new access_token + (rotated)
  // refresh_token pair.
  const { data, error } = await anon.auth.refreshSession({ refresh_token: token });
  if (error || !data?.session) {
    return errorResponse(401, 'AUTH_REQUIRED', 'Invalid or expired refresh token');
  }
  return jsonResponse(200, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: 'Bearer',
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at
  });
}

async function handleMe(event, supabase, driver) {
  return jsonResponse(200, { driver });
}

async function handleListJobs(event, supabase, driver) {
  const q = event.queryStringParameters || {};
  let query = supabase
    .from('concierge_job_drivers')
    .select(`
      role, accepted_at, declined_at,
      job:concierge_jobs (
        id, member_id, appointment_id, provider_id, tier, scenario, status,
        scheduled_start_at, pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng, total_price_cents, notes,
        legs:concierge_job_legs ( id, sequence, leg_type, driver_role,
          from_address, from_lat, from_lng, to_address, to_lat, to_lng,
          carries_passenger, carries_member_vehicle, carries_partner_vehicle,
          status, started_at, completed_at )
      )
    `)
    .eq('driver_id', driver.id)
    .order('assigned_at', { ascending: false })
    .limit(200);

  const { data, error } = await query;
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  let jobs = (data || []).map(row => ({
    ...row.job,
    my_role: row.role,
    accepted_at: row.accepted_at,
    declined_at: row.declined_at
  })).filter(j => j && j.id);

  if (q.status) jobs = jobs.filter(j => j.status === q.status);
  if (q.from)   jobs = jobs.filter(j => !j.scheduled_start_at || j.scheduled_start_at >= q.from);
  if (q.to)     jobs = jobs.filter(j => !j.scheduled_start_at || j.scheduled_start_at <= q.to);

  // Sort legs by sequence — Postgrest doesn't sort embedded rows by default.
  for (const j of jobs) if (Array.isArray(j.legs)) j.legs.sort((a,b) => a.sequence - b.sequence);

  return jsonResponse(200, { jobs });
}

async function loadJobIfAssigned(supabase, driverId, jobId) {
  const { data: assignment } = await supabase
    .from('concierge_job_drivers')
    .select('role, accepted_at, declined_at, job_id')
    .eq('driver_id', driverId).eq('job_id', jobId).maybeSingle();
  if (!assignment) return { error: errorResponse(403, 'JOB_NOT_ASSIGNED', 'You are not assigned to this job') };

  const { data: job } = await supabase
    .from('concierge_jobs')
    .select('*, legs:concierge_job_legs ( * )')
    .eq('id', jobId).maybeSingle();
  if (!job) return { error: errorResponse(404, 'JOB_NOT_FOUND', 'Job not found') };
  if (Array.isArray(job.legs)) job.legs.sort((a,b) => a.sequence - b.sequence);
  return { assignment, job };
}

async function handleGetJob(event, supabase, driver, jobId) {
  if (!isUuid(jobId)) return errorResponse(400, 'BAD_REQUEST', 'invalid job id');
  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  return jsonResponse(200, {
    job: { ...r.job, my_role: r.assignment.role, accepted_at: r.assignment.accepted_at, declined_at: r.assignment.declined_at }
  });
}

async function handleAccept(event, supabase, driver, jobId) {
  if (!isUuid(jobId)) return errorResponse(400, 'BAD_REQUEST', 'invalid job id');
  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  if (r.assignment.declined_at) return errorResponse(409, 'ALREADY_DECLINED', 'You declined this job');
  if (r.assignment.accepted_at) return jsonResponse(200, { ok: true, already_accepted: true });

  // Concurrency guard: if another driver already accepted the same role on
  // this job, refuse. We rely on the DB unique (job_id, role) for the
  // ultimate race; this check just gives a clean 409 instead of 500.
  const { data: existingRoleAccepts } = await supabase
    .from('concierge_job_drivers')
    .select('driver_id, role, accepted_at')
    .eq('job_id', jobId).eq('role', r.assignment.role).not('accepted_at','is', null);
  if ((existingRoleAccepts || []).some(x => x.driver_id !== driver.id)) {
    return errorResponse(409, 'ROLE_TAKEN', `Another driver already accepted the ${r.assignment.role} role`);
  }

  // Conditional update — both `accepted_at` and `declined_at` must still
  // be NULL when the row is written. Without this guard, a concurrent
  // /decline call that won the read-then-write race would leave the row
  // with BOTH timestamps set. We rely on the returned row count to detect
  // the race rather than a transaction (Postgrest doesn't expose those).
  const { data: updRows, error: updErr } = await supabase
    .from('concierge_job_drivers')
    .update({ accepted_at: new Date().toISOString() })
    .eq('driver_id', driver.id).eq('job_id', jobId)
    .is('accepted_at', null).is('declined_at', null)
    .select('driver_id');
  if (updErr) return errorResponse(500, 'DB_ERROR', updErr.message);
  if (!updRows || updRows.length === 0) {
    return errorResponse(409, 'STATE_CHANGED', 'Assignment state changed — refresh');
  }

  await emitEvent(supabase, 'concierge.job_accepted', { job_id: jobId, driver_id: driver.id, role: r.assignment.role });
  return jsonResponse(200, { ok: true });
}

async function handleDecline(event, supabase, driver, jobId, body) {
  if (!isUuid(jobId)) return errorResponse(400, 'BAD_REQUEST', 'invalid job id');
  const reason = (body.reason || '').toString().trim();
  if (reason.length < 3 || reason.length > 500) return errorResponse(400, 'BAD_REQUEST', 'reason must be 3-500 chars');

  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  if (r.assignment.accepted_at) return errorResponse(409, 'ALREADY_ACCEPTED', 'Already accepted — contact dispatch');

  // Conditional update — symmetric to accept. Refuses if a concurrent
  // accept already won.
  const { data: updRows, error: updErr } = await supabase
    .from('concierge_job_drivers')
    .update({ declined_at: new Date().toISOString(), decline_reason: reason })
    .eq('driver_id', driver.id).eq('job_id', jobId)
    .is('accepted_at', null).is('declined_at', null)
    .select('driver_id');
  if (updErr) return errorResponse(500, 'DB_ERROR', updErr.message);
  if (!updRows || updRows.length === 0) {
    return errorResponse(409, 'STATE_CHANGED', 'Assignment state changed — refresh');
  }

  await emitEvent(supabase, 'concierge.job_declined', { job_id: jobId, driver_id: driver.id, reason });
  return jsonResponse(200, { ok: true });
}

async function handleStartLeg(event, supabase, driver, jobId, legId) {
  if (!isUuid(jobId) || !isUuid(legId)) return errorResponse(400, 'BAD_REQUEST', 'invalid id');
  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  if (!r.assignment.accepted_at) return errorResponse(409, 'NOT_ACCEPTED', 'Accept the job before starting a leg');

  const leg = r.job.legs.find(l => l.id === legId);
  if (!leg) return errorResponse(404, 'LEG_NOT_FOUND', 'Leg not found on this job');
  if (leg.driver_role !== r.assignment.role) {
    return errorResponse(403, 'LEG_NOT_YOURS', `This leg is for the ${leg.driver_role} driver`);
  }
  if (leg.status === 'in_progress') return jsonResponse(200, { ok: true, already_in_progress: true });
  if (leg.status === 'completed')   return errorResponse(409, 'LEG_ALREADY_COMPLETE', 'Leg already complete');

  // Out-of-order guard: every prior leg with the same driver_role must be
  // completed (or skipped) first. Cross-role legs may overlap (Tier 3/4).
  const earlierForMyRole = r.job.legs
    .filter(l => l.driver_role === r.assignment.role && l.sequence < leg.sequence);
  const blocker = earlierForMyRole.find(l => l.status !== 'completed' && l.status !== 'skipped');
  if (blocker) return errorResponse(422, 'LEG_OUT_OF_ORDER', `Complete leg ${blocker.sequence} first`);

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('concierge_job_legs')
    .update({ status: 'in_progress', started_at: nowIso })
    .eq('id', legId);
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  // First leg start → flip job to in_progress.
  if (r.job.status === 'scheduled') {
    await supabase.from('concierge_jobs').update({ status: 'in_progress' }).eq('id', jobId);
  }
  await emitEvent(supabase, 'concierge.leg_started', { job_id: jobId, leg_id: legId, driver_id: driver.id });
  return jsonResponse(200, { ok: true });
}

async function handleCompleteLeg(event, supabase, driver, jobId, legId) {
  if (!isUuid(jobId) || !isUuid(legId)) return errorResponse(400, 'BAD_REQUEST', 'invalid id');
  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  if (!r.assignment.accepted_at) return errorResponse(409, 'NOT_ACCEPTED', 'Accept the job before completing a leg');

  const leg = r.job.legs.find(l => l.id === legId);
  if (!leg) return errorResponse(404, 'LEG_NOT_FOUND', 'Leg not found on this job');
  if (leg.driver_role !== r.assignment.role) {
    return errorResponse(403, 'LEG_NOT_YOURS', `This leg is for the ${leg.driver_role} driver`);
  }
  if (leg.status === 'completed') return jsonResponse(200, { ok: true, already_complete: true });
  if (leg.status !== 'in_progress') return errorResponse(409, 'LEG_NOT_STARTED', 'Start the leg first');

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('concierge_job_legs')
    .update({ status: 'completed', completed_at: nowIso })
    .eq('id', legId);
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  // Last leg complete → flip job to completed.
  const { data: remaining } = await supabase
    .from('concierge_job_legs')
    .select('id, status').eq('job_id', jobId).neq('status', 'completed').neq('status', 'skipped');
  if (!remaining || remaining.length === 0) {
    await supabase.from('concierge_jobs').update({ status: 'completed' }).eq('id', jobId);
    await emitEvent(supabase, 'concierge.job_completed', { job_id: jobId });
    // Task #334 — credit each accepted driver's wallet. NO Stripe transfer
    // here: earnings sit at 'available' until the driver cashes out via
    // POST /me/cashout (Uber/Lyft model).
    try {
      const result = await accrueJobEarnings(supabase, jobId);
      if (result.credited > 0 || result.skipped > 0) {
        console.log(`[driver-api] earnings for job ${jobId}: credited=${result.credited} skipped=${result.skipped}`);
      }
    } catch (e) {
      console.error('[driver-api] accrueJobEarnings threw:', e.message);
    }
  }

  await emitEvent(supabase, 'concierge.leg_completed', { job_id: jobId, leg_id: legId, driver_id: driver.id });
  return jsonResponse(200, { ok: true });
}

async function handleLocation(event, supabase, driver, jobId, legId, body) {
  if (!isUuid(jobId) || !isUuid(legId)) return errorResponse(400, 'BAD_REQUEST', 'invalid id');
  const pings = Array.isArray(body.pings) ? body.pings : null;
  if (!pings || pings.length === 0) return errorResponse(400, 'BAD_REQUEST', 'pings array required');
  if (pings.length > 50) return errorResponse(400, 'BAD_REQUEST', 'maximum 50 pings per batch');

  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  // Same auth guards as start/complete: must have accepted the job, leg
  // must belong to this driver's role, and the leg must actually be in
  // progress. Without these checks an assigned driver could spray pings
  // for the other driver's leg or before the shift starts.
  if (!r.assignment.accepted_at) return errorResponse(409, 'NOT_ACCEPTED', 'Accept the job before posting location');
  const leg = r.job.legs.find(l => l.id === legId);
  if (!leg) return errorResponse(404, 'LEG_NOT_FOUND', 'Leg not found on this job');
  if (leg.driver_role !== r.assignment.role) {
    return errorResponse(403, 'LEG_NOT_YOURS', `This leg is for the ${leg.driver_role} driver`);
  }
  if (leg.status !== 'in_progress') {
    return errorResponse(409, 'LEG_NOT_STARTED', 'Start the leg before posting location');
  }

  const rows = [];
  for (const p of pings) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || lat < -90  || lat > 90)  return errorResponse(400, 'BAD_REQUEST', 'invalid lat');
    if (!isFinite(lng) || lng < -180 || lng > 180) return errorResponse(400, 'BAD_REQUEST', 'invalid lng');
    rows.push({
      driver_id: driver.id, job_id: jobId, leg_id: legId,
      lat, lng,
      accuracy_m: isFinite(Number(p.accuracy_m)) ? Number(p.accuracy_m) : null,
      heading:    isFinite(Number(p.heading))    ? Number(p.heading)    : null,
      speed_mps:  isFinite(Number(p.speed_mps))  ? Number(p.speed_mps)  : null,
      recorded_at: p.recorded_at && !isNaN(Date.parse(p.recorded_at)) ? p.recorded_at : new Date().toISOString()
    });
  }
  const { error } = await supabase.from('driver_location_pings').insert(rows);
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  // Task #447 — fan out the freshest ping to the member's live map via
  // Realtime broadcast. Members CAN'T subscribe to driver_location_pings
  // directly (RLS blocks it; see 20260516_driver_pings_realtime.sql
  // header) so the server relays the single most-recent ping on a
  // per-job broadcast channel. The channel name is the job's UUID, which
  // the member already learned from GET /api/concierge/active-job-tracking,
  // and the payload carries only the same fields that endpoint already
  // returns to that member. Best-effort: a broadcast failure must NOT
  // fail the driver's ping POST (the canonical row is already saved and
  // the member will catch up on the next 60s ETA refresh).
  try {
    const latest = rows[rows.length - 1];
    await supabase.channel('concierge_job:' + jobId).send({
      type: 'broadcast',
      event: 'driver_ping',
      payload: {
        job_id:     jobId,
        driver_id:  driver.id,
        leg_id:     legId,
        lat:        latest.lat,
        lng:        latest.lng,
        heading:    latest.heading,
        speed_mps:  latest.speed_mps,
        accuracy_m: latest.accuracy_m,
        recorded_at: latest.recorded_at
      }
    });
  } catch (e) {
    console.warn('[driver-api] broadcast failed for job', jobId, e && e.message);
  }

  return jsonResponse(200, { inserted: rows.length });
}

// ---------------------------------------------------------------------------
// Stripe Connect onboarding (Task #334)
//
// POST /me/stripe/onboard — creates an Express account if the driver
//   doesn't have one and returns a single-use account_links URL the
//   driver app opens in a browser tab. Mirrors the pattern used by
//   stripe-connect-onboard.js for founders.
// GET  /me/stripe/status   — returns charges_enabled / payouts_enabled /
//   details_submitted / requirements from Stripe so the driver app can
//   show "verified" vs "action required".
// ---------------------------------------------------------------------------
async function handleStripeOnboard(event, supabase, driver) {
  const stripe = getStripe();
  if (!stripe) return errorResponse(503, 'STRIPE_UNAVAILABLE', 'Stripe is not configured on the server');

  let accountId = driver.stripe_connect_account_id;
  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        email: driver.email || undefined,
        metadata: { driver_id: driver.id, full_name: driver.full_name || '' },
        capabilities: { transfers: { requested: true } }
      });
      accountId = account.id;
      const { error: updErr } = await supabase
        .from('drivers')
        .update({ stripe_connect_account_id: accountId, updated_at: new Date().toISOString() })
        .eq('id', driver.id);
      if (updErr) return errorResponse(500, 'DB_ERROR', updErr.message);
    } catch (e) {
      return errorResponse(502, 'STRIPE_ERROR', e.message || 'Stripe account create failed');
    }
  }

  const returnBase = process.env.DRIVER_APP_RETURN_URL || 'https://mycarconcierge.com/driver-stripe-return';
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${returnBase}?stripe=refresh`,
      return_url:  `${returnBase}?stripe=success`,
      type: 'account_onboarding'
    });
    return jsonResponse(200, { url: link.url, account_id: accountId });
  } catch (e) {
    return errorResponse(502, 'STRIPE_ERROR', e.message || 'Account link create failed');
  }
}

async function handleStripeStatus(event, supabase, driver) {
  if (!driver.stripe_connect_account_id) {
    return jsonResponse(200, {
      connected: false, details_submitted: false,
      charges_enabled: false, payouts_enabled: false
    });
  }
  const stripe = getStripe();
  if (!stripe) return errorResponse(503, 'STRIPE_UNAVAILABLE', 'Stripe is not configured on the server');
  try {
    const acct = await stripe.accounts.retrieve(driver.stripe_connect_account_id);
    // Mirror the driver row's stripe_payouts_enabled flag so admin lists
    // don't have to re-call Stripe on every render.
    if (!!acct.payouts_enabled !== !!driver.stripe_payouts_enabled) {
      await supabase.from('drivers')
        .update({ stripe_payouts_enabled: !!acct.payouts_enabled, updated_at: new Date().toISOString() })
        .eq('id', driver.id);
    }
    // If Stripe just turned payouts on, promote any 'pending_account'
    // earnings the driver accumulated pre-onboarding to 'available' so
    // they can immediately be cashed out.
    if (acct.payouts_enabled) {
      await supabase.from('driver_earnings')
        .update({ payout_status: 'available' })
        .eq('driver_id', driver.id)
        .eq('payout_status', 'pending_account');
    }
    return jsonResponse(200, {
      connected: true,
      account_id: acct.id,
      details_submitted: !!acct.details_submitted,
      charges_enabled:   !!acct.charges_enabled,
      payouts_enabled:   !!acct.payouts_enabled,
      requirements:      acct.requirements || null
    });
  } catch (e) {
    return errorResponse(502, 'STRIPE_ERROR', e.message || 'Account retrieve failed');
  }
}

// ---------------------------------------------------------------------------
// Wallet & cash-out (Task #334 round 3)
//
// GET  /me/wallet  — current balance breakdown + recent earnings + recent
//                    cash-outs. Backed by the driver_wallet_balances view
//                    (see migration 20260516d).
// POST /me/cashout — { method: 'standard' | 'instant' } — sweeps all
//                    'available' earnings into one Stripe transfer +
//                    (for instant) one Instant Payout. See executeCashout
//                    above for the full transaction flow.
// ---------------------------------------------------------------------------
async function handleWallet(event, supabase, driver) {
  const { data: bal } = await supabase
    .from('driver_wallet_balances')
    .select('available_cents, pending_account_cents, failed_cents, in_flight_cents, lifetime_paid_cents')
    .eq('driver_id', driver.id)
    .maybeSingle();

  const { data: recentEarnings } = await supabase
    .from('driver_earnings')
    .select('id, job_id, amount_cents, kind, payout_status, recorded_at, cashout_id, notes')
    .eq('driver_id', driver.id)
    .order('recorded_at', { ascending: false })
    .limit(50);

  const { data: recentCashouts } = await supabase
    .from('driver_cashouts')
    .select('id, amount_cents, fee_cents, method, status, stripe_transfer_id, stripe_payout_id, error, requested_at, completed_at')
    .eq('driver_id', driver.id)
    .order('requested_at', { ascending: false })
    .limit(20);

  return jsonResponse(200, {
    balance: bal || {
      available_cents: 0, pending_account_cents: 0, failed_cents: 0,
      in_flight_cents: 0, lifetime_paid_cents: 0
    },
    cashout_minimum_cents: 100,
    instant_fee_pct: 0.015,
    can_cash_out: !!(driver.stripe_connect_account_id && driver.stripe_payouts_enabled),
    connect_status: {
      connected: !!driver.stripe_connect_account_id,
      payouts_enabled: !!driver.stripe_payouts_enabled
    },
    recent_earnings: recentEarnings || [],
    recent_cashouts: recentCashouts || []
  });
}

async function handleCashout(event, supabase, driver, body) {
  const method = body?.method === 'instant' ? 'instant' : 'standard';
  const result = await executeCashout(supabase, driver, {
    method, initiatedByKind: 'driver', initiatedById: driver.profile_id
  });
  // executeCashout returns its own { statusCode, body } shape; map to ours.
  return jsonResponse(result.statusCode, result.body);
}

async function handleEarnings(event, supabase, driver) {
  const range = (event.queryStringParameters || {}).range || 'all';
  let since = null;
  const now = new Date();
  if (range === 'today') {
    const d = new Date(now); d.setUTCHours(0,0,0,0); since = d.toISOString();
  } else if (range === 'week') {
    since = new Date(now.getTime() - 7  * 86400000).toISOString();
  } else if (range === 'month') {
    since = new Date(now.getTime() - 30 * 86400000).toISOString();
  } else if (range !== 'all') {
    return errorResponse(400, 'BAD_REQUEST', 'range must be today|week|month|all');
  }

  let q = supabase.from('driver_earnings')
    .select('id, job_id, leg_id, amount_cents, kind, notes, recorded_at')
    .eq('driver_id', driver.id)
    .order('recorded_at', { ascending: false })
    .limit(500);
  if (since) q = q.gte('recorded_at', since);
  const { data, error } = await q;
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  const total = (data || []).reduce((s, r) => s + (r.amount_cents || 0), 0);
  return jsonResponse(200, { range, total_cents: total, entries: data || [] });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
function stripPrefix(p) {
  return (p || '')
    .replace(/^\/?\.netlify\/functions\/driver-api\/?/, '')
    .replace(/^\/?api\/driver\/v1\/?/, '')
    .replace(/^\/+/, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  const supabase = getServiceSupabase();
  if (!supabase) return errorResponse(500, 'CONFIG', 'Database not configured');

  const route = stripPrefix(event.path);
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return errorResponse(400, 'BAD_REQUEST', 'invalid JSON body'); }
  }

  try {
    // Public auth routes ---------------------------------------------------
    if (method === 'POST' && route === 'auth/send-code')   return await handleSendCode(event, supabase, body);
    if (method === 'POST' && route === 'auth/verify-code') return await handleVerifyCode(event, supabase, body);
    if (method === 'POST' && route === 'auth/refresh')     return await handleRefresh(event, supabase, body);

    // Authenticated routes -------------------------------------------------
    const auth = await authenticateDriver(event, supabase);
    if (auth.error) return auth.error;
    const driver = auth.driver;

    if (method === 'GET'  && route === 'me')                return await handleMe(event, supabase, driver);
    if (method === 'GET'  && route === 'jobs')              return await handleListJobs(event, supabase, driver);
    if (method === 'GET'  && route === 'earnings')          return await handleEarnings(event, supabase, driver);
    if (method === 'POST' && route === 'me/stripe/onboard') return await handleStripeOnboard(event, supabase, driver);
    if (method === 'GET'  && route === 'me/stripe/status')  return await handleStripeStatus(event, supabase, driver);
    if (method === 'GET'  && route === 'me/wallet')         return await handleWallet(event, supabase, driver);
    if (method === 'POST' && route === 'me/cashout')        return await handleCashout(event, supabase, driver, body);

    // Job-scoped routes ---------------------------------------------------
    let m = route.match(/^jobs\/([^/]+)$/);
    if (m && method === 'GET')  return await handleGetJob(event, supabase, driver, m[1]);

    m = route.match(/^jobs\/([^/]+)\/accept$/);
    if (m && method === 'POST') return await handleAccept(event, supabase, driver, m[1]);

    m = route.match(/^jobs\/([^/]+)\/decline$/);
    if (m && method === 'POST') return await handleDecline(event, supabase, driver, m[1], body);

    m = route.match(/^jobs\/([^/]+)\/legs\/([^/]+)\/start$/);
    if (m && method === 'POST') return await handleStartLeg(event, supabase, driver, m[1], m[2]);

    m = route.match(/^jobs\/([^/]+)\/legs\/([^/]+)\/complete$/);
    if (m && method === 'POST') return await handleCompleteLeg(event, supabase, driver, m[1], m[2]);

    m = route.match(/^jobs\/([^/]+)\/legs\/([^/]+)\/location$/);
    if (m && method === 'POST') return await handleLocation(event, supabase, driver, m[1], m[2], body);

    return errorResponse(404, 'NOT_FOUND', 'Unknown route', { route, method });
  } catch (e) {
    console.error('[driver-api] handler error:', e);
    return errorResponse(500, 'INTERNAL', e.message);
  }
};

// Re-export internals for the smoke test.
module.exports._stripPrefix = stripPrefix;
module.exports._mintSupabaseSession = mintSupabaseSession;
module.exports._accrueJobEarnings = accrueJobEarnings;
module.exports._executeCashout    = executeCashout;
