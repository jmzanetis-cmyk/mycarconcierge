# Claude Code task briefs — MCC priority sweep

How to use this file: each section is a **standalone Claude Code prompt**. Copy the whole block (from `# Task #NNN` to the end of `## Verify`) into Claude Code as the first message. Each is scoped to ~1 PR so CC stays focused.

Conventions:
- Repo root is `/home/runner/workspace` (or wherever the MCC checkout lives).
- Smoke tests: `node _smoke-test.js`. Function tests: `bash scripts/run-function-tests.sh`. Lint: `npm run lint`.
- Never paste secret values into chat — read them from env. Supabase DDL: write a migration file under `supabase/migrations/`, do not try to apply it from CC.
- After any edit to `www/*.js` or `www/*.html` that ships to Android: `npm run cap:sync`.
- Don't add commentary or emojis to source files. Match the surrounding style.

---

## Tier 0 — unblock everything else (do first)

### Task #468 — Restore workspace SUPABASE_ANON_KEY

**Why:** Smoke steps 23, 24, 24b (JWT half), 24d, 24e, 24f, 31 all skip with "signIn failed (Invalid API key)" because the workspace anon key is truncated. Every new authz test we've added (#359/#360/#464/#466) silently skips locally until this is fixed. **No code change** — this is an env fix.

**Steps:**
1. Read `_smoke-test.js` around the string `SUPABASE_ANON_KEY misconfigured` to confirm the skip path.
2. Tell the human operator: open Replit → Secrets → set `SUPABASE_ANON_KEY` to the project's real anon JWT (it must be a 3-part `eyJ...` JWT, hundreds of chars long; the current value is shorter). The correct value is the `anon` key from Supabase dashboard → Project settings → API; same value already lives in Netlify prod env.
3. Do **not** print the new value back. Once they confirm it's set, run `node _smoke-test.js` and check that steps 23, 24, 24d, 24e (or 24f), 31 print real assertions instead of "SKIPPED — no JWT".

**Verify:** `node _smoke-test.js 2>&1 | grep -E "STEP 2[34]|SKIPPED"` shows no SKIPPED lines for the JWT-gated steps.

---

## Tier 1 — Launch-blockers (the user's own [LAUNCH NN] tags)

### Task #316 — [LAUNCH 01] Fix admin route safety lockdown test

**Why:** `npm test` currently fails 1/69 — `netlify/functions/admin-routes-auth.test.js` says `agent-fleet-admin.js exposes 0 route conditionals but the lockdown test expects 45`. The Task #264 SonarCloud sweep rewrote the `Object.assign({}, …)` spreads in `agent-fleet-admin.js`; the test's detection regex no longer matches. **Fix the test, not the file** — the routes are still there.

**Steps:**
1. Run `node netlify/functions/admin-routes-auth.test.js` to see the exact failure.
2. Open `netlify/functions/admin-routes-auth.test.js`, find `EXPECTED_FLEET_CONDITIONALS` and the regex that counts route conditionals in `agent-fleet-admin.js`.
3. Open `netlify/functions/agent-fleet-admin.js`, search for the new route-handler shape (probably `{ ... }` object-literal spread or destructured route maps). Update the regex to recognise both old and new shapes, OR replace the regex with an AST-based count if simpler. Recount and update `EXPECTED_FLEET_CONDITIONALS` to the new actual.
4. Re-run; expect 69/69.

**Verify:** `npm test` exits 0. Counter assertion message in the test still mentions the actual route count so future drift fails loudly.

---

### Task #271 — [LAUNCH 05] DB-trigger lockdown on admin-only payment columns

**Why:** `admin.html` lets admins edit `admin_note`, `amount_total`, `amount_mcc_fee`, `refund_amount` on `payments` and delete rows. The gate is **client-side only** — a non-admin with an authenticated session could write those columns directly via Supabase. Wholesale RLS on `payments` would break member/provider write paths, so use column-scoped triggers (the pattern from `20260428e_provider_writes_rls_lockdown.sql`).

