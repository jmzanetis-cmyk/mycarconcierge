# MCC Pre-Launch End-to-End Test Checklist

> **Scope:** Staging environment only, Stripe TEST mode throughout (sk_test_…).  
> **How to use:** Work top to bottom. Check each box only after confirming both the UI outcome AND the SQL confirmation query in the Supabase dashboard SQL editor.  
> **Admin portal:** `https://<staging-url>/admin.html`  
> **Stripe CLI (local webhook forwarding):** `stripe listen --forward-to https://<staging-url>/.netlify/functions/stripe-webhook`  
> **Function invocation (manual trigger):** `curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" https://<staging-url>/.netlify/functions/<function-name>`  
> **Unit-test coverage:** Where a test file is listed, the happy path and failure contract are already validated in CI. The E2E test validates real infrastructure wiring (Stripe webhook delivery, real DB, real FCM, etc.) that mocks cannot cover.

---

## Prerequisites — Confirm Before Any Tier

| # | Check | How to verify |
|---|-------|---------------|
| - [ ] | `STRIPE_SECRET_KEY=sk_test_…` and `STRIPE_PUBLISHABLE_KEY=pk_test_…` in Netlify env | Netlify dashboard → Site settings → Environment variables |
| - [ ] | `STRIPE_WEBHOOK_SECRET` matches Stripe CLI output (`whsec_…`) | `stripe listen` terminal |
| - [ ] | `BGC_LIVE_MODE` is NOT `'true'` (keep mock for all non-BGC tests) | Netlify env |
| - [ ] | `RESEND_API_KEY` set | Netlify env |
| - [ ] | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ADMIN_ALERT_PHONE` set | Netlify env |
| - [ ] | `FCM_SERVICE_ACCOUNT_JSON` set | Netlify env |
| - [ ] | `ANTHROPIC_API_KEY_MCC_FLEET1` (or `ANTHROPIC_API_KEY`) set | Netlify env |
| - [ ] | `ADMIN_PASSWORD` set | Netlify env |
| - [ ] | At least one verified provider account exists (`role='provider'`, `verification_status='verified'`) | `SELECT id, email, bid_credits FROM profiles WHERE role='provider' AND verification_status='verified' LIMIT 5;` |
| - [ ] | Chris's founder profile exists and `commission_rate = 0.90` | `SELECT id, commission_rate, pending_balance, payout_email FROM member_founder_profiles WHERE id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';` |

---

## TIER 1 — MONEY FLOWS (Real Dollars, Highest Risk)

---

### T1.1 — Bid Credit Purchase

**Handler:** `netlify/functions/stripe-webhook.js` → `handleCheckoutComplete()`  
**Webhook event:** `checkout.session.completed`  
**Unit-test coverage:** `netlify/functions-tests/bid-credit-grant.test.js`, `netlify/functions-tests/stripe-webhook-bid-credit.test.js` — covers DB error contract, idempotency (23505), reconciler. **Real Stripe webhook delivery and signature verification are E2E-only.**

**Prerequisites:**
- Stripe CLI running and forwarding to staging
- Verified test provider logged in to `/providers.html`
- Note provider UUID before starting: `SELECT id, email, bid_credits FROM profiles WHERE email = '<provider-email>';`

**Steps:**

- [ ] 1. Log in as the verified test provider at `/providers.html`
- [ ] 2. Navigate to the Bid Credits / Purchase section and select the lowest-priced pack
- [ ] 3. Click the buy/checkout button — this calls `POST /api/create-bid-checkout`; confirm redirect to Stripe Checkout
- [ ] 4. On the Stripe Checkout page enter: card `4242 4242 4242 4242`, any future expiry (e.g., `12/30`), CVC `424`, postal `42424`
- [ ] 5. Click Pay — confirm redirect to `/providers.html?purchase=success&pack=<packId>`
- [ ] 6. In Stripe CLI terminal confirm `checkout.session.completed` received and HTTP 200 returned from webhook handler
- [ ] 7. Confirm provider's bid credits incremented in the portal (refresh the page)

**Expected:** `bid_credits` on provider's profile = old value + pack `bid_count` + `bonus_bids`

**SQL confirmations:**
```sql
-- Confirm bid_credit_purchases row
SELECT id, provider_id, pack_id, bids_purchased, amount_paid, stripe_session_id, status
FROM bid_credit_purchases
WHERE provider_id = '<provider-uuid>'
ORDER BY created_at DESC LIMIT 3;

-- Confirm bid_credit_grants idempotency row
SELECT id, provider_id, transaction_id, total_bids, granted_at
FROM bid_credit_grants
WHERE provider_id = '<provider-uuid>'
ORDER BY granted_at DESC LIMIT 3;

-- Confirm profiles.bid_credits incremented
SELECT id, email, bid_credits FROM profiles WHERE id = '<provider-uuid>';
```

**Idempotency test (replay same webhook):**
- [ ] 8. Replay the webhook: `stripe events resend <evt_id>` (get event ID from Stripe CLI output)
- [ ] 9. Confirm `bid_credits` did NOT double-increment
- [ ] 10. Confirm exactly one `bid_credit_grants` row for this `transaction_id`:

```sql
-- Must return 1, not 2
SELECT COUNT(*) FROM bid_credit_grants WHERE transaction_id = '<stripe-payment-intent-id>';
```

---

### T1.2 — Escrow Release (held → released)

**Handler:** `netlify/functions/member-release-payment.js`, route `POST /api/payment/release`  
**Unit-test coverage:** `netlify/functions-tests/member-release-payment-escrow.test.js` — covers auth, idempotency (`already_released`), missing Stripe PI. **Real `stripe.paymentIntents.capture()` call is E2E-only.**

**Note on columns:** `mcc_fee` is the column written at payment creation time. `amount_mcc_fee` is an admin-override column protected by a DB trigger — it is NOT touched by the release RPC. Query `mcc_fee`, not `amount_mcc_fee`, for service-fee confirmation.

**Prerequisites:**
- A `payments` row with `status='held'` and a valid `stripe_payment_intent_id`

**Setup SQL:**
```sql
SELECT id, package_id, status, amount_total, mcc_fee, stripe_payment_intent_id, member_id
FROM payments
WHERE status = 'held'
ORDER BY created_at DESC LIMIT 5;
```

**Steps:**

- [ ] 1. Log in to admin portal → **Payments** section (sidebar → Operations → Payments)
- [ ] 2. Locate a payment with the orange `held` status badge
- [ ] 3. Click the green **"Release"** button in the Actions column
- [ ] 4. Confirm the badge updates to `released` (reload if needed)
- [ ] 5. In Stripe CLI or Stripe dashboard, confirm `payment_intent.captured` event fired for that PI

**SQL confirmations:**
```sql
SELECT id, status, amount_total, mcc_fee, released_at, held_at
FROM payments
WHERE id = '<payment-id>';
-- status = 'released', released_at NOT NULL
```

**Idempotency test:**
- [ ] 6. In admin portal, attempt to release the same payment again (if the button is still visible)
- [ ] 7. Confirm response is `already_released: true` with HTTP 200 — no second Stripe capture

**Note:** No automatic Stripe transfer to the provider fires on release. Provider payout is handled separately by `founder-payout-monthly-scheduled` (for founders) or manual driver payout.

---

### T1.3 — Founding Commission (provider buys credits → Chris gets 90%)

**Handler:** `netlify/functions/stripe-webhook.js` → `_recordBidPackFounderCommission()`  
**Trigger:** `checkout.session.completed` when the purchasing provider has `referred_by_founder_id` set  
**Unit-test coverage:** `netlify/functions-tests/founding-commission.test.js` — covers commission rate locking, payout fees. **The `referred_by_founder_id` → `pending_balance` chain in a real webhook is E2E-only.**

**Prerequisites:**
- Chris's `commission_rate` confirmed as `0.90` (see Prerequisites section)
- A test provider with `referred_by_founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd'`

**Setup SQL — find or create a referred provider:**
```sql
-- Find existing referred provider
SELECT id, email, referred_by_founder_id
FROM profiles
WHERE referred_by_founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd'
  AND role = 'provider'
LIMIT 5;

-- If none, temporarily set on a test provider (revert after test)
UPDATE profiles
SET referred_by_founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd'
WHERE email = '<test-provider-email>' AND role = 'provider';
```

**Record Chris's pending_balance BEFORE the purchase:**
```sql
SELECT pending_balance, total_commissions_earned
FROM member_founder_profiles
WHERE id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';
```

**Steps:**

