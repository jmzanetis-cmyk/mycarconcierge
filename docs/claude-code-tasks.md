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

---

## Tier 0.5 — RLS audit lockdown (added 2026-09-18)

Background: a repo audit on 2026-09-18 found two Supabase RLS gaps. (1) The seven outreach-engine tables have policies named `service_role_*` that are actually `FOR ALL USING (true)` with no `TO` clause, so the public anon key can read/write `outreach_leads` (prospect name/email/phone), `outreach_messages`, `outreach_campaigns`, `campaign_leads`, `outreach_activity_log`, `opportunity_pipeline`, `engine_state`. (2) Twelve tables have no RLS at all — the seven car-club tables (`car_clubs`, `club_memberships`, `club_activity_log`, `club_reward_rules`, `car_club_benefits`, `car_club_redemptions`, `car_club_return_bonuses`; the 20260703a–g prod captures say "no RLS" explicitly), plus `community_posts`, `commission_rate_history`, `founder_campaign_clicks`, `founder_campaign_investments`, `admin_audit_log`. Everything else checked out: only the anon JWT ships in www/ios/android, service-role key is server-side only, both Stripe webhook handlers call `constructEvent`, admin-* functions all use `authenticateBearerAdmin`, driver API routes verify bearer tokens with `getUser`.

Per the conventions at the top of this file, CC **writes** migrations and the human **applies** them in the Supabase SQL editor. Do the tasks in order; #469 gates the rest. A draft at `supabase/migrations/20260918a_rls_audit_lockdown.sql` is superseded by #470/#471 — delete it in #470.

### Task #469 — Confirm live RLS state matches the repo (no code change)

**Why:** The migrations folder only starts spring 2025 and `profiles`/`vehicles` policies predate it. Don't apply a lockdown blind.

**Steps:**
1. Print the following for the human to run in Supabase → SQL editor, and ask them to paste the results back (results contain no secrets):
   ```sql
   -- A. outreach policies: expect roles = {public} on all seven tables
   select tablename, policyname, roles, cmd, qual, with_check
   from pg_policies where schemaname='public'
     and tablename in ('engine_state','opportunity_pipeline','outreach_leads','outreach_messages','outreach_campaigns','campaign_leads','outreach_activity_log')
   order by tablename;
   -- B. tables with RLS off: expect the 12 listed above (plus possibly others)
   select relname from pg_class
   where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity
   order by relname;
   -- C. policies not in version control
   select tablename, policyname, roles, cmd, qual, with_check
   from pg_policies where schemaname='public' and tablename in ('profiles','vehicles')
   order by tablename, policyname;
   -- D. anon/authenticated grants sanity
   select table_name, grantee, string_agg(privilege_type, ',')
   from information_schema.role_table_grants
   where table_schema='public' and grantee in ('anon','authenticated')
     and table_name in ('outreach_leads','car_clubs','club_memberships','admin_audit_log')
   group by 1,2 order by 1,2;
   ```
2. Compare. If A shows `{service_role}` already, skip #470. If B lists tables not in the twelve above, add them to #471's list. Save C's output verbatim to `docs/audit/2026-09-18-profiles-vehicles-policies.sql` so those policies are finally in the repo (as documentation, not a migration).
3. **Stop and report** if A or B disagree materially with the audit; otherwise proceed to #470.

**Verify:** `docs/audit/2026-09-18-profiles-vehicles-policies.sql` exists and the human has confirmed A and B.

### Task #470 — Outreach tables: version-control catch-up (drop dead `service_role_*` policies)

**Why:** Task #469 live pg_policies capture (docs/audit/2026-09-18-live-rls-state.sql, section 2) confirmed the seven outreach tables (engine_state, opportunity_pipeline, outreach_leads, outreach_messages, outreach_campaigns, campaign_leads, outreach_activity_log) have RLS enabled with zero policies in prod — they're already service-role only. The `service_role_*` CREATE POLICY statements from 20260420_outreach_engine_initial.sql (FOR ALL USING (true) with no TO clause, which would have applied to anon+authenticated) were never applied to prod (or were dropped out-of-band). The audit's original "anon-key read/write on prospect PII" concern is therefore not currently exposed; this task is version-control catch-up + guard-rail against the pattern recurring.

