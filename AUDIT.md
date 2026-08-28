# MCC Codebase Audit

**Project:** My Car Concierge (`co.mycarconcierge.app`)
**Supabase project:** `ifbyjxuaclwmadqbjcyp`
**Audit date:** 2026-05-20
**Auditor:** Claude Sonnet 4.6 (automated)

---

## Section 1 — Stack Inventory

### Runtime (root `package.json` + `www/package.json`)

| Package | Root version | `www/package.json` | Notes |
|---|---|---|---|
| `@supabase/supabase-js` | `^2.45.0` | `^2.45.0` | Client SDK |
| `stripe` | `^15.0.0` | `^15.0.0` | — |
| `@anthropic-ai/sdk` | `^0.24.0` | `^0.24.0` | — |
| `openai` | `^4.50.0` | `^4.50.0` | — |
| `@google/genai` | `^1.42.0` (root) / `^1.0.0` (www) | — | Version divergence |
| `@google/generative-ai` | `^0.24.1` | `^0.24.0` | — |
| `@google-cloud/vision` | `^5.3.4` (root) / `^4.3.2` (www) | — | Version divergence |
| `@capacitor/core` | `^7.4.4` | `^7.4.4` | — |
| `@capacitor/android` | `^7.4.4` | devDep only | — |
| `@capacitor/ios` | `^7.4.4` | devDep only | — |
| `@capacitor/push-notifications` | `^7.0.0` | — | Root only |
| `@capacitor/cli` | `^7.4.4` | devDep only | — |
| `@capacitor-community/stripe` | — | `^7.2.2` (devDep) | www only |
| `pg` | `^8.18.0` | `^8.18.0` | — |
| `sharp` | `^0.34.5` (root) / `^0.33.0` (www) | — | Version divergence |
| `resend` | — | `3.3.0` | www only (pinned, not range) |
| `bcryptjs` | — | `^3.0.3` | www only |
| `pdfkit` | — | `^0.17.2` | www only |
| `@hubspot/api-client` | `^13.4.0` | — | Root only |
| `archiver` | `^7.0.1` | — | Root only |
| `qrcode` | `^1.5.4` | — | Root only |
| `@replit/connectors-sdk` | `^0.2.0` | — | Root only |
| `esbuild` | `^0.27.3` | — | Root only (bundler) |
| `netlify-cli` | `^23.12.3` | devDep | — |
| `electron` | `^39.2.6` | devDep | Desktop build |
| `electron-builder` | `^26.0.12` | devDep | — |
| `eslint` | `^10.2.1` | — | Root devDep |

### `netlify/functions/package.json` (deployed separately)

| Package | Version |
|---|---|
| `@anthropic-ai/sdk` | `^0.39.0` |
| `@google/genai` | `^1.0.0` |
| `@supabase/supabase-js` | `^2.39.0` |
| `pdfkit` | `^0.15.2` |
| `resend` | `6.8.0` |
| `stripe` | `^14.0.0` |

> **Note:** `netlify/functions` pins `stripe@^14` while root and www use `stripe@^15`. This means the deployed Netlify functions run against a different Stripe SDK major version than the client-side code.

### Bundler / Build

No Vite/webpack. The project is vanilla HTML + JS served from `www/`. Netlify functions use `esbuild` (configured via `netlify.toml` `node_bundler = "esbuild"`). Desktop shell uses `electron-builder`.

### React / React-DOM

**None.** The frontend is vanilla JS. The `artifacts/mockup-sandbox/` sub-project uses React 18 with Vite, but this is a development sandbox not deployed to production.

---

## Section 2 — Dead Code / Unused Deps / Duplicate Utilities

### Unused deps in root `package.json`

| Package | Search result | Verdict |
|---|---|---|
| `@hubspot/api-client` | 0 references in `netlify/functions/`, `*.js`, `scripts/` | **Unused** |
| `archiver` | 0 references in application code | **Unused** |
| `@replit/connectors-sdk` | 0 references in application code | **Unused** |
| `qrcode` | 1 reference (`generate-admin-hash.html` script tag) | Marginal; HTML-only use, not imported via Node |

### Duplicate utility functions

| Function | Files |
|---|---|
| `formatDateRange(start, end)` | `/Users/jordanzanetis/mycarconcierge/members-extras.js:3597` and `/Users/jordanzanetis/mycarconcierge/members.js:12378` — identical name, duplicated inline |
| `showToast(message, type)` | Defined in `members-core.js:2962`; both `members.js` and `members-core.js` are loaded on the same page. If both are concatenated the function is doubly declared. |

### Dead code / notable patterns

- `/Users/jordanzanetis/mycarconcierge/netlify/functions/social-adapters.js:80` contains `// TODO: real API call. Until then we still mock — flip back to real`, indicating a stub that still ships mocked responses.
- `/Users/jordanzanetis/mycarconcierge/artifacts/` is a React mockup sandbox. No production code depends on it.
- `outreach-pipeline` table is referenced in `server.js` and functions but does not exist in production (see Section 4).

### Dead-code removal candidates — `server.js` monolith & `www/` siblings (verified 2026-07-08)

Production runs entirely on `netlify/functions/`. The legacy Express monolith is **not** part of that surface and is unrunnable. Removal candidates below were verified by import-graph tracing (imports grep across `netlify/functions/`, root, `www/`, `tests/`, `scripts/`; excluding `node_modules/` and the `.netlify/` build cache).