- [ ] 1. Log in as the referred test provider at `/providers.html`
- [ ] 2. Purchase the Starter bid pack using test card `4242 4242 4242 4242`
- [ ] 3. Confirm the purchase completes (`purchase=success` URL)
- [ ] 4. Wait ~10 seconds for webhook processing, then check Chris's balance

**Expected math:** If pack price = `$X`, Chris's `pending_balance` increases by `$X × 0.90` (to 2 decimal places).

**SQL confirmations:**
```sql
-- Confirm founder_commissions row
SELECT id, founder_id, referred_provider_id, commission_type, purchase_amount,
       commission_rate, commission_amount, status, source_transaction_id
FROM founder_commissions
WHERE founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd'
ORDER BY created_at DESC LIMIT 3;

-- Confirm pending_balance incremented by 90% of pack price
SELECT pending_balance, total_commissions_earned
FROM member_founder_profiles
WHERE id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';

-- Confirm idempotency — replay webhook, commission_amount must not double
SELECT COUNT(*) FROM founder_commissions
WHERE source_transaction_id = '<stripe-payment-intent-id>'
  AND founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';
-- Must return 1
```

---

### T1.4 — B3 Milestone Bonus ($1K threshold, idempotency, $0 no-fire)

**Handler:** `netlify/functions/b3-milestone-check-scheduled.js`  
**Hardcoded founder:** `CHRIS_FOUNDER_ID = '21837a02-6df4-4cb8-b0f4-c5082e83acbd'`  
**Revenue formula:** `SUM(bid_credit_purchases.amount_paid WHERE status='completed')` + `SUM(payments.mcc_fee WHERE status NOT IN (refunded,voided,failed,cancelled))` + `SUM(COALESCE(rides.actual_fare, gross_fare, estimated_fare) * 0.18 WHERE status='completed')`  
**UNIQUE constraint:** `milestone_achievements(founder_id, threshold_amount)` prevents double-fire  
**Unit-test coverage:** Partially in `netlify/functions-tests/founding-commission.test.js`. **Full revenue aggregation across three tables and real DB insert is E2E-only.**

**⚠ No test flag exists.** Revenue injection via SQL is the recommended approach for staging.

**Step 0 — Measure current revenue:**
```sql
SELECT
  (SELECT COALESCE(SUM(amount_paid),0) FROM bid_credit_purchases WHERE status='completed') AS bid_total,
  (SELECT COALESCE(SUM(mcc_fee),0) FROM payments WHERE status NOT IN ('refunded','voided','failed','cancelled')) AS pay_total,
  (SELECT COALESCE(SUM(COALESCE(actual_fare,gross_fare,estimated_fare,0)*0.18),0) FROM rides WHERE status='completed') AS ride_total;
-- Sum the three columns to get total_revenue
```

**If total_revenue already ≥ $1,000 in staging**, skip injection and go to Step 2.  
**If total_revenue < $1,000**, inject test data to cross the threshold:

```sql
-- Insert test purchase (fake provider UUID so no side effects on a real provider)
-- RECORD the inserted id — you'll delete it after the test
INSERT INTO bid_credit_purchases
  (provider_id, pack_id, bids_purchased, amount_paid, stripe_session_id, stripe_payment_id, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'e2e-test-pack', 0, 1001.00,
   'cs_e2e_test', 'pi_e2e_test', 'completed')
RETURNING id;
```

**Record Chris's pending_balance BEFORE running:**
```sql
SELECT pending_balance FROM member_founder_profiles
WHERE id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';
```

**Confirm no existing $1K achievement (must be 0 for a clean test):**
```sql
SELECT * FROM milestone_achievements
WHERE founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd' AND threshold_amount = 1000;
```

**Steps:**

- [ ] 1. Invoke the function:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/b3-milestone-check-scheduled
```

- [ ] 2. Confirm `milestone_achievements` row created for $1K threshold:
```sql
SELECT id, threshold_amount, bonus_amount, status, evaluation_date,
       platform_revenue_at_achievement
FROM milestone_achievements
WHERE founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd'
ORDER BY threshold_amount ASC;
-- threshold_amount=1000, bonus_amount=100, status='pending'
```

- [ ] 3. Confirm Chris's `pending_balance` increased by exactly $100:
```sql
SELECT pending_balance FROM member_founder_profiles
WHERE id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';
-- Should be (previous_balance + 100.00)
```

- [ ] 4. **Idempotency test** — run the function a second time:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/b3-milestone-check-scheduled
```

- [ ] 5. Confirm `pending_balance` did NOT increase again:
```sql
SELECT pending_balance FROM member_founder_profiles
WHERE id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';
-- Must be identical to Step 3 result

-- Must still be exactly 1 row
SELECT COUNT(*) FROM milestone_achievements
WHERE founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd' AND threshold_amount = 1000;
```

- [ ] 6. Confirm milestone visible in admin portal → Founder Management section → Milestones card

**Cleanup if test data was injected:**
```sql
-- Remove the test purchase (the milestone_achievement row is idempotent — leave it)
DELETE FROM bid_credit_purchases WHERE stripe_session_id = 'cs_e2e_test';
```

**$0 no-fire test (separate staging instance or fresh DB):**
- [ ] 7. On an empty staging DB, run the function and confirm: no `milestone_achievements` rows created, `pending_balance` unchanged, function exits with HTTP 200 and no errors.

---

## TIER 2 — VERIFICATION & SAFETY GATES (Launch-Blocking)

---

### T2.5 — BGC Live Mode

**⚠ COST WARNING: Each live BGC order costs $70 per employee. Run exactly ONE check in staging. Confirm BGC_API_TOKEN is pointed at a test account or sub-account, not production billing, before enabling.**

**Handler:** `netlify/functions/initiate-background-check.js` (provider employees), `netlify/functions/initiate-driver-bgc.js` (MCC drivers)  
**Mock detection:** `String(process.env.BGC_LIVE_MODE || '').toLowerCase() === 'true'`  
**Mock report ID pattern:** starts with `mock_` + timestamp  
**Unit-test coverage:** `netlify/functions-tests/bgc-live.test.js` — comprehensive (mock/live path, API key resolution, webhook, decrypt-token flow). **Real BackgroundChecks.com API call and webhook are E2E-only.**

**Required env vars for live mode:** `BGC_LIVE_MODE=true`, `BGC_API_TOKEN`, `BGC_WEBHOOK_SECRET`, `BGC_PRIVATE_KEY`, optionally `BGC_API_BASE` (defaults to `https://app.backgroundchecks.com/api`)

**Part A — confirm mock mode is working correctly (no cost):**

- [ ] 1. Ensure `BGC_LIVE_MODE` is NOT set or is set to anything other than `'true'`
- [ ] 2. In admin portal → Active Providers → select any provider → BGC section → initiate a check for one employee
- [ ] 3. Confirm admin receives email with subject `[MCC] CRITICAL: Background check ordered in MOCK mode`
- [ ] 4. Confirm the `bgc_report_id` starts with `mock_`:

```sql
SELECT id, provider_id, bgc_report_id, status, initiated_at
FROM employee_background_checks
ORDER BY initiated_at DESC LIMIT 3;
-- bgc_report_id LIKE 'mock_%'
```

**Part B — live mode (costs $70 — only if billing is confirmed):**

- [ ] 5. Set `BGC_LIVE_MODE=true` in Netlify environment and redeploy
- [ ] 6. Initiate ONE background check for ONE employee with a real email address (they will receive the applicant invite URL from BackgroundChecks.com)
- [ ] 7. Confirm no `[MCC] CRITICAL: Background check ordered in MOCK mode` email fires
- [ ] 8. Confirm `bgc_report_id` does NOT start with `mock_`:

```sql
SELECT id, bgc_report_id, status, applicant_invite_url, initiated_at
FROM employee_background_checks
ORDER BY initiated_at DESC LIMIT 3;
-- bgc_report_id should be a real BGC report key, not mock_*
-- applicant_invite_url should be a real https://app.backgroundchecks.com URL
```

- [ ] 9. Confirm admin portal BGC Dashboard shows the check with status `initiated` or `pending`
- [ ] 10. **After confirming live mode works, set `BGC_LIVE_MODE` to its intended production value** (`true` if production, leave unset for staging)

---

### T2.6 — Driver Document Isolation (RLS Negative Test)

**RLS policy:** `drivers_self_read` on `drivers` table — `USING (profile_id = auth.uid())`  
**Unit-test coverage:** None. **First E2E validation.**  
**Risk:** If RLS is misconfigured, Driver B could read Driver A's personal and BGC data.

**Prerequisites:** Two separate active driver accounts (Driver A and Driver B), both with JWT tokens obtainable via the driver app or Supabase auth API.