**Steps (done in commit-flow, PR-ready):**
1. Delete the superseded `supabase/migrations/20260918a_rls_audit_lockdown.sql` draft.
2. Create `supabase/migrations/20260918a_outreach_policies_drop_dead.sql` — plain `DROP POLICY IF EXISTS` for all seven policy names. Idempotent: no-op on prod today, catches any accidental re-creation on a rebuilt/restored environment.
3. Remove the dead `DO $$ ... CREATE POLICY ... $$` block from `20260420_outreach_engine_initial.sql` and add a SECURITY NOTE header pointing to 20260918a. The migrations folder now matches prod (RLS on, no outreach policies).
4. Add `netlify/functions-tests/rls-policy-shape.test.js` (auto-discovered by `scripts/run-function-tests.sh`) with two shape guards:
   - Rule 1: any `CREATE POLICY service_role_*` in migrations must have `TO service_role` if it uses `USING (true)` / `WITH CHECK (true)`. Catches the 20260420 pattern from re-entering the folder.
   - Rule 2: any `CREATE TABLE public.<t>` in migrations dated ≥ 20260918 must have a matching `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the same file. Enforces "new public tables ship RLS-enabled" (which Task #469 confirmed is the current prod-wide state, minus schema_migrations).
5. Grep to prove no browser code hits the outreach tables (belt-and-braces): `grep -rn "from('outreach_\|from('engine_state\|from('opportunity_pipeline\|from('campaign_leads" www/*.js www/*.html | grep -v stress-test` returns empty.
6. Hand the migration to the human to apply. Post-apply, re-run Query A from #469 (still expected: 0 rows). Confirm one `outreach-cycle` scheduled run succeeds in Netlify function logs, and the admin Outreach tab loads without errors.
7. One-time hygiene: `select count(*), min(created_at), max(created_at) from outreach_leads where source not in (<known sources from www/admin-core.js ~L287>)` and eyeball for rows nobody recognises. Even though the tables weren't world-writable in prod, worth a quick review.

**Verify:** `npm test` green including `rls-policy-shape.test.js`; Query A still returns 0 rows post-apply; outreach-cycle log shows a normal run.

### Task #471 — Codify live RLS state for the twelve audit tables

**Why:** Task #469 live capture (docs/audit/2026-09-18-live-rls-state.sql, section 1) showed the audit's original premise ("twelve tables with no RLS") is stale: every public table has RLS enabled in prod except `schema_migrations`. Someone applied a direct-to-prod RLS enable between the audit draft and Task #469's capture; the specific migration is not in this repo. Additionally, three of the twelve tables have SELECT/INSERT policies that were also created directly on prod outside the migrations folder. This task pulls the live state into version control so a rebuild or restore reproduces prod behavior.

Nine tables have RLS on with zero policies (service-role only, matching the audit's design): `club_activity_log`, `club_reward_rules`, `car_club_benefits`, `car_club_redemptions`, `car_club_return_bonuses`, `community_posts`, `founder_campaign_clicks`, `founder_campaign_investments`, `admin_audit_log`.

Three tables have policies (all `roles = {public}`, saved verbatim in the audit doc): `car_clubs` (3 SELECT policies — discovery-read, member-read via `is_club_member()`, provider-read), `club_memberships` (2 SELECT policies — provider-read via `is_club_provider()`, self-read), `commission_rate_history` (admin-only SELECT + INSERT).

The `is_club_member(uuid,uuid)` and `is_club_provider(uuid,uuid)` helpers used by those policies also live in prod only; their bodies (SECURITY DEFINER + STABLE + `SET search_path = 'public'`) are recorded in the audit doc, section 7. The codify migration calls them as-is — do NOT re-create.

Do #472's code change in the same PR since they ship together (see #472).

**Steps:**
1. Create `supabase/migrations/20260918b_car_club_commission_policies_codify.sql`:
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for all twelve tables (all no-ops on prod today).
   - `DROP POLICY IF EXISTS` + `CREATE POLICY` for exactly the seven live policies, matching the audit doc verbatim. Idempotent.
2. Audit `redeem_reward_for_member` and other 20260703h RPCs: if any is `SECURITY INVOKER` and touches `club_memberships` / `car_club_redemptions` under the caller's role, they may return empty/42501. Grep `supabase/migrations/2026070*` for `SECURITY DEFINER` vs invoker and note findings in the PR body.
3. Also see `20260918a` (Task #470) for the rls-policy-shape lockdown test that guards against RLS regressions in future migrations.
4. Hand `20260918b` to the human to apply. Since prod already matches this file, apply is a no-op — the value is version-control alignment for rebuild/restore.

**Verify:** post-apply, live `pg_policies` on the three tables still returns exactly the seven policies with unchanged qual/with_check. `node www/stress-test-car-clubs.js` and `node www/stress-test-car-club-punch.js` still pass. Member flow smoke below in #472.

### Task #472 — Move admin car-club reads/writes off the anon client (fix a broken admin panel)

**Why:** `www/admin-ai-ops.js` is the only browser code that hits `car_clubs` directly, and Task #469's live-state capture (docs/audit/2026-09-18-live-rls-state.sql, sections 1 + 6) confirms the tables have RLS enabled today with only three SELECT-only policies on `car_clubs` (discovery/member/provider read) and no INSERT/UPDATE policies. **That means the admin Car Clubs panel is broken in prod right now, not "about to break after #471":**
- `createCarClub()` at L409 — INSERT into `car_clubs` fails RLS (no INSERT policy for anon/authenticated) and also fails the `provider_id NOT NULL` constraint from `20260703a_car_clubs_base.sql` (the payload sets no `provider_id`).
- `toggleCarClub()` at L437 — UPDATE `is_active` fails RLS (no UPDATE policy).
- `loadCarClubs()` at L327 — SELECT returns only clubs matching the discovery-read policy (`is_active IS NOT FALSE AND provider_suspended IS NOT TRUE`) OR clubs where the admin themselves is `provider_id`. Inactive/suspended clubs the admin doesn't own are invisible.
- `viewCarClub()` at L419 — same filter; returns null for others' inactive clubs.

Errors surface to the admin UI via `alert('Error: ' + error.message)` (verified 2026-09-18) — not silently swallowed, so this task is a bug fix an admin can already see. #471 doesn't change the failure mode; it codifies the state that's already blocking these calls. Move them behind an admin-authenticated function like every other admin write. Fix the missing `provider_id` in the INSERT payload while you're there (require a provider select in the form, or default to the admin's own user id if that's the intended shape).

**Steps:**
1. In `netlify/functions/car-clubs.js` (or `ai-ops-admin.js` if car-clubs.js is member-only — pick whichever already has the admin auth helper wired), add routes guarded by `authenticateBearerAdmin`: `GET /api/admin/car-clubs` (list with provider `full_name,email` join), `POST /api/admin/car-clubs` (create; require `provider_id`), `PATCH /api/admin/car-clubs/:id` (`is_active` toggle). Add the three lines to `www/_redirects` next to the existing `/api/car-clubs` block.
2. Rewrite the four call sites in `www/admin-ai-ops.js` to `fetch()` those endpoints with the session bearer token, matching how `admin-core.js` calls other admin endpoints. Keep the DOM/UX unchanged.
3. Add the new routes to `netlify/functions-tests/admin-routes-auth.test.js` so the lockdown test counts them (unauthenticated → 401).
4. `npm run cap:sync` (admin page ships in the mobile bundle).
5. Manual smoke after deploy + #471 apply, with the human: admin → AI Ops → Car Clubs tab lists clubs, creates one, toggles active; member account → view a club, join, redeem a reward via the existing `/api/car-clubs/*` path; provider account → view own club. Any 42501 or silently empty list = missing policy; add the narrow policy, do not disable RLS.

**Verify:** `npm test` green (admin-routes-auth counts the new routes); manual smoke checklist above passes; `grep -n "from('car_clubs')\|from('club_memberships')" www/*.js | grep -v stress-test` returns nothing.

### Task #473 — Loose ends (human dashboard items + one config change)

**Steps (human, not CC):** delete the stale Replit endpoint under Stripe → Developers → Webhooks; Supabase → Settings → Database → Network Restrictions: allow-list Railway's egress IPs and your own, since nothing else connects to Postgres directly (PostgREST/edge traffic is unaffected).

**Steps (CC):** in `netlify.toml` change `SECRETS_SCAN_ENABLED = "false"` to `"true"` and add `SECRETS_SCAN_OMIT_PATHS` / `SECRETS_SCAN_OMIT_KEYS` for whatever false positive caused it to be turned off (check git blame on that line for the reason; the public anon JWT in `www/supabaseclient.js` is the likely culprit — omit `SUPABASE_ANON_KEY` by key, not by path). Trigger a deploy preview and confirm the build passes.

**Verify:** Netlify deploy log shows the secrets scan ran and passed; Stripe webhook list has only the Netlify/Railway endpoints.

### Rollback

- #470: recreate the seven policies without the `TO service_role` clause (exactly the 20260420 shape).
- #471: `ALTER TABLE public.<t> DISABLE ROW LEVEL SECURITY;` per table.
- #472: revert the PR; the old anon-client calls only work while #471 is rolled back too, so roll both or neither.

### Task #474 — profiles: block self-service edits to privileged columns (DO THIS BEFORE #470)

**Why:** Live `pg_policies` (2026-09-18) shows `profiles_update_self` = `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)` with no column restriction, and the only BEFORE UPDATE guard (`20260428e_provider_writes_rls_lockdown.sql`) protects just `suspension_reason` / `suspended_at`. So any signed-in user can `PATCH /rest/v1/profiles?id=eq.<self>` with `{"role":"admin"}` (or `bid_credits`, `verification_status`, `saas_plans_cache`, `marketplace_visible`, `founding_member_joined_at`, `bgc_compliance_pct`…) using the public anon key plus their own JWT. Every admin-* Netlify function trusts `profiles.role === 'admin'` (31 references), so this is a full privilege escalation. Highest priority of the sweep.

**Steps:**
1. Enumerate the live column list: ask the human to run `select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position;` and paste it. Classify each column as **user-editable** (display name, phone, avatar, address, preferred_language, business_hours, sms_opt_out, auto_bid_*, shop_onboarding_*, etc.) or **privileged** (role, bid_credits, verification_status, suspension_*, saas_plans_*, stripe_*, founder_*/commission_*, bgc_*, outreach_*, acquisition_*, marketplace_visible, is_* flags, anything set by a server flow). When in doubt, privileged.
2. Create `supabase/migrations/20260918c_profiles_privileged_columns_guard.sql` that extends the existing trigger function from 20260428e (keep its name and the `auth.role() = 'service_role'` bypass, preserve the suspension checks) to `RAISE EXCEPTION` when any privileged column `IS DISTINCT FROM` its OLD value. Do it as a trigger (denylist), not column-level `REVOKE UPDATE`, because legacy `admin.js` browser writes for `bid_credits` and approval role flips still go through the authenticated role (see the note in 20260424_admin_audit_log.sql) — allow those by also bypassing when `is_admin()` is true, and grep `www/*.js` for `.from('profiles').update(` to list exactly which columns the browser still writes so nothing legitimate breaks.
3. Lockdown test: add to `netlify/functions-tests/` a test that reads the new migration and asserts the denylist contains at least `role`, `bid_credits`, `verification_status`, `suspension_reason`, `suspended_at`.
4. Hand to human to apply. Verify with a throwaway member account via the REST API: `PATCH profiles` setting `role` → expect 4xx with the trigger's message; setting `full_name` → 204.