- **`server.js` (root, 34,469 lines) — confirmed unrunnable, dead.** It does `require('./stripe-treasury')`, `require('./hubspot-client')`, `require('./car-club-api')`, `require('./outreach-engine-api')` (lines 17–20), but none of those files exist at the repo root — they live in `www/`. The import graph resolves to nothing, so the process cannot boot. No `netlify/functions/` code imports `server.js`.
- **`npm start` script — dead.** `"start": "node www/server.js"` in root `package.json`, but **`www/server.js` does not exist**. The start script has no valid target and should be removed (or repointed) as part of retiring the monolith.
- **The four `www/` siblings — zero live importers.** None are imported by any `netlify/functions/` file. Importer verification:

  | File | Imported by live Netlify function? | Only importer(s) | Verdict |
  |---|---|---|---|
  | `www/stripe-treasury.js` | No | root `server.js` (broken path) | Dead — remove with `server.js` |
  | `www/hubspot-client.js` | No | root `server.js` (broken path) | Dead — remove with `server.js`. (`@hubspot/api-client` dep already flagged Unused above.) |
  | `www/car-club-api.js` | No | root `server.js` + `tests/club-merch-store.spec.js` (reads file as text via `fs.readFileSync`, not a runtime import) | Dead in production; delete the text-scraping test alongside it |
  | `www/outreach-engine-api.js` | No | root `server.js` only | Dead. Note: `outreach-runner/runner.js` imports its **own** `outreach-runner/outreach-engine-api.js` copy, not this one |

  The `android/app/src/main/assets/public/*` copies of these four files are bundled static mirrors produced by the mobile build (`build:www` / `cap sync`); they follow whatever `www/` contains and are not independent dependents.

- **`outreach-runner/`** is a self-contained subproject (own `package.json`/lockfile + own `outreach-engine-api.js` copy). No `netlify.toml`, root `package.json` script, or Procfile references it — deployment status unconfirmed; audit separately before deleting its copy.

---

## Section 3 — Environment Variables

No `.env.example`, `.env.local.example`, or `.env.sample` was found at the repo root. All environment variables are undocumented in the repo.

### Variables referenced in code

| Variable | Times referenced | Location examples |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 144 | All netlify functions via `utils.js` |
| `SUPABASE_URL` | 123 | All netlify functions via `utils.js` |
| `ADMIN_PASSWORD` | 108 | `admin.html`, `utils.js` |
| `NODE_ENV` | 80 | Multiple |
| `RESEND_API_KEY` | 71 | Email functions |
| `GOOGLE_PLACES_API_KEY` | 44 | `members.js`, `server.js` |
| `STRIPE_SECRET_KEY` | 39 | `create-bid-checkout.js`, `split-pay.js`, `stripe-connect-onboard.js`, etc. |
| `DEBUG` | 32 | Multiple |
| `ANTHROPIC_API_KEY` | 30 | Agent functions |
| `GEMINI_API_KEY` | 26 | AI functions |
| `TWILIO_AUTH_TOKEN` | 22 | SMS functions |
| `TWILIO_ACCOUNT_SID` | 20 | SMS functions |
| `FCM_SERVICE_ACCOUNT_JSON` | 17 | Push notification functions |
| `TWILIO_PHONE_NUMBER` | 15 | SMS functions |
| `BGC_API_TOKEN` | 15 | Background check functions |
| `MCC_FROM_EMAIL` | 14 | Email functions |
| `REPLIT_DEV_DOMAIN` | 13 | `server.js` |
| `GOOGLE_API_KEY` | 12 | AI/maps functions |
| `PRINTFUL_API_KEY` | 11 | Merch functions |
| `SUPABASE_ANON_KEY` | 10 | Client init |
| `BGC_LIVE_MODE` | 10 | Background check |
| `ADMIN_EMAIL` | 10 | Admin alerts |
| `INSTANTLY_API_KEY` | 8 | Outreach functions |
| `APOLLO_API_KEY` | 8 | `apollo-admin.js`, `apollo-discovery-scheduled.js` |
| `ANTHROPIC_API_KEY_MCC_FLEET` | 6 | Fleet agent |
| `TWILIO_VERIFY_SERVICE_SID` | 5 | 2FA SMS |
| `BGC_API_BASE` | 5 | Background check |
| `STRIPE_WEBHOOK_SECRET` | 4 | `stripe-connect-callback.js` |
| `RESEND_FROM_EMAIL` | 4 | Email functions |
| `REDDIT_USER_AGENT` | 4 | `social-adapter-reddit.js` |
| `GOOGLE_VISION_API_KEY` | 4 | OCR functions |
| `FACEBOOK_APP_SECRET` | 4 | `facebook-conversions-api.js` |
| `TWILIO_SIGNATURE_REQUIRED` | 4 | `twilio-sms-inbound.js` |
| `CHECKR_API_KEY` | 2 | Background check |
| `BGC_DEFAULT_REPORT_SKU` | 2 | Background check |
| `BGC_PUBLIC_FORM_BASE` | 2 | Background check |
| `VAPID_PUBLIC_KEY` | 1 | Push notification |
| `TWILIO_INBOUND_PUBLIC_URL` | 1 | `twilio-sms-inbound.js` |
| `SUPABASE_WEBHOOK_SECRET` | 1 | Webhook validation |
| `STRIPE_TEST_PUBLISHABLE_KEY` | 1 | `stripe-key.js` |
| `STRIPE_KEY_EXPIRY_ADMIN_EMAIL` | 1 | `stripe-key-expiry-admin.js` |
| `TWILIO_VERIFY_SERVICE_SID` | 5 | 2FA |
| `SQUARE_APP_SECRET` | 1 | `driver-api.js` |
| `SCHEDULER_API_KEY` | 1 | — |
| `RESEND_WEBHOOK_SECRET` | 1 | `outreach-resend-webhook.js` |
| `FACEBOOK_PIXEL_ID` | 1 | `fb-pixel.js` |
| `FACEBOOK_CAPI_TOKEN` | 1 | `facebook-conversions-api.js` |
| `DATABASE_URL` | 1 | `server.js` |
| `CLOVER_APP_SECRET` | 1 | Driver/POS functions |
| `CLOVER_APP_ID` | 1 | Driver/POS functions |
| `CHECKR_ENVIRONMENT` | 1 | Background check |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | 1 | — |
| `ADMIN_NOTIFICATION_EMAIL` | 1 | — |
| `ADMIN_ALERT_PHONE` | 1 | — |
| `ADMIN_ALERT_EMAIL` | 1 | — |
| `APP_URL` / `MCC_APP_URL` / `BASE_URL` / `PUBLIC_BASE_URL` / `URL` | 4–7 each | Multiple (overlapping purposes) |