**Setup SQL:**
```sql
-- Get Driver A's profile_id
SELECT id, profile_id, email, bgc_status FROM drivers WHERE email = '<driver-a-email>';
-- Get Driver B's profile_id
SELECT id, profile_id, email FROM drivers WHERE email = '<driver-b-email>';
```

**Steps:**

- [ ] 1. Obtain Driver B's JWT (sign in via driver app or Supabase auth endpoint)
- [ ] 2. Using Driver B's JWT, attempt to read Driver A's row via Supabase REST:

```bash
curl -H "Authorization: Bearer <driver-b-jwt>" \
     -H "apikey: <supabase-anon-key>" \
     "https://<project-ref>.supabase.co/rest/v1/drivers?profile_id=eq.<driver-a-profile-id>"
```

- [ ] 3. **Expected: empty array `[]`** — RLS blocks Driver B from seeing Driver A's row
- [ ] 4. Repeat with Driver B's own `profile_id`:

```bash
curl -H "Authorization: Bearer <driver-b-jwt>" \
     -H "apikey: <supabase-anon-key>" \
     "https://<project-ref>.supabase.co/rest/v1/drivers?profile_id=eq.<driver-b-profile-id>"
```

- [ ] 5. **Expected: 1 result** — Driver B can read their own row

**SQL audit (run as service role):**
```sql
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'drivers' AND policyname = 'drivers_self_read';
-- Must return 1 row with qual = '(profile_id = auth.uid())'
```

---

### T2.7 — Provider Document Isolation (RLS Negative Test)

**Server-side ownership check:** `provider-documents.js` — `eq('provider_id', userId)` where userId = JWT's `auth.uid()`  
**RLS policy on `employee_background_checks`:** `"providers_own_emp_bgc"` — `USING (provider_id = auth.uid())`  
**Unit-test coverage:** None. **First E2E validation.**  
**Risk:** If ownership check fails, any authenticated provider could retrieve a competitor's signed document URLs.

**Prerequisites:** Two verified provider accounts (Provider A, Provider B), both able to obtain JWTs.

**Steps:**

- [ ] 1. Log in as Provider A and list their documents:

```bash
curl -H "Authorization: Bearer <provider-a-jwt>" \
     https://<staging-url>/.netlify/functions/provider-documents
```

Note any `document_id` from the response.

- [ ] 2. Log in as Provider B. Attempt to request a signed URL for Provider A's document:

```bash
curl -X POST \
     -H "Authorization: Bearer <provider-b-jwt>" \
     -H "Content-Type: application/json" \
     -d '{"document_id": "<provider-a-document-id>", "document_type": "business_license"}' \
     https://<staging-url>/.netlify/functions/provider-documents
```

- [ ] 3. **Expected: 403 Forbidden or empty/error response** — ownership check blocks cross-provider access

- [ ] 4. Attempt via Supabase REST directly with Provider B's JWT:

```bash
curl -H "Authorization: Bearer <provider-b-jwt>" \
     -H "apikey: <supabase-anon-key>" \
     "https://<project-ref>.supabase.co/rest/v1/employee_background_checks?provider_id=eq.<provider-a-uuid>"
```

- [ ] 5. **Expected: empty array `[]`** — `providers_own_emp_bgc` RLS blocks cross-provider BGC reads

**SQL audit:**
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'employee_background_checks' AND policyname = 'providers_own_emp_bgc';
-- qual = '(provider_id = auth.uid())'
```

---

### T2.8 — Driver Activation Gate

**State machines:** `drivers.status` (`active`/`suspended`/`offboarded`) and `drivers.bgc_status` (`not_started`/`pending_check`/`passed`/`consider`/`failed`) are independent columns.  
**Gate enforcement:** Application-level in job assignment functions (not RLS). No DB constraint prevents an `active`+`not_started` driver from being assigned to jobs at the DB layer.  
**Unit-test coverage:** None. **First E2E validation.**

**⚠ `RIDESHARE_ENABLED = false`** in `transport-request.js` — passenger rides are disabled until TNC permit obtained. This gate applies to concierge_jobs (vehicle shuttles, escort service) only.

**Steps:**

- [ ] 1. Confirm an unscreened driver exists (or create test state):
```sql
SELECT id, profile_id, status, bgc_status FROM drivers
WHERE bgc_status = 'not_started' AND status = 'active' LIMIT 3;
```

- [ ] 2. In admin portal → Active Drivers section, confirm the unscreened driver does NOT appear in the "eligible for assignment" list (or is visually flagged as ineligible)

- [ ] 3. Attempt to assign the unscreened driver to a concierge job — confirm the UI or API rejects the assignment with a clear error

- [ ] 4. Initiate BGC for the driver via admin endpoint:

```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     -H "Content-Type: application/json" \
     -d '{"driver_id": "<driver-id>"}' \
     https://<staging-url>/.netlify/functions/initiate-driver-bgc
```

- [ ] 5. Confirm `bgc_status` transitions to `pending_check`:
```sql
SELECT id, bgc_status, bgc_report_id, bgc_invite_url FROM drivers WHERE id = '<driver-id>';
```

- [ ] 6. Advance to `passed` (staging only — simulate BGC webhook completion):
```sql
-- Staging only — never do this in production
UPDATE drivers SET bgc_status = 'passed', bgc_checked_at = NOW()
WHERE id = '<driver-id>';
```

- [ ] 7. Confirm the driver is now assignable — attempt the same job assignment from Step 3 and confirm it succeeds

- [ ] 8. Set driver to `suspended` and confirm they can no longer receive new assignments:
```sql
UPDATE drivers SET status = 'suspended' WHERE id = '<driver-id>';
```

**SQL activation eligibility check:**
```sql
SELECT id, status, bgc_status,
  CASE WHEN status = 'active' AND bgc_status = 'passed' THEN 'ELIGIBLE'
       ELSE 'NOT ELIGIBLE (' || status || ' / bgc:' || bgc_status || ')' END AS gate
FROM drivers
WHERE id IN ('<driver-a-id>', '<driver-b-id>');
```

---

## TIER 3 — CORE USER JOURNEYS

---

### T3.9 — Member Full Journey

**Signup URL:** `/signup-member.html` → `/onboarding-member.html`  
**Tables touched:** `auth.users`, `profiles`, `care_plans`, `plan_bids`, `payments`, `ride_ratings`  
**Unit-test coverage:** Individual endpoint unit tests only. **Full journey is E2E-only.**

**Steps:**

- [ ] 1. Navigate to `/signup-member.html` → complete multi-step onboarding at `/onboarding-member.html`; confirm redirect to `/members.html` and member is logged in
- [ ] 2. Create a care plan (look for "Request Service" or equivalent CTA): fill in vehicle, services needed, city/state/zip, budget range; confirm submit succeeds

```sql
SELECT id, member_id, title, status, bid_closes_at
FROM care_plans WHERE member_id = '<new-member-uuid>'
ORDER BY created_at DESC LIMIT 3;
-- status = 'open', bid_closes_at = ~72h from now
```

- [ ] 3. Log in as a verified provider at `/providers.html`; find the care plan on the job board; submit a bid (requires bid credits)

```sql
SELECT id, care_plan_id, provider_id, amount, status
FROM plan_bids WHERE care_plan_id = '<care-plan-id>';
-- status = 'pending'
```

- [ ] 4. As the member, view bids on the care plan and click **"Accept"** on the provider's bid

```sql
-- Accepted bid
SELECT id, provider_id, amount, status FROM plan_bids
WHERE care_plan_id = '<care-plan-id>' AND status = 'accepted';

-- Other bids should be 'rejected'
SELECT provider_id, status FROM plan_bids
WHERE care_plan_id = '<care-plan-id>' AND status != 'accepted';