**Also from the live policy dump (fold into the same PR or a follow-up):**
- `vehicles`: `Members can manage own vehicles` (ALL, `auth.uid() = owner_id`) ORs with `Verified members can insert own vehicles`, so the `is_identity_verified()` gate on INSERT is dead — permissive policies are OR'd. If the verification gate is meant to hold, drop INSERT from the ALL policy (split into SELECT/UPDATE/DELETE) so the verified-insert policy is the only INSERT path.
- `profiles_select_providers`: any authenticated user can SELECT every column of every provider profile (email, phone, street_address, stripe_customer_id, saas cache, bgc stats…). The public directory already goes through `directory-providers.js` with a curated column list. Either replace this policy with a `providers_public` view exposing only directory columns, or use column-level grants (`REVOKE SELECT ON profiles FROM authenticated; GRANT SELECT (id, full_name, …) …`) — the view is simpler and matches existing code.

**Verify:** REST PATCH of `role` by a non-admin fails; `npm test` green; admin portal approval flow and bid-credit grant still work (`www/admin*.js` smoke).

### Task #475 — Gate public directory surfaces on `verification_status = 'verified'` (do right after #474)

**Why:** Surfaced during the #474 investigation. `providers-core.js:217` and `providers.js:138` both auto-create a profile with `role='provider'` when an authenticated user lands on the provider portal without an existing row (verified intentional in #474 — verification_status is the real bidding gate). But `netlify/functions/directory-providers.js:115-118` (list) filters on `role='provider' AND directory_opt_in=true AND directory_slug IS NOT NULL AND suspended=false` — **no `verification_status` check**, and the single-provider lookup around L202 has the same shape. `directory_opt_in` and `directory_slug` are both user-editable per the #474 ALLOW list, so a self-promoted `role='provider'` user who flips their opt-in and sets a slug appears in the public directory as a service provider without ever being verified. Not a privilege escalation on top of #474's trigger, but a real listing-integrity gap: consumers browsing the directory would see them as legitimate providers.