> **Flag:** No `.env.example` exists. All 50+ required env vars are undocumented in the repo. A new engineer has no reference for what values are needed.

> **Flag:** `METADATA_SERVER_DETECTION`, `GCE_METADATA_IP`, `GCE_METADATA_HOST`, `DETECT_GCP_RETRIES`, `CLOUD_RUN_JOB`, `K_SERVICE`, `K_CONFIGURATION`, `GAE_SERVICE`, `GAE_MODULE_NAME`, `FUNCTION_TARGET`, `FUNCTION_NAME`, `CLOUDSDK_CONFIG`, `APPDATA`, `HOME`, `NO_PROXY`, `WS_NO_UTF_*`, `WS_NO_BUFFER_UTIL` — these are GCP / Cloud Run runtime metadata env vars injected by the Google Cloud SDK and are not application-level variables; they appear because of transitive deps (`@google-cloud/vision`).

---

## Section 4 — Supabase Client Surface

### Tables referenced in code (`.from()` calls)

All table names below were verified against `information_schema.tables` (production project `ifbyjxuaclwmadqbjcyp`).

#### Confirmed in production

`additional_work_requests`, `agent_actions`, `agent_events`, `bids`, `bulk_service_batches`, `bulk_service_items`, `care_plan_completions`, `care_plans`, `dream_car_matches`, `dream_car_searches`, `driver_locations`, `emergency_requests`, `engine_state`, `escrow_payments`, `fleet_members`, `fleet_vehicles`, `fleets`, `founder_commissions`, `household_members`, `households`, `inspection_reports`, `maintenance_packages`, `messages`, `notifications`, `opportunity_pipeline`, `outreach_activity_log`, `outreach_leads`, `outreach_messages`, `payments`, `plan_bids`, `pos_sessions`, `profiles`, `provider_invitations`, `provider_referrals`, `provider_reviews`, `provider_stats`, `provider_team_members`, `refunds`, `service_appointments`, `signed_agreements`, `slot_bookings`, `social_channels`, `social_leads`, `social_posts`, `split_participants`, `split_payments`, `team_members`, `urgent_updates`, `vehicle_photos`, `vehicle_recalls`, `vehicle_transfers`, `vehicles`

#### ⚠️ Ghost references — table referenced in code but does NOT exist in production

| Table name | Code files referencing it | Risk |
|---|---|---|
| `agent_smoke_runs` | `netlify/functions/agent-fleet-admin.js`, `netlify/functions/agent-smoke-shared.js` | Runtime `42P01` error when smoke runs execute |
| `concierge_jobs` | `netlify/functions/concierge-jobs-public.js`, `netlify/functions/member-job-tracking.js`, `netlify/functions/driver-api.js` | All concierge job queries fail |
| `concierge_job_drivers` | Same as above | All concierge job queries fail |
| `concierge_job_legs` | Same as above | All concierge job queries fail |
| `dream_car_criteria` | `netlify/functions/account-deletion-core.js`, `server.js` | Account deletion step errors silently |
| `driver_earnings` | `netlify/functions/driver-api.js`, `netlify/functions/driver-payouts-admin.js` | Driver earnings dashboard returns no data / errors |
| `driver_cashouts` | `netlify/functions/driver-api.js`, `netlify/functions/driver-payouts-admin.js` | Same |
| `driver_wallet_balances` | `netlify/functions/driver-payouts-admin.js`, `netlify/functions/driver-api.js` | Same |
| `employee_background_checks` | `netlify/functions/initiate-background-check.js`, `netlify/functions/bgc-admin.js`, `netlify/functions/background-check-webhook.js` | BGC initiation flow breaks |
| `live_service_areas` | `netlify/functions/survey-area-check.js` | Area check always errors |
| `outreach_pipeline` | `server.js` | Server-side query errors |
| `provider_alerts` | `netlify/functions/background-check-webhook.js`, `netlify/functions/bgc-send-reminders.js` | BGC alert delivery fails |
| `bulk_service_bids` | `providers.js` | Provider UI query errors |