-- Care plan should transition to 'awarded'
SELECT status FROM care_plans WHERE id = '<care-plan-id>';
```

- [ ] 5. Complete payment via Stripe test card `4242 4242 4242 4242`; confirm `payments` row with `status='held'`:

```sql
SELECT id, status, amount_total, mcc_fee, stripe_payment_intent_id
FROM payments WHERE member_id = '<member-uuid>'
ORDER BY created_at DESC LIMIT 3;
```

- [ ] 6. Mark the service complete (member-side confirmation button)
- [ ] 7. Release payment as admin (or member): click **"Release"** button in admin → Payments (see T1.2)
- [ ] 8. Rate the provider (1–5 stars); confirm `ride_ratings` row:

```sql
SELECT id, rater_id, rated_id, rater_role, stars, comment
FROM ride_ratings WHERE rater_id = '<member-uuid>'
ORDER BY created_at DESC LIMIT 3;
```

---

### T3.10 — Provider Full Journey

**Signup URL:** `/signup-provider.html` → `/onboarding-provider.html`  
**Finalization endpoint:** `POST /api/provider/finalize` (promotes to `role='provider'`)  
**Document API:** `GET /api/provider/documents` (lists doc metadata), `POST /api/provider/document-url` (120s signed URL)  
**Bidding gate:** RLS policy `"Verified providers write own bids"` — requires `role='provider' AND verification_status='verified'`  
**Unit-test coverage:** Individual endpoint tests only. **Full journey is E2E-only.**

**Steps:**

- [ ] 1. Navigate to `/signup-provider.html` → complete `/onboarding-provider.html`; upload at minimum a business license (allowed types: `business_license`, `certification`, `portfolio`, `insurance`); submit application

```sql
SELECT id, role, verification_status FROM profiles WHERE email = '<provider-email>';
-- role = 'pending_provider'
```

- [ ] 2. In admin portal → **Applications** section (sidebar → Provider Management → Applications); find the application with status badge `pending`; click **"Review"** button → approve it

```sql
SELECT id, role, verification_status FROM profiles WHERE email = '<provider-email>';
-- role = 'provider', verification_status = 'verified'
```

- [ ] 3. Log in as the provider at `/providers.html`; confirm the portal loads (job board visible)
- [ ] 4. Purchase bid credits: Starter pack via test card `4242 4242 4242 4242` (see T1.1 for confirmation SQL)
- [ ] 5. Find an open care plan on the job board → submit a bid
- [ ] 6. Have the test member accept the bid and complete payment (see T3.9 steps 4–6)
- [ ] 7. After payment release, confirm provider payout entry or pending balance updated (depends on provider type — if a referred founder, see T1.3; otherwise check `payments.status='released'`)
- [ ] 8. In the provider portal, navigate to the Documents section; click to view a document; confirm a signed URL is returned and the document loads in the browser within 120 seconds:

```sql
SELECT id, document_type, file_url, status
FROM provider_documents WHERE provider_id = '<provider-uuid>';
```

---

### T3.11 — Driver Full Journey

**⚠ `RIDESHARE_ENABLED = false`** — passenger rides disabled until TNC permit. This journey tests **concierge_jobs** (vehicle shuttle/escort) only.

**Signup URL:** `/signup-driver.html`  
**Tables:** `drivers`, `concierge_jobs`, `concierge_job_legs`, `concierge_job_drivers`, `driver_earnings`  
**Unit-test coverage:** Transport endpoints partially tested. **Full driver journey is E2E-only.**

**Steps:**

- [ ] 1. Navigate to `/signup-driver.html` → complete driver registration (E.164 phone required for OTP); confirm `drivers` row created:

```sql
SELECT id, profile_id, status, bgc_status, phone, email
FROM drivers WHERE email = '<driver-email>';
-- status = 'active', bgc_status = 'not_started'
```

- [ ] 2. Admin initiates BGC (mock mode — no cost): `POST /api/admin/driver-bgc` with `driver_id`; confirm `bgc_status = 'pending_check'`
- [ ] 3. Advance to `passed` (staging only):
```sql
UPDATE drivers SET bgc_status = 'passed', bgc_checked_at = NOW()
WHERE email = '<driver-email>';
```

- [ ] 4. Admin creates a concierge job and assigns the driver via admin portal → Transport section; confirm `concierge_job_drivers` row:

```sql
SELECT jd.job_id, jd.driver_id, jd.role, jd.assigned_at, jd.accepted_at
FROM concierge_job_drivers jd WHERE jd.driver_id = '<driver-id>';
-- accepted_at = NULL (not yet accepted)
```

- [ ] 5. Driver accepts the job (via driver app or admin trigger); confirm `accepted_at` populated:
```sql
SELECT accepted_at FROM concierge_job_drivers WHERE driver_id = '<driver-id>';
```

- [ ] 6. Complete the job → confirm `concierge_jobs.status = 'completed'`; confirm base earnings:

```sql
SELECT id, driver_id, job_id, amount_cents, kind, recorded_at
FROM driver_earnings WHERE driver_id = '<driver-id>'
ORDER BY recorded_at DESC LIMIT 5;
-- kind = 'base'
```

- [ ] 7. Member adds a tip via `POST /api/transport/tip`; confirm `driver_earnings` tip row:

```sql
SELECT id, amount_cents, kind FROM driver_earnings
WHERE driver_id = '<driver-id>' AND kind = 'tip';
```

---

### T3.12 — Provider Quality Model (Low Rating → Agent Flag → Admin Action)

**⚠ Key finding:** There is NO hardcoded star-rating auto-removal threshold in the database or migration code. A low rating triggers a `provider.low_rating` agent event which is routed to the `agent-advocate`. The advocate proposes a corrective action (with `needs_review=true`) — it does NOT auto-remove or auto-suspend the provider. Reinstatement is a manual admin action via the provider detail modal.

**Unit-test coverage:** None. **First E2E validation.**

**Steps:**

- [ ] 1. Confirm a provider's current aggregate rating:
```sql
SELECT provider_id, average_rating, jobs_completed
FROM provider_stats WHERE provider_id = '<provider-uuid>';
```

- [ ] 2. Submit a 1-star rating for the provider (complete a service flow and use the rating UI — see T3.9 step 8)

- [ ] 3. Check `agent_events` for the `provider.low_rating` event (may take up to 2 minutes for orchestrator):
```sql
SELECT id, event_type, payload, processed_at
FROM agent_events WHERE event_type = 'provider.low_rating'
ORDER BY created_at DESC LIMIT 5;
```

- [ ] 4. Check `agent_actions` for the advocate's proposed action:
```sql
SELECT id, agent_slug, action_type, status, needs_review, decision, confidence
FROM agent_actions
WHERE needs_review = true
ORDER BY created_at DESC LIMIT 5;
```

- [ ] 5. In admin portal → **Agent Fleet** section, locate the proposed action for this provider
- [ ] 6. Confirm `needs_review = true` — verify the provider was NOT automatically suspended:
```sql
-- Provider status unchanged without admin action
SELECT role, verification_status FROM profiles WHERE id = '<provider-uuid>';
```

- [ ] 7. From the Agent Fleet console: click **"Approve"** (to execute the recommended action) or **"Dismiss"** (to ignore); confirm `review_status` updates
- [ ] 8. If the proposal was to suspend: confirm admin manually sets `suspension_reason` via admin portal → provider detail → suspend button; confirm provider no longer sees open care plans (RLS gate `verification_status='verified'` should block access):
```sql
SELECT role, verification_status FROM profiles WHERE id = '<provider-uuid>';
```

---

## TIER 4 — ADMIN (Recently Polished)

---

### T4.13 — Admin Modals Open Correctly

**The `openModal()` fix:** Sets both `.classList.add('active')` AND `.style.display = 'flex'` — both were required for proper visibility. `closeModal()` sets both `classList.remove('active')` AND `style.display = 'none'`.  
**Unit-test coverage:** Admin auth guards are tested in lockdown tests. **Modal UI behavior is E2E-only.**

**Steps:**

- [ ] 1. Log in to admin portal at `https://<staging-url>/admin.html`
- [ ] 2. Navigate to **Members** section (sidebar → Support → Members); wait for member list to load
- [ ] 3. Click the **"View"** button on any member row
- [ ] 4. **Expected:** `member-detail-modal` appears as a centered overlay with member details (name, email, phone, account type, identity status, Stripe session, vehicles). The modal must NOT be hidden, off-screen, or lacking content.
- [ ] 5. Click the **×** or close button — confirm modal closes and the page behind is fully interactive
- [ ] 6. Navigate to **Registration Reviews** section (sidebar → Operations → Registration Reviews)
- [ ] 7. Click the review/view button on any registration record — confirm the review modal opens and content is populated
- [ ] 8. Navigate to any section that has an insurance detail view (Registration Reviews or provider detail); click the insurance detail button — confirm `insurance-detail-modal` opens correctly with no blank content

---

### T4.14 — Stage 3: Sortable Headers, Pagination, Sidebar Collapse

**Unit-test coverage:** None — client-side UI behavior. **First validation.**

**Sortable headers (`toggleSort` function, `applySortToRows` helper):**