**Steps:**
1. Read `supabase/migrations/20260428e_provider_writes_rls_lockdown.sql` and `supabase/migrations/20260429_admin_payments_edit_delete.sql` for the trigger pattern.
2. Read `www/admin.html:918` and `www/admin.js` payment edit/delete handlers; list every column those handlers mutate vs. what member/provider code touches (search `from('payments').update` across `www/`).
3. Create `supabase/migrations/20260524_payments_admin_only_columns.sql`:
   - `BEFORE UPDATE` trigger on `payments` that raises if any of `admin_note`, `amount_total`, `amount_mcc_fee`, `refund_amount` is in `to_jsonb(NEW) - to_jsonb(OLD)` AND the JWT role from `auth.jwt() ->> 'role'` / `profiles.role` is not `admin`. Allow `service_role` JWTs unconditionally.
   - `BEFORE DELETE` trigger rejecting non-admin deletes (extend the existing one if it's still narrower than this).
4. Add a function-test under `netlify/functions-tests/payments-admin-only-cols.test.js` that uses the service-role client to simulate a non-admin JWT (or stubs `auth.jwt()`) and asserts the trigger raises. Real RLS roundtrip is preferred — stub via `set_config('request.jwt.claims', '{"role":"member"}', true)` in psql-style migrations or in a pg test.

**Verify:**
- Provide the SQL bundle to the human to paste into Supabase SQL Editor (Replit cannot reach prod DB directly). After they run it, smoke from psql / Supabase UI: as a member JWT, UPDATE on `admin_note` errors; as service role, succeeds. Admin Edit/Delete in `admin.html` still works.
- `bash scripts/run-function-tests.sh` is green.

---

### Task #289 — [LAUNCH 06] RLS proof: providers can't dismiss other providers' alerts

**Why:** Task #204 only proved the happy path. No test proves the RLS policy on `provider_alerts` actually blocks Provider A from updating Provider B's row. A regression in RLS would let one provider silently dismiss another's compliance warnings.

**Steps:**
1. Read `tests/bgc-alerts-banner.spec.js` for the Playwright pattern, and `www/bgc-compliance.js` → `dismissAlert` for the update shape.
2. Add a new test (Playwright spec OR a node-based supabase-js test under `netlify/functions-tests/provider-alerts-rls.test.js` — node is faster and doesn't need a browser):
   - Service-role: provision Provider A + Provider B, insert one `provider_alerts` row for each (`provider_id = B`, `is_dismissed=false`).
   - Sign in as A via `auth.signInWithPassword` (gated on `SUPABASE_ANON_KEY` like step24e).
   - As A's authed client, run `update({ is_dismissed: true }).eq('id', B_alert_id)`.
   - Assert either the response errors, OR `data` is `[]` (0 rows affected), AND a service-role re-read shows `is_dismissed` still `false`.
3. Finally-block cleanup: delete both alert rows + both auth users.

**Verify:** New test passes against prod schema; if the RLS policy is currently broken, the test fails loudly so it can be tightened before launch.

---

### Task #268 — [LAUNCH 07] Honour Twilio STOP replies

**Why:** Twilio auto-blocks at the carrier level when a number replies STOP, but our `bgc-send-reminders.js` cron keeps trying — wasting quota and burying real failures. Providers also have no in-app cue that texts are blocked.

**Steps:**
1. Read `netlify/functions/bgc-send-reminders.js` to find which columns it consults (`provider_notification_prefs.bgc_reminder_*_sms`, `sms_phone`, fallback to `profiles.phone`).
2. Create `netlify/functions/twilio-sms-inbound.js`:
   - Validate `X-Twilio-Signature` per Twilio docs (HMAC-SHA1 of URL + sorted body, base64, compared to header).
   - Parse `From` and `Body`. If body upper-cased trimmed is in `{STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT}`:
     - Service-role Supabase: find `provider_notification_prefs` rows where `sms_phone = From` OR (`sms_phone` IS NULL AND profile row's `phone = From`).
     - Set every `bgc_reminder_*_sms` column to `false` and `sms_phone` to NULL.
     - Insert a row into `sms_log` (or new `sms_opt_outs`) with `phone`, `reason='STOP_KEYWORD'`, `received_at=now()`.
   - For Twilio "thank you" auto-reply: return TwiML `<Response></Response>` (empty 200) — Twilio handles the STOP confirmation message itself when Advanced Opt-Out is configured.
3. Wire route: `www/_redirects` → `/twilio/sms-inbound  /.netlify/functions/twilio-sms-inbound  200`. Set Twilio Console → Phone Number → Messaging webhook to `https://mycarconcierge.com/twilio/sms-inbound` (tell the human; don't try to do via API).
4. Test `netlify/functions-tests/twilio-sms-stop.test.js`: stub Supabase + signature validator, send `Body=STOP From=+15551234567`, assert all SMS flags flip + audit row inserted. Also assert unsigned requests return 403.
5. Required env: confirm `TWILIO_AUTH_TOKEN` is the same value Twilio signs with (it is — same account).

**Verify:** Function test green. Manual: text STOP to the prod number from a phone whose number is in `sms_phone`, then reload Compliance preferences — all SMS toggles read off.

---

### Task #272 — [LAUNCH 08] Admin audit-log UI

**Why:** Task #270 writes `edit_payment` / `delete_payment` rows to `admin_audit_log`, but there's no UI. Senior admins can't audit junior admins without raw Supabase queries.

**Steps:**
1. Read `supabase/migrations/20260424_admin_audit_log.sql` for the table shape.
2. Add an `Audit Log` panel section in `www/admin.html` next to `Payments & Escrow`. Match the structural style of the Payments section (table + filters + pagination).
3. In `www/admin.js` add `loadAdminAuditLog(filters)` that calls a new `GET /api/admin/audit-log` endpoint with query params `action_type`, `target_type`, `from_date`, `to_date`, `page`, `page_size`. Use `adminFetch` + `renderAdminAuthError` (Task #355 helpers) so auth errors are consistent.
4. Add Netlify function `netlify/functions/admin-audit-log.js` that authz-gates on `x-admin-password` matching `ADMIN_PASSWORD` (or admin JWT — match the convention used by `provider-admin.js`), runs the parameterised query against `admin_audit_log` joined to `profiles` for `performed_by → full_name, email`. Mirror in `www/server.js` for dev. Route in `www/_redirects`.
5. Table columns: timestamp, performed_by (name + email), action, target_type, target_id, expandable JSON metadata cell. When `target_type='payment'`, render `target_id` as a link that calls the existing payment-detail open helper.
6. Server-side pagination + ordering by `created_at DESC`. Default page size 50, max 200.

**Verify:** New function-test stubs Supabase; admin-password gate returns 401 without header. Manual: admin.html shows recent edits; filtering by `delete_payment` returns only deletes; clicking a payment row opens its detail panel.

---

## Tier 2 — silently-broken in prod (revenue + UX risk)

### Task #394 — Stripe webhook silently 200s on credit-insert failure

**Why:** `www/server.js:~10821` catches DB errors when adding bid credits and returns 200 to Stripe. User has paid; Stripe won't retry. Out of scope for the Task #229 sweep.

**Steps:**
1. Read `www/server.js` around line 10821 (`} catch (creditErr) {` inside the Stripe webhook bid-credit handler). Identify the surrounding switch on `event.type`.
2. Pick the safest fix:
   - **Option A (preferred):** create a `stripe_webhook_failures` table (migration: `id`, `event_id`, `event_type`, `payload jsonb`, `error_message`, `retry_count`, `last_retry_at`, `resolved_at`, `created_at`). On insert failure, insert a row here AND return 5xx so Stripe retries. Use `event.id` as idempotency key — if a row with that `event_id` already exists in `payments` / `bid_credits`, return 200.
   - **Option B (smaller):** just return 5xx and rely on Stripe's built-in retry ladder. Document that Stripe gives up after ~3 days; without a queue, persistent DB outages still lose credits.
3. Add idempotency check at the top of the credit-insert path: `SELECT 1 FROM bid_credits WHERE stripe_event_id = $1` — if exists, log and return 200.
4. Scheduled function `stripe-webhook-failures-scheduled.js` (cron `0 */6 * * *`) re-attempts unresolved rows; after 5 failures, emails admin via Resend.
5. Test: in `netlify/functions-tests/stripe-webhook-credit-retry.test.js`, stub the Supabase client to force a credit-insert failure, assert response status is 5xx AND a `stripe_webhook_failures` row exists.

**Verify:** Test green. Manual replay of a real webhook event twice should produce only one `bid_credits` row.

---

### Task #455 — Wire (or delete) 8 silently-404ing payment endpoints

**Why:** Task #352 audit (`docs/api-route-coverage-audit.md`) found 8 payment endpoint families that clients call but no handler exists for. `.catch(()=>{})` wrappers swallow the 404. Same shape as the Task #257 outage.

**Endpoint list (triage one by one):**
- `POST /api/apple-pay/validate` + `POST /api/apple-pay/process` — `www/mobile-pay.js:140,156`
- `POST /api/create-bid-checkout-mobile` — `www/providers.js:5371`, `www/providers-bids.js:1129` (web variant exists)
- `POST /api/escrow/create-with-payment-method` — `www/stripeutils.js:442`, `www/members-packages.js:3810,3869`
- `POST /api/connect/create-account` + `/onboarding-link` + `/transfer` — `www/stripeutils.js:216,232,247` (NOT the routed `/api/stripe/connect/*` family — confirm callers)
- `GET /api/payments/methods` + `POST /api/payments/save-method` — `www/stripeutils.js:313,327`

**Per-endpoint procedure:**
1. Read the caller file + the spec line. Decide: is this a real feature users actually hit, or dead client code?
   - **Dead:** delete the caller and its UI affordance. Add a one-line comment explaining the removal date + task #.
   - **Real:** create `netlify/functions/<name>.js`, mirror in `www/server.js` for dev, add `_redirects` rule, write a function-test.
2. Apple Pay specifically: needs an Apple merchant cert + domain verification — confirm with human before wiring. If certs aren't ready, delete the buttons and file a follow-up for the cert work.
3. Tier the work: do the easy deletes first, then the simple GETs (`/api/payments/methods`), then the Stripe-Connect helpers, then Apple Pay last.

**Verify:** After each endpoint: caller no longer hits `.catch`. Add the URL to `netlify/functions-tests/_broken-client-callers.json` removal list (see #457). Function-test passes.

---

### Task #456 — Wire (or delete) 6 silently-empty AI/calendar/tracking endpoints

**Why:** Same audit as #455, non-payment side. User-visible symptoms: empty care-plans list, broken "Add to calendar", missing OBD history, blank AI suggestions, no review summary, no "I'm on the way" tracking ping.

**Endpoints:**
- `GET /api/care-plans/mine` — `www/members-care-plans.js:149`
- `GET /api/appointments/:apptId/ical` — `www/members-packages.js:2485`, `www/providers-jobs.js:1833`
- `GET /api/obd/scans/:vehicleId` — `www/members.js:7819`
- `POST /api/package/ai-suggestions` (singular — plural `/api/packages/...` IS handled) — `www/members-packages.js:85`
- `GET /api/review-summary/:providerId` + `POST /api/review-summary` — `www/supabaseclient.js:1035,1049`
- `POST /api/tracking/update` — `www/providers-jobs.js:420`

**Procedure:** identical to #455. The `.ics` calendar endpoint is the most user-visible — do it first. AI/review-summary endpoints likely have existing logic in adjacent functions you can extract.

**Verify:** Same as #455.

---

### Task #411 — Real-time alert when audit-log write fails after Stripe moved money

**Why:** Task #323 surfaces `audit_warning` to the UI. Lost if the operator navigates away or it's an agent-driven apply. Email needed.

**Steps:**
1. Read `netlify/functions/agent-fleet-admin.js`, find every code path that returns `audit_warning` in the response.
2. Read `netlify/functions/anthropic-health-scheduled.js` for the Resend pattern + `ai_action_log` dedup.
3. Extract helper `lib/audit-warning-alert.js` exporting `maybeSendAuditWarningAlert({ action_id, slug, db_error })`:
   - Rate-limit: query `ai_action_log` for `module='audit_warning' AND action_type='alert' AND outcome='sent' AND decision->>'action_id' = $action_id` within last 24h — skip if exists.
   - Send email via Resend (`ADMIN_EMAIL || MCC_FROM_EMAIL`, from `MCC_FROM_EMAIL`). Body includes action_id, slug, db_error, deep-link `https://mycarconcierge.com/admin/agent-fleet-detail.html?slug=<slug>&action=<action_id>`.
   - Always log to `ai_action_log` (`outcome='sent'` or `'failed'`, `escalated=true`).
4. Call the helper in every audit-warning return path.
5. Test `agent-fleet-audit-warning-email.test.js`: stub Supabase + Resend, force apply path to return audit_warning, assert helper invoked + dedup works on second call.

**Verify:** Function-test green. Manual `curl` of an apply endpoint with a forced audit failure produces exactly one email.

---

### Task #412 — Detect stuck `retry_payout` Treasurer actions

**Why:** `/actions/audit-mismatches` only scans `approve_capture` + `approve_refund` because they have a local DB handle. `retry_payout` has none — a payout that succeeded on Stripe but failed to log locally is invisible.

**Steps:**
1. Read `netlify/functions/agent-fleet-admin.js` → `listAuditMismatches` and `_treasurerRetryPayout`. Look at how the latter sets `metadata.treasurer_action_id` on the Stripe payout.
2. Extend `listAuditMismatches`: for each pending `retry_payout` action in `agent_actions`, get the provider's connected `account_id`, then call `stripe.payouts.list({ limit: 100 }, { stripeAccount: account_id })` filtered (client-side, since the API filter doesn't accept metadata) by `payout.metadata.treasurer_action_id === action.id`. If a matching payout is `paid` or `in_transit` while the action's `status` is still pending, emit a mismatch row.
3. Add stub-Stripe test in `netlify/functions-tests/agent-fleet-audit-warning.test.js` (sibling describe block): seed one pending `retry_payout` action; stub `stripe.payouts.list` to return a payout with matching metadata; assert mismatch detected.

**Verify:** Test green. Manual: admin UI's audit-mismatches panel surfaces the new row type.

---

### Task #419 — Care-plan status mismatch with DB CHECK constraint

**Why:** `/api/care-plans/:id/complete` used to write `status='completed'` + `payment_method='stripe_escrow'` which violate the CHECK constraints (status allowed: open/awarded/expired/cancelled; payment_method: cash/card/check/transfer/other). Atomic update was silently failing. Quick fix shipped (drop the bad fields); root fix pending.

**Steps:**
1. Read `www/server.js` `/complete` handler around line 46441–46545.
2. `rg "care_plans.*status\s*[:=]\s*['\"]completed['\"]"` and `rg "care_plans.*payment_method\s*[:=]"` across `www/` + `netlify/`. Make a list of every write site.
3. Decision: pick the model. Recommended — **don't add `completed` to the CHECK**; instead make `care_plan_completions` the single source of truth for terminal state. Audit every reader (`status='completed'` or `payment_method='stripe_escrow'` consumer) and switch to checking `care_plan_completions.status='captured'`.
4. Create migration `supabase/migrations/20260524_care_plan_status_helper.sql` adding `lib/care-plan-status.js` allowlist helper (`STATUS_VALUES`, `PAYMENT_METHOD_VALUES`) + a thin `validateCarePlanUpdate(patch)` function exported for server callers. Wrap every `supabase.from('care_plans').update(...)` through this helper.
5. Regression test `netlify/functions-tests/care-plan-status-allowlist.test.js`: feed every literal currently in the codebase through the helper; any invalid value throws.

**Verify:** Helper test green; `rg "status:\s*['\"]completed['\"]"` in care-plan code returns 0 hits; existing `tests/care-plan-payment-journey.spec.js` still passes.

---

### Task #438 — Fix the pre-existing failing self-bid test

**Why:** `netlify/functions-tests/plan-bids-self-bid.test.js` was already red before any recent task. Blocks using `scripts/run-function-tests.sh` as a release gate (27/28 → should be 28/28).

**Steps:**
1. `node netlify/functions-tests/plan-bids-self-bid.test.js 2>&1 | head -80` to see the actual failure.
2. Likely causes (check in order):
   - Test stubs are stale vs. current handler signature.
   - Handler now requires a column the stub Supabase doesn't return.
   - Auth wrapper changed and the test's mock JWT is rejected.
3. **Fix the underlying code or the test honestly — do not delete or skip.** The whole point is the self-bid guard stays caught.
4. Re-run `bash scripts/run-function-tests.sh`, expect 28/28.

**Verify:** Suite green; the assertion in the test still covers the original self-bid case (read the assertion text aloud — if you weakened it, redo).

---

## Tier 3 — security pins + cheap follow-ups

### Task #467 — Smoke step: re-finalize as already-promoted provider

**Why:** Direct continuation of #466. Stale tab could POST `/finalize` again — today the endpoint re-writes the profile, potentially resetting bid counters or flipping `is_founding_provider`.

**Steps:**
1. Read `_smoke-test.js` step24eFinalizePromotion (the step Task #360 added) for the user-provisioning + finalize-call helpers.
2. Add step `step24fFinalizeReFinalize` after step24e:
   - Provision user C with a **standard** (non-founding) application; call `/finalize` once → assert promoted with `free_trial_bids=3`.
   - Insert a second application for the same user with `is_founding_provider=true` and `created_at=now()`.
   - Call `/finalize` again with C's JWT. Assert ONE of these (decide in handler doc first):
     - **Strict (preferred):** response is 4xx (already promoted), profile unchanged, still `free_trial_bids=3`, still `is_founding_provider=false`.
     - **Idempotent-update:** response 200 but profile counters unchanged (because the first call already promoted).
   - Cleanup user C in finally.
3. Read `netlify/functions/provider-onboarding.js` `handleFinalize`. Decide which behaviour is correct and either:
   - Add an early-return `if (profile.role === 'provider') return { statusCode: 409, body: { error: 'already_provider' } };`, OR
   - Add a doc comment explaining the idempotent-update guarantee + code paths that preserve the counters.
4. Register `step24fFinalizeReFinalize` in the `STEPS` array.

**Verify:** New step prints PASS lines and cleans up. `node --check _smoke-test.js`. If you chose the strict path, the new 409 is also covered by an explicit assertion.

---

### Task #375 — Regression test: providers can't read decrypted BGC key

**Why:** Task #372 revokes `SELECT (bgchecks_api_key)` from `authenticated`/`anon`. Pinning it stops a future migration from silently re-granting.

**Steps:**
1. Read `supabase/migrations/20260515e_bgc_live_mode.sql` + `netlify/functions-tests/bgc-live.test.js`.
2. Add `netlify/functions-tests/bgc-rls.test.js`:
   - Service-role: provision a provider profile + a `provider_background_check_accounts` row with `bgchecks_api_key='SECRET_TOKEN_TEST'`.
   - Sign in as that provider via `auth.signInWithPassword`.
   - Authed client: `from('provider_background_check_accounts').select('*').eq('provider_id', providerId).maybeSingle()`. Assert response either errors OR omits `bgchecks_api_key` (PostgREST omits ungranted columns when `*` is requested). Explicitly `select('bgchecks_api_key')` should error.
   - Assert `from('provider_background_check_accounts_public').select('has_api_key, provider_id')` returns `has_api_key=true`.
3. Skip cleanly when `SUPABASE_ANON_KEY` can't mint JWTs (mirror the smoke-step pattern).

**Verify:** Function-test green. Manually re-run after applying any future BGC migration.

---

### Task #363 — Resend webhook: fail-closed in prod when secret missing

**Why:** `outreach-resend-webhook.js` (and `www/outreach-engine-api.js` mirror) accept unsigned requests when `RESEND_WEBHOOK_SECRET` is unset. Lets anyone forge bounce/complaint events.

**Steps:**
1. Read both files; locate the secret check and the signature-validation branch.
2. Change: if `process.env.NODE_ENV === 'production'` AND `!process.env.RESEND_WEBHOOK_SECRET`, return `{ statusCode: 401, body: 'webhook secret not configured' }`. Otherwise log a single startup warning `[outreach-resend-webhook] dev mode: skipping signature check` and proceed.
3. Even in dev, if the request includes a signature header AND a secret is set, validate strictly (don't skip on mismatch).
4. Test `netlify/functions-tests/outreach-resend-webhook-auth.test.js`: unset secret + `NODE_ENV=production` → 401. Set secret + missing header → 401. Set secret + valid HMAC → 200.

**Verify:** Function-test green. `rg RESEND_WEBHOOK_SECRET netlify/` shows fail-closed behaviour in both files.

---

### Task #463 — Sweep remaining admin loaders onto adminFetch + renderAdminAuthError

**Why:** Task #355 + #464 wired the named loaders. ~20–30 more (`loadAnalytics`, `loadChatInsights`, `loadTeamMembers`, `loadPendingInvites`, `loadTrafficData`, `loadEmailOutreachLeads`, `loadGrowthFunnel`, `loadApprovalQueue`, `loadSaasSubscriptions`, `loadWhiteLabelTenants`, `loadApiUsage`, `loadSurveyAnalytics`, `loadMemberSurveyAnalytics`, founder/payout/violation loaders) still surface bare `Failed to fetch` / `HTTP 401`.

**Steps:**
1. `rg -n "color:var\(--accent-red\).*(Error|Failed to load|HTTP)" www/admin.js` → master list.
2. Read the helpers `adminFetch`, `renderAdminAuthError`, `openAdminReauth` in `www/admin.js` (definitions added in Task #355).
3. For each loader: replace its `fetch(...)` with `adminFetch(...)`; replace its `.catch` rendering with `renderAdminAuthError(containerEl, err, { onRetry: () => loadX() })`. Match the pattern used by the loaders Task #355 already converted (`loadProviderManagement`, etc.).
4. Don't touch other error UX — only the auth-failure (401/403/NO_ADMIN_AUTH) path.
5. After edits: `npm run cap:sync`.

**Verify:** `rg "color:var\(--accent-red\).*(Error|Failed to load|HTTP)" www/admin.js` returns 0 hits. Manual: clear `mcc_admin_pass` from localStorage, reload admin.html → every panel shows the same "Sign in again" button instead of a dead-end string.

---

### Task #404 — Stop logging untrusted input in `_smoke-test.js`

**Why:** SonarCloud flags 5 minor findings.

**Steps:**
1. SonarCloud report (or `rg -n "console\.log.*\$\{" _smoke-test.js`) → the 5 sites.
2. For each: either replace the value with a fixed marker (`<phone>`, `<email>`, `<error message redacted>`) OR pass it through a tiny `safe(v)` helper that JSON-stringifies + truncates to 80 chars + strips control chars.
3. Keep diagnostics useful — don't blunt them to the point a failing run isn't debuggable. The fixed marker is fine for PII fields; the helper is fine for short identifiers.

**Verify:** SonarCloud re-scan shows 0 findings. Smoke test still runs end-to-end with informative output.

---

## Tier 4 — force-multiplier infra (do after Tier 1-3 is calm)

### Task #457 — Client→handler API coverage test in CI

**Why:** Task #450 catches dev→prod direction; the client→handler direction is unguarded. Next dead caller won't surface until a user reports it.

**Recipe (verbatim from `docs/api-route-coverage-audit.md`):**
1. New file `netlify/functions-tests/client-api-coverage.test.js`.
2. Walk `www/*.js` + `www/*.html`; skip `.netlify-deploy/`, `stress-test-*`, `*.test.js`, `*.spec.js`, `developers.html`.
3. Regex `/['"`]\/api\/[a-zA-Z0-9_\-\/:\.{}]+/g` over each file. Filter out matches preceded by `https?://[^/]+` (external).
4. Normalise dynamic segments (`:apptId`, `${id}`, `{id}` → `:param`).
5. For each URL: assert match in `www/_redirects` rules OR a handler regex/path in `www/server.js` (the audit doc has the regex-route caveat — replicate it: scan `req.url.match(...)` literals too).
6. Maintain `netlify/functions-tests/_broken-client-callers.json` as the grandfathered allowlist seeded from the 12 known-broken families in the audit doc. Each entry: `{url, caller, reason, ticket}`. Test fails if a NEW caller URL appears without a handler AND isn't in the allowlist.
7. Print actionable diff: "URL `X` called from `file:line` has no handler. Add a Netlify function OR add to `_broken-client-callers.json` with a reason."
8. Wire into `bash scripts/run-function-tests.sh`.

**Verify:** Tests green with current allowlist. Add a fake new caller `/api/__test_phantom`, confirm the test fails with the actionable message; remove the fake.

---

### Task #458 — Live health probes for tracked API keys

**Why:** #353's ladder is calendar-based. If admin forgets to update the date after rotation OR the key is revoked early, dashboard stays green until expiry.

**Steps:**
1. Read `lib/api-key-expiry-config.js` for `TRACKED_KEYS` shape.
2. Add optional `liveProbe: async () => true|throw` per entry:
   - Stripe: `stripe.balance.retrieve()`
   - Resend: `GET /domains`
   - Twilio: `GET /Accounts/{sid}.json`
   - HubSpot: `GET /account-info/v3/details`
   - GitHub: `GET /user`
   - Anthropic: reuse existing health check from `anthropic-health-scheduled.js`
   - Gemini: `models.list`
   - Google Vision: `projects.locations.get`
   - Facebook: `GET /me?fields=id` with App access token
   - BGC: `HEAD /orders?api_token=...`
3. Extend `netlify/functions/api-key-expiry-scheduled.js` (or new sibling) to loop probes daily. Failures log `ai_action_log` (`module=<existing per-key>`, `action_type='live_probe'`, `outcome='failed'`) and email admin via Resend. Dedup: 1 email per key per 6h via `ai_action_log` query.
4. Admin "Critical API Keys" card grows a "Live" pill column: green/red/unknown (unknown = no probe defined).
5. Test `netlify/functions-tests/api-key-live-probe.test.js`: stub each probe, force one to throw, assert email sent + log row + dedup on second call.

**Verify:** Function-test green. Manual: rotate a key without updating the date → live pill flips red within 24h + admin email.

---

### Task #459 — Surface critical/expired keys on admin dashboard home

**Why:** Today they're buried in the Payments section. If Resend itself is broken (or inbox is buried), admin misses them.

**Steps:**
1. Read `www/admin.html` top of admin shell + `www/admin.js` initial dashboard render.
2. Add a banner element at the top of the admin landing view (inside whatever wraps the section nav). Style: red bar matching existing error banners.
3. On admin load, call `GET /api/admin/api-key-expiry` (existing). If any key has `status in ('critical','expired')`, render banner with each key's label + deep-link `#payments-critical-api-keys` (anchor that scrolls to the card).
4. Session-only dismiss: a × button stores a `sessionStorage` flag → re-shows on reload. Do **not** localStorage it.

**Verify:** Manual — temporarily set a tracked key's `ai_ops_settings` expiry to yesterday → banner appears on next admin reload. Click deep-link → scrolls to the right card.

---

### Task #460 — Show admins which expiry alerts already went out

**Why:** Task #354 collapses the ladder to one alert per crossing. Admins can't tell from the card whether 3d/1d/expired alerts already fired.

**Steps:**
1. Read `netlify/functions/api-key-expiry-admin.js` (GET handler).
2. Extend per-key response with `alert_status: { '3d': 'sent'|'superseded'|'pending', '1d': ..., 'expired': ... }`. Compute by querying `ai_action_log` for module = the key's module, action_type in `('alert_3d','alert_1d','alert_expired')`, `created_at >= ai_ops_settings.updated_at`, grouped by action_type. `outcome='sent'` → sent; row with `outcome='superseded'` → superseded; no row → pending.
3. Also return `last_alert_at` per threshold for tooltip.
4. In `www/admin.js` `loadApiKeyExpiry`, render three small pills per row: 3d / 1d / Expired. Tooltip on hover shows `last_alert_at`.
5. Test: stub `ai_action_log` with mixed sent/superseded/missing rows, assert response shape.

**Verify:** Function-test green. Manual: trigger a `run-now` on a key whose expiry is 2 days out → 3d shows `sent`, 1d shows `pending`, expired shows `pending`. Update the expiry date → all reset to `pending` on next render.

---

## Suggested batching order for Claude Code

If you're handing CC one session at a time, this order minimises context juggling and dependency conflicts:

1. **#468** (env fix, 5 min) — unblocks every JWT smoke step downstream.
2. **#316** (test-only, ~30 min) — gets `npm test` green so it's usable as a gate for everything after.
3. **#438** (test fix, ~30 min) — same reason for `scripts/run-function-tests.sh`.
4. **#467** + **#375** + **#363** + **#463** (small, surgical, isolated). Can run in any order.
5. **#404** (cosmetic, low risk).
6. **#271** + **#289** (security/RLS, both need migration + Supabase paste).
7. **#272** (audit-log UI, ~half day).
8. **#268** (Twilio STOP, ~half day; needs Twilio console change).
9. **#419** (care-plan status root-fix; touches many files).
10. **#394** (Stripe webhook retry queue; touches money-handling — schedule a focused session).
11. **#411** + **#412** (audit-warning + retry-payout scans).
12. **#455** then **#456** (do one endpoint per PR — 14 endpoints total).
13. **#457** (lock in the regression catcher) — do this last among these so its allowlist starts small.
14. **#458** → **#459** → **#460** (API-key health stack, in that order).

After each task: `node --check` any touched JS, `npm run lint`, run the relevant test suite, then if `www/*` was touched: `npm run cap:sync`.