> **Note on `users`:** The `.from('users')` pattern appears in `netlify/functions/node_modules/@supabase/postgrest-js` type definitions only — it is a library example, not application code. Not a ghost reference.

### Storage buckets referenced in code (`.from()` calls, not DB tables)

These are Supabase Storage bucket names: `avatars`, `vehicle-photos`, `package-photos`, `public-bucket`, `analytics-data`, `embeddings-prod`, `key-exchange-photos`, `provider-docs`, `provider-documents`, `vehicle-files`, `club-logos`, `club-products`, `team-photos`, `insurance-documents`, `report-evidence`. These resolve via the Storage API, not the database query API, so `.from()` is correct for them.

### RPC calls

#### Confirmed in production

| RPC | Status |
|---|---|
| `accept_team_invitation` | Exists |
| `agent_reconcile_spend` | Exists |
| `agent_try_spend` | Exists |
| `check_crm_duplicate` | Exists |
| `check_provider_suspension` | Exists |
| `get_followup_candidates` | Exists |
| `get_pending_invitations` | Exists |
| `get_provider_reviews_summary` | Exists |
| `get_provider_team` | Exists |
| `increment_engine_stat` | Exists |
| `increment_founder_commissions` | Exists |
| `is_provider_suspended` | Exists |
| `record_bid_pack_commission` | Exists |
| `record_platform_fee_commission` | Exists |
| `register_provider_referral` | Exists |
| `review_corrective_action` | Exists |
| `submit_corrective_action` | Exists |
| `upsert_bonus_reserve` | Exists |
| `upsert_platform_revenue` | Exists |
| `verify_admin_password` | Exists |

#### ⚠️ Ghost RPC references — called in code but NOT in production

| RPC | Called from | Note |
|---|---|---|
| `calculate_provider_compliance` | `netlify/functions/provider-admin.js` | Missing from prod |
| `create_provider_referral_codes` | Provider settings JS | Missing from prod |
| `increment_referral_uses` | Referral functions | Missing from prod |
| `member_approve_additional_work` | `members.js`, member UI | Missing from prod |
| `member_mark_payment_disputed` | `members.js`, payment flow | Missing from prod |
| `member_refund_payment_unable_to_start` | `members.js` | Missing from prod |
| `member_release_payment` | `members.js` | Missing from prod |
| `outreach_conversion_report` | `outreach-admin.js` | Missing from prod |
| `admin_edit_payment` | Admin payment UI | Missing from prod |
| `admin_delete_payment` | Admin payment UI | Missing from prod |
| `increment_provider_strikes` | Strike management | Missing from prod |

### Migrations

**Production applied:** 1 migration — `20250317` (`ai_ops_dispute_webhook`).

**Local migration files in `supabase/migrations/`:** 79 files, ranging from `20250317_ai_ops_dispute_webhook.sql` through `20260516d_driver_wallet.sql`.

**Unapplied local migrations:** 78 files (all files after the initial `20250317` set). These include schema additions for: Apollo integration, background checks, crowd funding, push notifications, SMS log, vehicle recalls AI columns, API keys, SaaS subscriptions, white-label tenants, outreach engine, agent fleet, BGC employee compliance, Facebook page connections, plan bids realtime, driver concierge jobs, bid credit grants, driver payouts, and driver wallet tables.

> This explains the ghost table references: the driver payouts tables (`driver_earnings`, `driver_cashouts`, `driver_wallet_balances`), `concierge_jobs`/`concierge_job_drivers`/`concierge_job_legs`, `employee_background_checks`, and others were defined in local migrations that have never been applied to production.

---

## Section 5 — Realtime Channels

| Channel name | Event | Table | Filter | File:line |
|---|---|---|---|---|
| `member-updates` | INSERT | `bids` | none | `members.js:472`, `members-core.js:550` |
| `member-updates` | INSERT | `messages` | `recipient_id=eq.{uid}` | `members.js:488`, `members-core.js:566` |
| `member-updates` | INSERT | `notifications` | `user_id=eq.{uid}` | `members.js:514`, `members-core.js:592` |
| `member-updates` | UPDATE | `maintenance_packages` | none | `members.js:525`, `members-core.js:603` |
| `member-updates` | INSERT | `upsell_requests` | `member_id=eq.{uid}` | `members.js:542`, `members-core.js:620` |
| `provider-updates` | INSERT | `maintenance_packages` | none | `providers.js:656` |
| `provider-updates` | UPDATE | `bids` | `provider_id=eq.{uid}` | `providers.js:670` |
| `provider-updates` | INSERT | `messages` | `recipient_id=eq.{uid}` | `providers.js:689` |
| `provider-updates` | INSERT | `notifications` | `user_id=eq.{uid}` | `providers.js:714` |
| `provider-updates` | INSERT | `provider_reviews` | `provider_id=eq.{uid}` | `providers.js:725` |
| `provider-updates` | UPDATE | `payments` | `provider_id=eq.{uid}` | `providers.js:737` |
| `member-care-plan-bids` | (not found in source) | `plan_bids` | — | `members-extras.js:784` (channel declared, table subscription inferred from var name) |
| `package-inserts-for-matching` | INSERT | `maintenance_packages` | none | `netlify/functions/agent-matchmaker.js:25123` |
| `outreach-engine-state` | UPDATE | `engine_state` | none | `netlify/functions/outreach-engine-core.js:1979` |
| `outreach-pipeline` | INSERT | `opportunity_pipeline` | none | `netlify/functions/outreach-engine-core.js:1987` |
| `concierge_job:{jobId}` | broadcast send | — | — | `members-extras.js:883` (broadcast, not postgres_changes) |