- [ ] 1. Navigate to **Applications** (sidebar → Provider Management → Applications)
- [ ] 2. Click the **"Business ⇅"** column header → confirm rows re-sort A→Z, `▲` caret appears on the Business column header
- [ ] 3. Click **"Business ▲"** again → confirm Z→A sort, `▼` caret appears
- [ ] 4. Click **"Submitted ⇅"** → confirm chronological sort, `▲` caret moves to Submitted column, Business column resets to `⇅`
- [ ] 5. Navigate to **Payments** → click **"Amount ⇅"** → confirm ascending dollar sort; click again → descending
- [ ] 6. Navigate to **Transport Rides** → click **"Fare ⇅"** and **"Date ⇅"** columns; confirm sort operates on in-memory rows (no network request fires)
- [ ] 7. Navigate to **Active Providers** → click **"Credits ⇅"**, **"Rating ⇅"**, **"Jobs ⇅"**, **"Earnings ⇅"** → each sorts correctly
- [ ] 8. Navigate to **Members** → click **"Name ⇅"** and **"Joined ⇅"** → confirm sorts correctly

**Client-side pagination (`applyClientPagination`, `changeApplicationsPage`, `changePaymentsPage`, `changeTransportPage`):**

- [ ] 9. Navigate to **Applications** → confirm pagination bar at the bottom of the table shows "Showing X–Y of Z" with **← Previous**, page counter, **Next →**, and 25/50/100 page size dropdown
- [ ] 10. If > 25 applications exist: click **"Next →"** → confirm page 2 loads immediately from in-memory data (no spinner, no API call)
- [ ] 11. Change page size to **50** → confirm row count increases; change to **100** → confirm further increase
- [ ] 12. Apply a status filter tab (e.g., click **"Approved"**) → confirm page **resets to 1** and "Showing 1–X of Y" reflects only approved applications
- [ ] 13. Click a sort column → confirm page **resets to 1**
- [ ] 14. Repeat steps 9–13 for **Payments** and **Transport Rides** sections
- [ ] 15. Confirm **Members** and **Active Providers** do NOT show the client pagination controls (they remain server-side, with API-driven Previous/Next buttons only)

**Sidebar collapsible groups (`toggleNavGroup`, `navGroupCollapsed`):**

- [ ] 16. Click the **"Operations ▾"** nav group label → confirm all 9 Operations items collapse and the caret rotates (▾ → ▸ appearance or rotation via CSS transform)
- [ ] 17. Click **"Operations"** again → confirm items re-expand, caret returns to ▾
- [ ] 18. Collapse **"Support"** and **"Revenue"** groups simultaneously → confirm both are collapsed and sidebar scrolls cleanly
- [ ] 19. Navigate to a section inside a collapsed group by clicking a dashboard stat card (e.g., the Payments stat card) → confirm the Payments section loads correctly even though the Operations group is visually collapsed in the sidebar
- [ ] 20. Refresh the page → confirm **all groups are expanded** (state is in-memory only, not persisted to localStorage)

**Team-role permission visibility (the `data-group` nav fix):**

- [ ] 21. If a restricted admin team account exists (e.g., `role='support_agent'` with limited permitted sections): log in as that user
- [ ] 22. Confirm only permitted `nav-item` elements are visible
- [ ] 23. Confirm nav group labels whose ALL child items are hidden are themselves hidden (the `data-group` fix — label hides when container has no visible children)
- [ ] 24. Confirm nav group labels with at least one visible child item remain visible

---

## TIER 5 — AI AGENTS & AUTOMATED SYSTEMS

### Full Inventory

The following table enumerates every scheduled function registered in `netlify.toml` plus event-driven agents invoked via the orchestrator. "Implemented" = full production logic. "Stub" = registered but handler is minimal or non-functional.

| Function | Schedule | Status | LLM Used | Outbound Comms | Approval Gate |
|----------|----------|--------|----------|----------------|---------------|
| `agent-orchestrator` | Every minute | Implemented | None | HTTP to agent endpoints | N/A (router) |
| `agent-director-scheduled` | Every 15 min | Implemented | None (pure DB scan) | Twilio SMS + Resend email to admin | **AUTONOMOUS ⚠** |
| `agent-analyst` | Daily 05:00 UTC | **Stub** | Claude Sonnet 4.5 | None | N/A |
| `agent-cron-emitter` | Daily 05:00 UTC | Implemented | None | agent_events bus only | N/A |
| `agent-gatekeeper` (event-driven) | On `provider.applied` etc. | Implemented | Claude Sonnet 4.5 | None (writes to agent_actions) | **Human approval required ✓** |
| `agent-matchmaker` (event-driven) | On `care_plan.auction_closed` | Implemented | Claude Sonnet 4.5 | None (writes to agent_actions) | **Human approval required ✓** |
| `outreach-cycle` | Every 15 min | Implemented | Gemini 2.5-Flash / Claude Sonnet 4.5 fallback | Writes outreach drafts | **Human approval required ✓** |
| `outreach-followups` | Every 6 hours | Implemented | Gemini 2.5-Flash / Claude fallback | Email/SMS drafts only | **Human approval required ✓** |
| `outreach-cleanup` | Weekly Sun 00:00 UTC | Implemented | None | None | N/A |
| `apollo-discovery-scheduled` | Every 6 hours | Implemented | Gemini 2.5-Flash | Google Places API, optional Instantly.ai | Partial — Instantly auto-sync configurable ⚠ |
| `wefunder-blast-scheduled` | Weekly Sun 02:00 UTC | Implemented | Claude Opus 4.5 | Resend email to leads | Requires admin review ✓ |
| `bgc-expiration-sweep` | Daily 06:00 UTC | Implemented | None | `ai_action_log` only | N/A |
| `bgc-send-reminders` | Daily 13:00 UTC | Implemented | None | Resend email to employees | **AUTONOMOUS ⚠** |
| `social-monitor-scheduled` | Every 15 min | **Partial stub** | None | agent_events bus | N/A |
| `gatekeeper-smoke-scheduled` | Daily 09:00 UTC | Implemented | None | Resend on failure | N/A (smoke test) |
| `matchmaker-smoke-scheduled` | Daily 09:15 UTC | Implemented | None | Resend on failure | N/A (smoke test) |
| `treasurer-smoke-scheduled` | Daily 09:30 UTC | Implemented | None | Resend on failure | N/A (Treasurer not yet deployed) |
| `anthropic-health-scheduled` | Daily 04:00 UTC | Implemented | None (health ping) | Resend + ai_action_log on failure | Autonomous |
| `integration-health-scheduled` | Daily 04:15 UTC | Implemented | None | Resend + ai_action_log | Autonomous |
| `facebook-deletion-scheduled` | Daily 03:00 UTC | **Stub (GDPR)** | None | None | N/A |
| `api-key-expiry-scheduled` | Daily 12:00 UTC | Implemented | None | Resend email | Autonomous |
| `concierge-push-notifier-scheduled` | Every minute | Implemented | None | FCM v1 push to drivers + members | **AUTONOMOUS ⚠** |
| `bid-credit-reconciler-scheduled` | Daily 03:30 UTC | Implemented | None | Resend email + ai_action_log | Autonomous |
| `auto-bid-engine-scheduled` | Hourly | Implemented | None | `plan_bids` inserts | **AUTONOMOUS ⚠** |
| `maintenance-reminders-scheduled` | Daily 08:00 UTC | Implemented | None | Twilio SMS + Resend email to members | **AUTONOMOUS ⚠** (member pref-gated) |
| `b3-milestone-check-scheduled` | Daily 02:15 UTC | Implemented | None | `member_founder_profiles` write only | N/A |
| `founder-payout-monthly-scheduled` | Monthly 14:00 UTC 1st | Implemented | None | Resend summary email; Stripe Connect auto-transfer | **AUTO-TRANSFERS Stripe Connect ⚠** |
| `transport-scheduled-dispatch` | Every 15 min | Implemented | None | Ride status transitions in DB | Autonomous |
| `payment-tracker-scheduled` | Daily 03:00 UTC | Implemented | None | `ai_action_log` only (scan, no execution) | N/A |
| `daily-digest-scheduled` | Daily 01:00 UTC | Implemented | Claude Opus 4.5 | Resend email to admin | Autonomous |

---

### T5.A — Agent Orchestrator + Gatekeeper Pipeline

**What it does:** Orchestrator drains `agent_events` every minute (30s rate-limit cooldown) and routes each event to the matching agent. Gatekeeper calls Claude Sonnet 4.5 to review provider applications and writes a **proposed** action (`status='proposed'`, `needs_review=true`) — never auto-mutates provider state.