**Steps:**
1. In `netlify/functions/directory-providers.js`, add `.eq('verification_status', 'verified')` to both the list query at L115-118 and the single-provider lookup around L202. Verify the column name against the live schema (task #474 confirmed `verification_status` with values `'verified' | 'pending' | ...`; do not use the legacy mock column `is_verified`).
2. Grep `www/` and `netlify/functions/` for any other public-facing surface that lists providers by `role` alone. Known candidates to inspect: `www/providers-directory.html`, `www/p.html`, `netlify/functions/provider-profile-publish.js` (L52), and any `tenant-portal.js` or `white-label-join.js` paths that filter on `role='provider'`. Apply the same `verification_status = 'verified'` gate to any surface that renders provider data to non-admin, non-self viewers. Where the caller is the provider themselves editing their own profile (e.g. `provider-profile-publish.js` gating the caller's own publish action), leave role/pending_provider access alone — those flows correctly allow pending providers.
3. Add `netlify/functions-tests/directory-providers-verification-gate.test.js`: read `netlify/functions/directory-providers.js` and assert the string `verification_status` appears within both the list-query chain and the single-lookup chain (or write a small AST/regex parser if the file evolves). Wire into `scripts/run-function-tests.sh` (auto-discovered by the existing glob).
4. Hand to human for a manual smoke: create a fresh account, navigate to `providers.html` to trigger the auto-create fallback, flip `directory_opt_in=true` and set `directory_slug='test'` via the profile editor. Confirm they do NOT appear at `/providers` (the public directory page) until an admin runs the Verify Provider action.

**Also worth confirming while you're in the code:**
- Whether the auto-create fallback in `providers-core.js:217` / `providers.js:138` should exist at all. Normal signup paths (signup-provider.js, onboarding-provider.html, login.js OAuth) always create the profile first, so this fallback only fires in edge cases (auth-account-but-no-profile-row). If those edge cases can be reduced to zero, the fallback is dead code and can be replaced with a "contact support" redirect — closes the self-promotion path entirely.

**Verify:** `npm test` green (including the new directory-providers-verification-gate test); manual smoke: a `role='provider'` account with `verification_status IS NULL` and `directory_opt_in=true` + `directory_slug` set does NOT appear in the `/providers` directory listing or single-profile lookup.

### Task #476 — Migrate onboarding-member founding-path server-side with a real eligibility check

**Why:** Surfaced during Task #474's browser-INSERT audit. `www/onboarding-member.html:1060` sets `isFoundingPath = URLSearchParams(...).get('founding') === '1'` and, when the flag is truthy, INSERTs the fresh profile with `is_founding_member: true` + `founding_member_joined_at: new Date().toISOString()` (see L1289 and L1296). **There is NO server-side eligibility check** — anyone with the URL query param `?founding=1` grants themselves founding-member status. Also no server-side setter of `is_founding_member` anywhere in `netlify/functions/`. Grep as of 2026-09-18 confirms this.

Task #474's BEFORE INSERT trigger allows the paired-column shape (`is_founding_member=true` iff `founding_member_joined_at IS NOT NULL`) so the current flow keeps working, but the shape check doesn't add a real eligibility gate. This task adds the gate.

**Steps:**
1. Define the actual founding-member business rule with the product owner: is there a signup window (e.g. "first 500 members"), a cap, an invitation-only mode, or specific referral tie-in? The audit didn't find one in code, and the WhereFrom flag `?founding=1` looks like a link-out from marketing collateral rather than a controlled gate. Cite the decision in the migration comment.
2. Add a Netlify function `netlify/functions/founding-member-signup.js` that: (a) authenticates the bearer JWT, (b) verifies the caller is eligible per the rule from step 1 (window/cap/invite lookup), (c) INSERTs the profile via the service-role client with `is_founding_member`, `founding_member_joined_at`, and any other founding-specific columns set atomically, (d) returns 403 with a clear reason if ineligible. Log the eligibility decision to admin_audit_log.
3. Rewrite `www/onboarding-member.html` L1247 (UPDATE path) and L1289 (INSERT path) to call the new endpoint instead of writing `is_founding_member` / `founding_member_joined_at` from the browser. Preserve the UI behavior (founding pill at L1078-1080, etc.).
4. Once #476 lands, tighten Task #474's BEFORE INSERT trigger to REJECT any non-service-role INSERT of `is_founding_member=true` or `founding_member_joined_at NOT NULL`, closing the browser-set path entirely. This is a follow-up trigger edit, not part of this PR.
5. Ships to mobile → `npm run cap:sync` after the HTML edit.

**Verify:** Manual smoke — visit `/onboarding-member.html?founding=1` in a fresh session, complete signup, confirm the profile row has `is_founding_member=true` only if the server-side eligibility check passed; if the rule is "invite-only" and the caller lacks an invite, expect signup to complete with `is_founding_member=false`.

### Task #477 — Migrate signup-loyal-customer server-side, validate refCode + apply privileged flags via Netlify function

**Why:** Surfaced during Task #474's browser-INSERT audit. `www/signup-loyal-customer.html:806` INSERTs the fresh profile with `is_verified: true`, `platform_fee_exempt: true`, and `referred_by_provider_id: providerId` — all set from browser code. The `providerId` is server-derived (from `lookupProvider(refCode)` earlier in `init()`), but the two boolean flags are hardcoded on the browser side. Any user who signs up via a valid `?ref=<refCode>` link gets verification + fee exemption granted from the browser.

Task #474's BEFORE INSERT trigger allows this today via a shape check (Rule 5: `is_verified=true` / `platform_fee_exempt=true` only when `referred_by_provider_id IS NOT NULL`), so the loyal-customer flow keeps working. That shape limits the escalation surface to callers who present a valid refCode, but the flags themselves are still browser-set. This task migrates the whole grant server-side.

**Steps:**
1. Add `netlify/functions/loyal-customer-signup.js` that: (a) accepts `{ refCode, name, email, phone, password, sms_consent, preferred_language }`, (b) validates `refCode` against `provider_referral_codes` (or wherever `lookupProvider` resolves it) and returns 400 if unknown, (c) creates the auth user via `supabase.auth.admin.createUser` OR calls existing `auth.signUp` server-side, (d) INSERTs the profile via the service-role client with `is_verified: true`, `platform_fee_exempt: true`, `referred_by_provider_id: <resolved providerId>` set atomically, (e) triggers the existing `referral-process` and `member/referral/apply` side effects.
2. Rewrite `www/signup-loyal-customer.html` L800-830 to call the new endpoint instead of doing browser `auth.signUp` + browser `profiles.insert`. Keep the UI unchanged.
3. Once #477 lands, tighten Task #474's BEFORE INSERT trigger Rule 5: **reject** any non-service-role INSERT of `is_verified=true` or `platform_fee_exempt=true`, closing the browser-set path entirely. Follow-up trigger edit, not part of this PR.
4. Ships to mobile → `npm run cap:sync` after the HTML edit.

**Verify:** Manual smoke — visit `/signup-loyal-customer.html?ref=<valid_code>` in a fresh session, complete signup, confirm profile row has `is_verified=true` + `platform_fee_exempt=true` + `referred_by_provider_id=<expected provider>`. Try with `?ref=<invalid_code>` — expect signup to fail with a 400 from the new endpoint before any DB write.