> **Note:** `member-updates` is subscribed to `bids` INSERT with no filter. This means any bid inserted for any package triggers the subscription; client-side code must filter. This is functional but broadcasts more events than necessary.

> **Note:** `members.js` and `members-core.js` both declare a channel named `member-updates` with identical subscriptions. If both scripts load on the same page, two simultaneous subscriptions exist on the same channel name.

---

## Section 6 — Stripe Connect Flows

### Connect account onboarding

**File:** `netlify/functions/stripe-connect-onboard.js`

- Method: POST
- Auth: Bearer JWT (Supabase)
- Creates Express account via `stripe.accounts.create({ type: 'express', capabilities: { transfers: { requested: true } }, ... })`
- Generates onboarding link via `stripe.accountLinks.create({ type: 'account_onboarding', ... })`
- Stores `stripe_connect_account_id` in `member_founder_profiles.stripe_connect_account_id`
- Founder-tier accounts only

**File:** `netlify/functions/stripe-connect-callback.js`

- Method: GET
- Handles OAuth return from Stripe Connect; sets `payout_method: 'stripe_connect'` in profile
- Verifies account status via `stripe.accounts.retrieve`

**File:** `netlify/functions/stripe-connect-status.js`

- Method: GET
- Returns current Connect account status (charges_enabled, payouts_enabled) for a given founder

### Payment intent creation

| File | Context | Params |
|---|---|---|
| `netlify/functions/split-pay.js` | Split payment per-participant | `amount: participant.amount_cents`, `currency: 'usd'`, `payment_method_types: ['card']`; creates or reuses existing PI via `stripe.paymentIntents.retrieve` |
| `netlify/functions/split-guest-pay.js` | Guest participant (unauthenticated) | `stripe.paymentIntents.create({ amount, currency: 'usd' })` |
| `netlify/functions/create-bid-checkout.js` | Bid credit pack purchase | Uses `stripe.checkout.sessions.create` (not payment intents); mode: `payment`; success redirect to `providers.html?purchase=success` |

### Transfers / payouts

- **Founder payouts:** `stripe-connect-onboard.js` sets up the Express account. Actual transfer mechanism is via `member_founder_profiles.stripe_connect_account_id`. Transfer execution lives in `agent-treasurer.js` (scheduled); references `stripe.transfers.create` for founder commission payouts.
- **Provider transfers:** Not found as a direct `stripe.transfers.create` call in provider payment flows. Payments are held in `payments` table with `status=held` and released via `member_release_payment` RPC (⚠️ ghost — not in prod) or the escrow flow (`escrow_payments` table).
- **Driver payouts:** `driver-payouts-admin.js` — admin-triggered, references `driver_earnings`, `driver_cashouts`, `driver_wallet_balances` tables, all of which are ⚠️ ghost (unapplied migrations).

### Tipping

No dedicated tip flow found. `stripeutils.js` at repo root exists but does not implement tipping. No `tip_amount` field on `payments` table.

### API version management

`lib/stripe-api-version.js` centralizes the Stripe API version string. Functions that use Stripe import `{ STRIPE_API_VERSION }` from this file.

---

## Section 7 — API Routes / Edge Functions

### Netlify Functions

91 JS files in `netlify/functions/`. Scheduled functions run via `netlify.toml` cron schedules.

#### HTTP-triggered functions