**Required env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY_MCC_FLEET1`, `ADMIN_EMAIL`, `RESEND_API_KEY`

**Failure behavior:** Dead-letter queue (`agent_dead_letter`) after 3 failed delivery attempts. Director alerts admin if error rate spikes.

**Unit tests:** `gatekeeper-smoke-scheduled` runs daily at 09:00 UTC as an automated pipeline smoke test.

- [ ] 1. Submit a new provider application (via `/signup-provider.html`) to generate a `provider.applied` event
- [ ] 2. Confirm event created:

```sql
SELECT id, event_type, payload->>'provider_id' AS provider_id, processed_at, routed_to
FROM agent_events WHERE event_type = 'provider.applied'
ORDER BY created_at DESC LIMIT 3;
```

- [ ] 3. Wait up to 2 minutes; confirm `processed_at` is set and `routed_to = 'gatekeeper'`
- [ ] 4. Confirm Gatekeeper's proposed action exists:

```sql
SELECT id, agent_slug, action_type, status, needs_review,
       decision->>'recommendation' AS recommendation, confidence, cost_usd
FROM agent_actions
WHERE agent_slug = 'gatekeeper' AND needs_review = true
ORDER BY created_at DESC LIMIT 3;
-- status = 'proposed', needs_review = true, recommendation IN ('approve','reject','manual_review')
```

- [ ] 5. In admin portal → **Agent Fleet** section, find the proposal; click **"Approve"** or **"Reject"**; confirm `review_status` updates and provider state reflects decision
- [ ] 6. Confirm daily spend cap was not breached:

```sql
SELECT agent_slug, day, reserved_usd, actual_usd, call_count
FROM agent_daily_spend WHERE agent_slug = 'gatekeeper' AND day = CURRENT_DATE;
-- actual_usd should be a few cents, well under $5.00 cap
```

---

### T5.B — Matchmaker (Bid Ranking → Proposed Winner)

**What it does:** On `care_plan.auction_closed` event, calls Claude Sonnet 4.5 to rank bids and writes `recommended_winner_bid_id` to `agent_actions` with `needs_review=true`. No notification to the winning provider until admin approves.

**Required env vars:** Same as T5.A

- [ ] 1. Create a care plan and set `bid_closes_at` to 2 minutes from now:
```sql
UPDATE care_plans SET bid_closes_at = NOW() + interval '2 minutes'
WHERE id = '<test-care-plan-id>';
```

- [ ] 2. Have 2+ providers place bids on this care plan
- [ ] 3. After `bid_closes_at` passes, confirm `care_plan.auction_closed` event:
```sql
SELECT id, event_type, processed_at FROM agent_events
WHERE event_type = 'care_plan.auction_closed' ORDER BY created_at DESC LIMIT 3;
```

- [ ] 4. Confirm Matchmaker's proposal (within 2 minutes):
```sql
SELECT id, agent_slug, status, needs_review,
       decision->>'recommended_winner_bid_id' AS recommended_bid,
       confidence, cost_usd
FROM agent_actions WHERE agent_slug = 'matchmaker' ORDER BY created_at DESC LIMIT 3;
-- needs_review = true, status = 'proposed'
```

- [ ] 5. In Agent Fleet console, approve the proposal — confirm winning provider receives notification (FCM push or email per preferences)

---

### T5.C — Outreach Engine (Approval Gate — Verify No Autonomous Send)

**What it does:** Discovers leads via Google Places + Apollo, drafts messages via Gemini 2.5-Flash LLM (with Claude Sonnet 4.5 fallback), stores drafts with `needs_review=true`. Sends ONLY after admin approval (`review_status='approved'`). Optional Instantly.ai auto-sync for lead enrollment (configurable — risk if enabled).

**⚠ LAUNCH RISK:** If `engine_state.instantly_auto_sync = 'true'`, leads are enrolled in Instantly.ai cold-outreach campaigns BEFORE admin reviews the message draft. Confirm this is disabled.

**Required env vars:** `GOOGLE_PLACES_API_KEY`, `GEMINI_API_KEY`, `APOLLO_API_KEY`, `RESEND_API_KEY`, `TWILIO_*`, optionally `INSTANTLY_API_KEY`

- [ ] 1. **Confirm Instantly auto-sync is OFF:**
```sql
SELECT key, value FROM engine_state WHERE key = 'instantly_auto_sync';
-- value must NOT be 'true'. If it is: UPDATE engine_state SET value = 'false' WHERE key = 'instantly_auto_sync';
```

- [ ] 2. Manually trigger one outreach cycle:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/outreach-cycle
```

- [ ] 3. Confirm drafts created with `needs_review = true` — no messages sent yet:
```sql
SELECT id, lead_id, action_type, status, needs_review, review_status, created_at
FROM outreach_outreach_actions
WHERE needs_review = true ORDER BY created_at DESC LIMIT 5;
-- status = 'draft', review_status = NULL or 'pending'
```

- [ ] 4. In admin portal → **Marketing & Outreach** section, locate a draft; read the content; click **"Approve"** — confirm the message sends only NOW
- [ ] 5. Confirm `review_status = 'approved'`, `status = 'sent'` after approval:
```sql
SELECT id, status, review_status, reviewed_at FROM outreach_outreach_actions
WHERE id = '<approved-action-id>';
```

- [ ] 6. Check LLM cost for this cycle:
```sql
SELECT agent_slug, day, actual_usd, call_count FROM agent_daily_spend
WHERE agent_slug IN ('outreach', 'hunter') AND day = CURRENT_DATE;
```

---

### T5.D — Director Agent (⚠ Autonomous SMS/Email to Admin)

**What it does:** Pure DB scan every 15 min — detects fleet stalls (Gatekeeper errors, ride dispatch failures, Hunter backlog). Sends Twilio SMS + Resend email to `ADMIN_ALERT_PHONE` / `ADMIN_EMAIL` autonomously. Quiet hours 02:00–11:00 UTC suppress non-critical alerts. Daily digest at 11:00 UTC always fires. Deduplicates alerts: same alert_key not re-paged for 6 hours.

**⚠ LAUNCH RISK:** No human approval gate. Director pages admin directly. Ensure `ADMIN_ALERT_PHONE` is correct before enabling in production.

**Required env vars:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ADMIN_ALERT_PHONE`, `RESEND_API_KEY`, `ADMIN_EMAIL`

- [ ] 1. Invoke Director manually during non-quiet hours (after 11:00 UTC):
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/agent-director-scheduled
```

- [ ] 2. Confirm admin receives SMS to `ADMIN_ALERT_PHONE` and email to `ADMIN_EMAIL` (even if there are no stalls — a "no issues" digest should still arrive at the 11:00 UTC tick)
- [ ] 3. Check findings logged:
```sql
SELECT alert_key, severity, title, sms_sent_at, email_sent_at, resolved_at
FROM agent_director_alerts ORDER BY created_at DESC LIMIT 10;
```

- [ ] 4. Invoke immediately again — confirm same alert NOT re-sent (6h dedupe):
```sql
SELECT alert_key, sms_sent_at FROM agent_director_alerts
WHERE sms_sent_at > NOW() - interval '5 minutes';
-- Count should not increase for the same alert_key
```

---

### T5.E — Concierge Push Notifier (⚠ Autonomous FCM to Real Devices)

**What it does:** Drains `concierge.*` events every minute via cursor (key `concierge_push_last_event_id` in `ai_ops_settings`), sends FCM v1 push to driver + member device tokens. No approval gate. Stale tokens are deactivated automatically.

**⚠ LAUNCH RISK:** Any `concierge.*` event fires real FCM pushes to real device tokens in the DB. Use a staging DB with test device tokens to avoid paging real users during testing.

**Required env vars:** `FCM_SERVICE_ACCOUNT_JSON`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_NOTIFICATION_EMAIL`, `RESEND_API_KEY`

- [ ] 1. Insert a test event using a test device token:
```sql
INSERT INTO agent_events (event_type, payload, source)
VALUES ('concierge.job_assigned',
        '{"job_id": "00000000-0000-0000-0000-000000000001",
          "driver_id": "<test-driver-id>",
          "member_id": "<test-member-id>"}',
        'e2e_test');
```

- [ ] 2. Wait up to 1 minute; confirm push received on test device
- [ ] 3. Confirm event processed:
```sql
SELECT id, event_type, processed_at, routed_to
FROM agent_events WHERE event_type = 'concierge.job_assigned'
ORDER BY created_at DESC LIMIT 3;
-- processed_at NOT NULL
```

- [ ] 4. Test stale token handling: set a driver's FCM token to an invalid value, trigger another event, confirm `active = false` is set on that device token row

---

### T5.F — Bid Credit Reconciler (Daily Safety Net for Money)

**What it does:** Daily 03:30 UTC — lists Stripe Checkout Sessions from last 7 days with `metadata.bids` set; checks each against `bid_credit_grants`; for any paid session > 1h old with no grant row, logs to `ai_action_log` (`module='bid_credit_grant_missing'`, `escalated=true`) and emails admin. Deduplicates per `payment_intent`.

**Required env vars:** `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`

**Unit tests:** `netlify/functions-tests/bid-credit-grant.test.js` covers all reconciler scenarios including dedupe.

- [ ] 1. Simulate a gap: complete a Stripe test checkout (T1.1) then delete the grant row:
```sql
DELETE FROM bid_credit_grants WHERE transaction_id = '<stripe-pi-id>';
```

- [ ] 2. Invoke reconciler manually:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/bid-credit-reconciler-scheduled
```