| Function | Method | Key request params | Response shape | External services |
|---|---|---|---|---|
| `accept-invitation.js` | POST | `invitationId` (path param) | `{ success, profile }` / error | Supabase |
| `admin-audit-log.js` | GET | `limit`, `offset`, `type` (query) | `{ logs[] }` | Supabase |
| `admin-facebook.js` | GET/POST | Action in path; `pageId`, `accessToken` | `{ success, data }` | Facebook Graph API |
| `admin-team.js` | GET/POST/DELETE | Action in path | `{ success, ... }` | Supabase |
| `agent-hunter.js` | GET/POST | Agent action triggers | `{ success }` | Supabase, Apollo, Resend |
| `agent-matchmaker.js` | GET/POST | Event-driven from `agent_events` | `{ success, action_id }` | Supabase, Anthropic |
| `ai-ops-admin.js` | GET/POST | Action in path (`/settings`, `/digest`, etc.) | `{ success, data }` | Supabase, Anthropic |
| `background-check-webhook.js` | POST | Checkr webhook body (event, data) | `200 OK` | Checkr, Supabase, Twilio |
| `bgc-admin.js` | GET | `provider_id` (query) | `{ provider, checks[] }` | Supabase |
| `bgc-config.js` | GET | — | `{ live_mode, api_base, sku }` | — |
| `bgc-decrypt-token.js` | POST | `token` | `{ decrypted }` | — |
| `create-bid-checkout.js` | POST | `{ packId, providerId }` (JSON body) | `{ url }` (Stripe Checkout URL) | Stripe, Supabase |
| `dispute-resolver-background.js` | POST | `dispute_id` | `{ resolved, outcome }` | Supabase, Anthropic |
| `driver-api.js` | GET/POST | Action in path (`/earnings`, `/cashout`, `/jobs`) | `{ success, data }` | Supabase, Stripe |
| `driver-payouts-admin.js` | GET/POST | Action in path | `{ success, data }` | Supabase, Stripe |
| `email-tracking.js` | POST | Resend webhook body | `200 OK` | Supabase |
| `facebook-conversions-api.js` | POST | `{ event_name, user_data, custom_data }` | `{ success }` | Facebook CAPI |
| `facebook-data-deletion.js` | POST | Signed Facebook request | `{ url, confirmation_code }` | Supabase |
| `helpdesk.js` | POST | `{ subject, message, category }` | `{ ticket_id }` | Supabase, Resend |
| `helpdesk-email.js` | POST | Inbound Resend webhook | `200 OK` | Supabase, Resend |
| `initiate-background-check.js` | POST | `{ provider_id, employee_id?, type }` | `{ invitation_url }` | Checkr, Supabase |
| `launch-broadcast-admin.js` | GET | — | `{ sent, errors }` | Supabase, Resend |
| `member-job-tracking.js` | GET | `job_id` (path param) | `{ job, legs[], drivers[] }` | Supabase |
| `notifications-bid-accepted-push.js` | POST | `{ bid_id }` | `{ sent }` | Supabase, FCM |
| `outreach-resend-webhook.js` | POST | Resend webhook body | `200 OK` | Supabase |
| `outreach-unsubscribe.js` | GET/POST | `email` or `token` | `200 OK` redirect | Supabase |
| `provider-admin.js` | GET/POST/DELETE | Action in path | `{ success, data }` | Supabase |
| `provider-application.js` | POST | Full application JSON body | `{ application_id }` | Supabase, Resend |
| `provider-application-review.js` | POST | `{ application_id, action, notes }` | `{ success }` | Supabase, Resend, Twilio |
| `provider-onboarding.js` | POST | `{ founder_id }` (path param) | `{ url }` (Stripe Connect link) | Stripe, Supabase |
| `referral-lookup.js` | GET | `code` (query) | `{ valid, founder_name }` | Supabase |
| `referral-process.js` | POST | `{ code, user_id }` | `{ success }` | Supabase |
| `sign-agreement.js` | POST | `{ provider_id, ein_last4, signature_data }` | `{ agreement_id }` | Supabase, PDFKit |
| `split-guest-confirm.js` | POST | `{ participant_id, payment_intent_id }` | `{ success }` | Supabase, Stripe |
| `split-guest-details.js` | POST | `{ participant_id }` | `{ package, amount, split }` | Supabase |
| `split-guest-pay.js` | POST | `{ participant_id }` | `{ client_secret }` | Stripe, Supabase |
| `split-pay.js` | POST | `participant_id` (path param) | `{ client_secret, paymentIntentId }` | Stripe, Supabase |
| `stripe-connect-callback.js` | GET | `code`, `state` (query) | redirect | Stripe, Supabase |
| `stripe-connect-onboard.js` | POST | `founder_id` (path param) | `{ url }` | Stripe, Supabase |
| `stripe-connect-status.js` | GET | `founder_id` (path param) | `{ charges_enabled, payouts_enabled }` | Stripe, Supabase |
| `stripe-key.js` | GET | — | `{ publishable_key }` | — |
| `survey-abandoned.js` | POST | `{ email, type, step }` | `{ id }` | Supabase |
| `survey-area-check.js` | GET | `zip` (query) | `{ served, city, state }` | Supabase (`live_service_areas` — ⚠️ ghost) |
| `survey-profile.js` | POST | Profile form JSON | `{ success }` | Supabase |
| `survey-referral-link.js` | POST | `{ founder_id }` | `{ url }` | Supabase |
| `survey-response.js` | POST | Full survey JSON | `{ success }` | Supabase, Resend |
| `twilio-sms-inbound.js` | POST | Twilio webhook body | TwiML response | Twilio, Supabase |
| `validate-invitation.js` | GET | `token` (query) | `{ valid, invitation }` | Supabase |
| `wefunder-blast-scheduled.js` (also HTTP) | GET | — | `{ sent }` | Supabase, Resend |

#### Scheduled / background functions (cron)

| Function | Schedule | Purpose |
|---|---|---|
| `outreach-cycle.js` | `*/15 * * * *` | Send outreach messages |
| `outreach-followups.js` | `0 */6 * * *` | Followup cadence |
| `outreach-cleanup.js` | `0 0 * * 0` | Prune stale leads |
| `payment-tracker-scheduled.js` | `0 3 * * *` | Payment anomaly scan |
| `daily-digest-scheduled.js` | `0 1 * * *` | AI digest email |
| `apollo-discovery-scheduled.js` | `0 */6 * * *` | Apollo lead import |
| `wefunder-blast-scheduled.js` | `0 2 * * 0` | Wefunder investor email |
| `agent-orchestrator.js` | `* * * * *` | Agent event bus router |
| `agent-analyst.js` | `0 5 * * *` | Analytics agent |
| `agent-cron-emitter.js` | `0 5 * * *` | Nightly tick emitter |
| `bgc-expiration-sweep.js` | `0 6 * * *` | BGC expiry check |
| `bgc-send-reminders.js` | `0 13 * * *` | BGC reminder emails |
| `social-monitor-scheduled.js` | `*/15 * * * *` | Social lead monitor |
| `gatekeeper-smoke-scheduled.js` | `0 9 * * *` | Pipeline smoke test |
| `matchmaker-smoke-scheduled.js` | `15 9 * * *` | Matchmaker smoke |
| `treasurer-smoke-scheduled.js` | `30 9 * * *` | Treasurer smoke |
| `anthropic-health-scheduled.js` | `0 4 * * *` | Anthropic model health |
| `agent-director-scheduled.js` | `*/15 * * * *` | Acquisition director |
| `agent-fleet-admin.js` | background | Fleet management |
| `agent-fleet-runtime.js` | background | Fleet runtime |
| `agent-gatekeeper.js` | background | Event gatekeeper |
| `agent-hunter.js` | background | Lead hunter |
| `agent-matchmaker.js` | background | Bid matchmaker |
| `agent-promoter.js` | background | Promoter agent |
| `agent-treasurer.js` | background | Payment/payout agent |
| `concierge-push-notifier-scheduled.js` | background | Push notifications |
| `outreach-cycle-background.js` | background | Background outreach |
| `outreach-followups-background.js` | background | Background followups |
| `outreach-ref.js` | background | Referral outreach |
| `apollo-admin.js` | background | Apollo admin |
| `api-key-expiry-admin.js` | background | API key expiry admin |
| `api-key-expiry-scheduled.js` | background | API key expiry scan |
| `stripe-key-expiry-admin.js` | background | Stripe key expiry admin |
| `stripe-key-expiry-scheduled.js` | background | Stripe key expiry scan |
| `concierge-jobs-admin.js` | background | Concierge job admin |
| `concierge-jobs-public.js` | background | Concierge job public |

### Client-side `fetch()` callers (selected)

The following API endpoints are called from `members.js`, `members-core.js`, `providers.js`, and `providers-bids.js`:

`/api/provider/packages`, `/api/ai/bid-strategy`, `/api/bids`, `/api/create-bid-checkout-mobile`, `/api/provider/bid-insights`, `/api/provider/category-price-advice`, `/api/provider/bid-price-signal`, `/api/ai/draft-bid`, `/api/auth/check-access`, `/api/account/delete`, `/api/car-club/browse`, `/api/recalls/{id}/acknowledge`, `/api/registration/verify`, `/api/registration/verifications`, `/api/member/{id}/service-history`, `/api/member/{id}/service-history/export`, `/api/member/{id}/qr-token`, `/api/vehicles/{id}/compute-health`, `/api/vehicles/{id}/maintenance-forecast`, `/api/obd/scans/{id}`, `/api/member/{id}/notification-preferences`, `/api/push/vapid-key`, `/api/push/subscribe`, `/api/push/unsubscribe`

---

## Section 8 — TODOs / FIXMEs / HACKs

The following are from application source files (node_modules excluded):

| File | Line | Comment |
|---|---|---|
| `netlify/functions/social-adapters.js` | 80 | `// TODO: real API call. Until then we still mock — flip back to real` |

> All other TODO/FIXME patterns found by grep were inside bundled third-party library code (`pdfkit` cmap handler stubs, `@google/genai` internal, `@supabase/postgrest-js` type examples). No other application-level TODOs were found.

---

## Section 9 — Test Coverage

### Test files

All test files are Playwright-based (`@playwright/test`) located in `/Users/jordanzanetis/mycarconcierge/tests/`. There is also `tests/ai-features.e2e.js` (raw Node, non-Playwright) and `tests/helpers.js`.