- [ ] 3. Confirm admin alert email received for the missing grant
- [ ] 4. Confirm `ai_action_log` entry:
```sql
SELECT id, module, target_id, action_type, escalated, outcome, created_at
FROM ai_action_log WHERE module = 'bid_credit_grant_missing'
ORDER BY created_at DESC LIMIT 3;
-- escalated = true, target_id = '<stripe-pi-id>'
```

- [ ] 5. Re-run reconciler — confirm same payment_intent NOT re-alerted:
```sql
SELECT COUNT(*) FROM ai_action_log
WHERE module = 'bid_credit_grant_missing' AND target_id = '<stripe-pi-id>';
-- Must be exactly 1
```

---

### T5.G — B3 Milestone Check (see T1.4 for complete procedure)

- [ ] Schedule confirmed in `netlify.toml`: `schedule = "15 2 * * *"` (02:15 UTC daily)
- [ ] $0/empty revenue case: function exits cleanly with HTTP 200, no DB writes, no errors

---

### T5.H — Founder Monthly Payout (⚠ Auto-Transfers via Stripe Connect)

**What it does:** Monthly on 1st at 14:00 UTC — creates `founder_payouts` rows for all founders with `pending_balance > 0`; auto-processes Stripe Connect transfers (no further approval); flags PayPal-only founders in summary email.

**⚠ LAUNCH RISK:** Auto-executes Stripe Connect transfers without per-payout admin confirmation. Chris has `payout_email = chris@alphaautobodynj.com` and NO `stripe_connect_account_id` → will be flagged as `pending_manual` (PayPal) in the summary email — no auto-transfer fires for him. Confirm staging Stripe keys are test keys before invoking.

**Required env vars:** `STRIPE_SECRET_KEY` (must be `sk_test_…` in staging), `RESEND_API_KEY`, `ADMIN_EMAIL`

- [ ] 1. Confirm Chris's payout setup:
```sql
SELECT id, payout_email, stripe_connect_account_id, pending_balance, status
FROM member_founder_profiles WHERE id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';
-- stripe_connect_account_id should be NULL (PayPal payout, not Stripe Connect)
-- pending_balance should reflect any accrued commissions + milestone bonuses
```

- [ ] 2. Invoke payout function (staging only, test Stripe key):
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/founder-payout-monthly-scheduled
```

- [ ] 3. Confirm `founder_payouts` row for Chris with `status = 'pending_manual'`:
```sql
SELECT id, founder_id, amount, method, status, created_at
FROM founder_payouts WHERE founder_id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd'
ORDER BY created_at DESC LIMIT 3;
-- status = 'pending_manual' (PayPal — not auto-processed)
```

- [ ] 4. Confirm admin summary email received listing Chris under "Requires manual payout (PayPal): `chris@alphaautobodynj.com`"
- [ ] 5. Confirm `pending_balance` zeroed after payout row created:
```sql
SELECT pending_balance FROM member_founder_profiles
WHERE id = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';
-- Should be 0.00 after payout row created
```

---

### T5.I — BGC Expiration Sweep & Reminders

**What it does:** `bgc-expiration-sweep` (06:00 UTC) scans `employee_background_checks` for expiring/expired records, logs to `ai_action_log`. `bgc-send-reminders` (13:00 UTC) sends Resend emails to employee email addresses.

- [ ] 1. Create a test record expiring within 30 days:
```sql
UPDATE employee_background_checks
SET expires_at = NOW() + interval '15 days'
WHERE id = '<test-bgc-id>';
```

- [ ] 2. Run sweep:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/bgc-expiration-sweep
```

- [ ] 3. Confirm `ai_action_log` entry:
```sql
SELECT id, module, target_id, outcome, created_at FROM ai_action_log
WHERE module LIKE '%bgc%' ORDER BY created_at DESC LIMIT 5;
```

- [ ] 4. Run reminders:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/bgc-send-reminders
```

- [ ] 5. Confirm reminder email arrives at the employee's email address on record

---

### T5.J — Transport Scheduled Dispatch

**What it does:** Every 15 min, promotes rides with `status='scheduled'` and `pickup_time ≤ NOW() + 30 min` to `status='requested'`.

**⚠ `RIDESHARE_ENABLED = false` — passenger rides are NOT dispatched.** Only concierge_jobs relevant.

- [ ] 1. Set a ride to `scheduled` with pickup 25 minutes from now:
```sql
UPDATE rides SET status = 'scheduled', pickup_time = NOW() + interval '25 minutes'
WHERE id = '<test-ride-id>';
```

- [ ] 2. Invoke dispatch:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/transport-scheduled-dispatch
```

- [ ] 3. Confirm ride promoted:
```sql
SELECT id, status, pickup_time FROM rides WHERE id = '<test-ride-id>';
-- status = 'requested'
```

- [ ] 4. Confirm ride appears in admin → **Transport Rides** with status badge `requested`

---

### T5.K — Anthropic Health Check (Daily Model Ping)

**What it does:** Daily 04:00 UTC — sends a 1-token ping to every model in `MODELS_IN_USE`; alerts admin (Resend + `ai_action_log`) on `model_not_found` or `invalid_request_error`. Catches silent deprecations within 24h.

**Required env vars:** `ANTHROPIC_API_KEY_MCC_FLEET1`, `RESEND_API_KEY`, `ADMIN_EMAIL`

- [ ] 1. Invoke manually:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/anthropic-health-scheduled
```

- [ ] 2. Confirm no alert email fired (all models available) — HTTP 200 returned
- [ ] 3. Check `ai_action_log` for health entries (should be clean):
```sql
SELECT id, module, outcome, created_at FROM ai_action_log
WHERE module LIKE '%health%' OR module LIKE '%anthropic%'
ORDER BY created_at DESC LIMIT 5;
```

---

### T5.L — API Key Expiry Check

**What it does:** Daily 12:00 UTC — checks all secrets in `lib/api-key-expiry-config.js` for expiration dates; alerts admin 30 days before expiry. Single source of truth (the legacy `stripe-key-expiry-scheduled.js` is not scheduled — only `api-key-expiry-scheduled` is wired to cron).

- [ ] 1. Invoke manually:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/api-key-expiry-scheduled
```

- [ ] 2. Confirm no false-positive expiry alerts fired for valid keys
- [ ] 3. Confirm Stripe key appears active/not expiring soon in the response log:
```sql
SELECT id, module, target_id, outcome, created_at FROM ai_action_log
WHERE module LIKE '%expiry%' OR module LIKE '%key%'
ORDER BY created_at DESC LIMIT 5;
```

---

### T5.M — Daily Digest (Claude Opus 4.5 — Note Cost)

**What it does:** Daily 01:00 UTC — calls Claude Opus 4.5 to synthesize overnight fleet activity into a digest email sent to `ADMIN_EMAIL`. Logs to `ai_action_log`.

**Cost note:** Claude Opus 4.5 at $15/$75 per 1M tokens (in/out). Typical digest: ~2,500 tokens in + 500 tokens out ≈ **$0.075/day → ~$2.25/month**. At 10× scale: ~$22.50/month. Acceptable at launch.

- [ ] 1. Invoke manually:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/daily-digest-scheduled
```

- [ ] 2. Confirm admin receives digest email within 60 seconds
- [ ] 3. Confirm `ai_action_log` entry:
```sql
SELECT id, module, outcome, cost_usd, created_at FROM ai_action_log
WHERE module LIKE '%digest%' ORDER BY created_at DESC LIMIT 3;
```

---

### T5.N — Auto-Bid Engine (⚠ Places Bids Without Per-Bid Approval)

**What it does:** Hourly — scans `provider_auto_bid_settings` for providers with `enabled=true`; automatically places `plan_bids` rows on matching open care plans using the provider's `bid_credits`. Fully autonomous — providers opt in, but once enabled, every matching plan gets auto-bid.

**⚠ LAUNCH RISK:** No per-bid admin confirmation. Uses real bid credits. Test with a provider account that has only test credits.

- [ ] 1. Confirm a test provider has auto-bid enabled:
```sql
SELECT provider_id, enabled, max_bid_amount, criteria FROM provider_auto_bid_settings
WHERE enabled = true LIMIT 5;
```

- [ ] 2. Create a test care plan matching the criteria
- [ ] 3. Note the provider's `bid_credits` before running:
```sql
SELECT bid_credits FROM profiles WHERE id = '<provider-uuid>';
```

- [ ] 4. Invoke the engine:
```bash
curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
     https://<staging-url>/.netlify/functions/auto-bid-engine-scheduled