| File | Coverage area |
|---|---|
| `accessibility.spec.js` | ARIA, keyboard navigation, screen reader labels |
| `admin-api.spec.js` | Admin API route auth guards |
| `admin-application-outreach-lead.spec.js` | Admin: provider application + outreach lead link |
| `admin-application-outreach-lead-real-data.spec.js` | Same, with real DB fixture |
| `admin-crm.spec.js` | Admin CRM view |
| `admin-marketing-hub.spec.js` | Admin marketing hub UI |
| `admin-matchmaker-apply.spec.js` | Admin matchmaker apply flow |
| `admin-outreach-engine.spec.js` | Outreach engine admin controls |
| `admin-portal.spec.js` | Admin portal auth + routes |
| `admin-referrals.spec.js` | Admin referral management |
| `admin-team-management.spec.js` | Admin team invite / revoke |
| `agent-activity-actions.spec.js` | Agent action drawer interactions |
| `agent-activity-drawer.spec.js` | Agent activity drawer UI |
| `agent-matchmaker.spec.js` | Matchmaker agent logic |
| `agent-prompt-diff.spec.js` | Agent prompt version diff |
| `agreement-form.spec.js` | Provider agreement signing form |
| `ai-features.e2e.js` | AI feature end-to-end (Node test runner) |
| `ai-helpdesk.spec.js` | AI helpdesk chat widget |
| `ai-obd-helpdesk.spec.js` | OBD / diagnostic AI helpdesk |
| `api-fallback-audit.spec.js` | API route fallback / error handling |
| `apple-signin-provider.spec.js` | Apple Sign-In (provider) |
| `auth-reset-fleet.spec.js` | Auth: password reset + fleet |
| `authentication.spec.js` | Auth: login, signup, session |
| `background-check-badge.spec.js` | BGC badge UI states |
| `bgc-alerts-banner.spec.js` | BGC alerts banner |
| `bgc-state-card.spec.js` | BGC state card UI |
| `bgc-state-card-ar-mobile.spec.js` | BGC state card Arabic/mobile |
| `bgc-state-card-es-mobile.spec.js` | BGC state card Spanish/mobile |
| `bid-checkout.spec.js` | Bid credit pack checkout |
| `car-club.spec.js` | Car club feature |
| `car-club-enhancements.spec.js` | Car club enhancements |
| `care-plan-payment-journey.spec.js` | Care plan: member payment flow |
| `care-plan-provider-journey.spec.js` | Care plan: provider bid + completion |
| `chat-widget.spec.js` | Chat widget |
| `club-merch-store.spec.js` | Merch store |
| `commission-payouts.spec.js` | Founder commission payouts |
| `cross-browser.spec.js` | Cross-browser rendering |
| `crowd-funding.spec.js` | Crowd-funded service requests |
| `dream-car-finder.spec.js` | Dream car finder feature |
| `e2e-flows.spec.js` | General end-to-end user flows |
| `email-verification.spec.js` | Email verification |
| `emergency-dispatch.spec.js` | Emergency request dispatch |
| `error-handling.spec.js` | Error states and retry logic |
| `facebook-signin.spec.js` | Facebook Sign-In (member) |
| `facebook-signin-provider.spec.js` | Facebook Sign-In (provider) |
| `form-validation.spec.js` | Form field validation |
| `founder-commission-rate-db-driven.spec.js` | Commission rate DB integration |
| `founders.spec.js` | Founder portal |
| `functional-flows.spec.js` | Core functional flows |
| `gatekeeper-smoke.spec.js` | Agent gatekeeper smoke |
| `insurance-ocr.spec.js` | Insurance card OCR |
| `integration-services.spec.js` | Third-party integrations (Checkr, Twilio) |
| `live-smoke.spec.js` | Live environment smoke tests |
| `mcc-icons.spec.js` | Icon rendering |
| `member-bid-payment.spec.js` | Member bid acceptance + payment |
| `member-dashboard.spec.js` | Member dashboard |
| `member-extras.spec.js` | Member extras (vehicle history, etc.) |
| `member-onboarding.spec.js` | Member onboarding flow |
| `member-settings.spec.js` | Member settings page |
| `merch-shop.spec.js` | Merch shop |
| `multi-language.spec.js` | i18n / language switching |
| `nonempty-data.spec.js` | Non-empty data assertions |
| `obd-scanner.spec.js` | OBD scanner feature |
| `offline-loading.spec.js` | Offline / PWA loading states |
| `onboarding-api.spec.js` | Onboarding API |
| `outreach-engine-paused-digest.spec.js` | Outreach engine paused state |
| `payment-system.spec.js` | Payment flow |
| `payment-timers.spec.js` | Auto-release timers |
| `payments-escrow.spec.js` | Escrow hold/release |
| `performance.spec.js` | Page load performance |
| `platform-features.spec.js` | Platform-wide features |
| `pos-integration.spec.js` | POS (point-of-sale) integration |
| `provider-analytics.spec.js` | Provider analytics |
| `provider-availability.spec.js` | Provider availability/hours |
| `provider-dashboard.spec.js` | Provider dashboard |
| `provider-features.spec.js` | Provider feature set |
| `provider-onboarding.spec.js` | Provider application flow |
| `provider-portal-es-mobile.spec.js` | Provider portal Spanish/mobile |
| `provider-ratings.spec.js` | Provider rating system |
| `provider-settings.spec.js` | Provider settings |
| `public-pages.spec.js` | Public-facing pages |
| `rate-limiting.spec.js` | Rate limiting behavior |
| `service-bidding.spec.js` | Service request bidding |
| `split-payments.spec.js` | Split payment flow |
| `survey-api.spec.js` | Survey API |
| `ux-improvements.spec.js` | UX improvements |
| `vehicle-management.spec.js` | Vehicle CRUD |

### Flows with no test coverage

- **Twilio inbound SMS handler** (`twilio-sms-inbound.js`) — no spec exercises this webhook directly.
- **Stripe Connect Express account creation** (`stripe-connect-onboard.js`) — not covered by any spec; only connection status UI is tested.
- **Checkr webhook** (`background-check-webhook.js`) — no spec exercises this webhook.
- **Account deletion** (`account-deletion-core.js`) — no dedicated spec.
- **Outreach unsubscribe** (`outreach-unsubscribe.js`) — no dedicated spec.
- **Facebook data deletion** (`facebook-data-deletion.js`) — no spec.
- **RLS policies** — none of the tests verify RLS enforcement; `rls_enabled = false` on most tables (see Section 4).
- **Driver concierge job flows** — specs exist but all underlying tables are ghost (unapplied migrations), so tests would hit schema errors.

---

## Section 10 — SonarQube

`sonar-project.properties` exists at repo root with content:

```
sonar.python.version=3.11
```

This is a minimal stub — only `sonar.python.version` is set. There is no `sonar.projectKey`, `sonar.sources`, `sonar.language`, `sonar.host.url`, or any JS-specific config. The file appears to be a placeholder and does not configure SonarQube analysis for this JavaScript project.