```

- [ ] 5. Confirm `plan_bids` row created with `is_auto_bid = true`:
```sql
SELECT id, provider_id, amount, is_auto_bid, status
FROM plan_bids WHERE care_plan_id = '<test-care-plan-id>';
```

- [ ] 6. Confirm `bid_credits` decremented:
```sql
SELECT bid_credits FROM profiles WHERE id = '<provider-uuid>';
```

---

## Cost & Risk Summary

### Autonomous Outbound — Agents That Send Without Approval

| Agent | Recipient | Trigger | Risk Level | Mitigation |
|-------|-----------|---------|------------|------------|
| Director — SMS | `ADMIN_ALERT_PHONE` | Fleet stall detected | Medium | Admin-only recipient; quiet hours 02–11 UTC; 6h dedup |
| Director — email | `ADMIN_EMAIL` | Fleet stall / daily digest | Low | Admin-only recipient |
| Concierge push notifier | Driver + member devices | Any `concierge.*` event | Medium | Respects member_notification_preferences; stale token deactivation |
| `bgc-send-reminders` | Employee email | Expiring BGC records | Medium | Targets employees on record; no opt-out enforced |
| `maintenance-reminders-scheduled` | Member SMS + email | Vehicle service due | Medium | Respects member_notification_preferences and opt-out |
| `founder-payout-monthly-scheduled` | Stripe Connect auto-transfer | Monthly on 1st | **High** | Chris is PayPal-only so no auto-transfer fires; all Stripe Connect founders auto-paid |
| `auto-bid-engine-scheduled` | `plan_bids` table | Hourly | Medium | Provider must opt in; controlled by bid credit balance |

### Agents That Require Human Approval Before Any Action

| Agent | What it proposes | Approval UI location |
|-------|-----------------|----------------------|
| Gatekeeper | Provider approve/reject/manual_review | Admin portal → Agent Fleet |
| Matchmaker | Recommended winning bid | Admin portal → Agent Fleet |
| Outreach engine | Email/SMS draft for lead | Admin portal → Marketing & Outreach |
| Wefunder blast | Email content to investors | Admin portal → Outreach (review before send) |

### ⚠ Pre-Launch Action Items

| Item | Risk | Action |
|------|------|--------|
| `engine_state.instantly_auto_sync` | High — leads enrolled in cold-outreach campaigns before admin review | Confirm `value = 'false'`; enable only after approval flow verified |
| `BGC_LIVE_MODE` | High — real BGC orders cost $70/check | Set `'true'` in production only; confirm BGC billing account before enabling |
| `RIDESHARE_ENABLED = false` | TNC permit required | Do NOT change to `true` until permit obtained |
| `treasurer-smoke-scheduled` | Smoke test fails daily (Treasurer not deployed) | Confirm smoke test failure is non-blocking / alert-free, or silence it |
| `agent-analyst` | Stub — Claude Sonnet 4.5 registered but minimal handler | No user impact; may log errors; confirm no cost incurred on invocation |

### LLM Monthly Cost Estimate

| Agent | Model | Calls/day | Est. cost/day | Est. cost/month | At 10× |
|-------|-------|-----------|---------------|-----------------|--------|
| `daily-digest-scheduled` | Claude Opus 4.5 | 1 | ~$0.075 | ~$2.25 | ~$22 |
| Gatekeeper | Claude Sonnet 4.5 | 2–5 | ~$0.05 | ~$1.50 | ~$15 |
| Matchmaker | Claude Sonnet 4.5 | 5–10 | ~$0.07 | ~$2.10 | ~$21 |
| Outreach engine | Gemini 2.5-Flash (primary) | 20–50 | ~$0.02 | ~$0.60 | ~$6 |
| Hunter (scoring) | Claude Haiku 4.5 | 10–30 | ~$0.01 | ~$0.30 | ~$3 |
| **Total** | | | **~$0.22** | **~$6.75** | **~$67** |

Spend-cap mechanism prevents runaway: each agent has a $5/day cap enforced by atomic RPC (`agent_try_spend` / `agent_reconcile_spend`). Cap breach triggers a one-per-agent-per-day alert email to `ADMIN_EMAIL`.

---

## Environment Variables — Pre-Launch Confirmation

| Variable | Required | Used by | Status |
|----------|----------|---------|--------|
| `SUPABASE_URL` | ✅ | All functions | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | All functions | |
| `STRIPE_SECRET_KEY` | ✅ | Checkout, webhook, payouts | |
| `STRIPE_PUBLISHABLE_KEY` | ✅ | Frontend Stripe.js | |
| `STRIPE_WEBHOOK_SECRET` | ✅ | `stripe-webhook.js` | |
| `ADMIN_PASSWORD` | ✅ | All protected endpoints | |
| `ANTHROPIC_API_KEY_MCC_FLEET1` | ✅ | Gatekeeper, Matchmaker, Digest | |
| `ANTHROPIC_API_KEY` | ⚠ Fallback | Same agents (secondary workspace) | |
| `RESEND_API_KEY` | ✅ | All email sends | |
| `ADMIN_EMAIL` | ✅ | All admin alerts | |
| `ADMIN_NOTIFICATION_EMAIL` | ✅ | Concierge stall alerts | |
| `MCC_FROM_EMAIL` | ✅ | All outbound email sender | |
| `TWILIO_ACCOUNT_SID` | ✅ | Director, maintenance reminders | |
| `TWILIO_AUTH_TOKEN` | ✅ | Twilio | |
| `TWILIO_PHONE_NUMBER` | ✅ | SMS from number | |
| `TWILIO_FROM_NUMBER` | ✅ | Alternate SMS reference | |
| `ADMIN_ALERT_PHONE` | ✅ | Director SMS recipient | |
| `FCM_SERVICE_ACCOUNT_JSON` | ✅ | Concierge push notifier | |
| `GOOGLE_PLACES_API_KEY` | ✅ | Lead discovery | |
| `GEMINI_API_KEY` | ✅ | Outreach LLM (primary) | |
| `GOOGLE_API_KEY` | ⚠ Fallback | Gemini fallback | |
| `BGC_API_TOKEN` | ⚠ Required for live BGC | BGC functions | |
| `BGC_WEBHOOK_SECRET` | ⚠ Required for live BGC | Inbound BGC webhook | |
| `BGC_LIVE_MODE` | ⚠ Set `'true'` for production | All BGC functions | |
| `BGC_PRIVATE_KEY` | ⚠ Required for live BGC | Provider sub-account decryption | |
| `APOLLO_API_KEY` | ✅ | Lead enrichment | |
| `INSTANTLY_API_KEY` | ⚠ Optional | Outreach auto-sync (keep disabled initially) | |
| `HUBSPOT_PRIVATE_APP_TOKEN` | ⚠ Optional | CRM bridge | |
| `FACEBOOK_APP_SECRET` | ⚠ Optional | Social deletion handler (stub) | |
| `PRINTFUL_API_KEY` | ⚠ Optional | Merch manager | |
| `ADMIN_SLACK_WEBHOOK_URL` | ⚠ Optional | Slack status alerts | |

---

## Known Stubs / Not Yet Launch-Ready

| Component | Status | Launch Impact |
|-----------|--------|---------------|
| `agent-analyst` | Stub — minimal handler | No user impact; scheduled daily — confirm no cost or error on invocation |
| `social-monitor-scheduled` | Partial — social_leads pipeline incomplete | No user impact; confirm no errors on empty run |
| `treasurer-smoke-scheduled` | Smoke only — Treasurer agent not deployed | Smoke test will fail/alert; confirm failure is non-blocking before launch |
| `facebook-deletion-scheduled` | GDPR stub | Manual GDPR compliance process required; confirm no errors on empty run |
| Provider quality auto-removal | No threshold enforcement in DB — agent proposes only | Document admin runbook: what to do when advocate flags a low-rated provider |
| `RIDESHARE_ENABLED = false` | Passenger rides disabled | TNC permit required; do NOT enable before permit obtained |
| Real-time admin dashboard | No WebSocket — manual refresh required | No blocking; document in ops: refresh admin portal to see latest data |
