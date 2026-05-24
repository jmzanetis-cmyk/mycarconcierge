# API Fallback Audit (Task #229)

Sweep of `www/server.js` for the "graceful fallback" anti-pattern that
catches every database error and returns a 200 / empty payload — the
exact silent-failure shape Tasks #166 and #168 hardened on the survey
routes.

Methodology: ripgrepped every `} catch (` block within ~8 lines of a
`res.writeHead(200` or `JSON.stringify(...empty...)` response, then
read each handler in context to decide whether the broad fallback
masks real bugs. "Tightened" handlers now ONLY fall back on a known
benign Postgres code (`42P01` table-missing, `42703` column-missing,
`PGRST204` schema-cache, `PGRST116` no-rows) and 500 with
`{error, code, detail}` on anything else.

## High risk — TIGHTENED

| Route | Old behavior | New behavior |
|---|---|---|
| `GET /api/saas/shop-status` | Any error → `plan:'none'`, status:'none' (paid customer silently downgraded, loses feature_access) | `42P01` → benign no-plan fallback with `fallback:true,reason`; everything else → 500 with `code`+`detail` |
| `GET /api/shop/onboarding-status` | Any error → `{steps:{}}` (shop owner sees blank checklist, can never finish onboarding) | `42P01` → empty steps with `fallback:true,reason`; everything else → 500 with `code`+`detail` |
| `GET /api/founder/campaign-link-stats` | Any error → all-zero analytics (founder sees stale "0 clicks" dashboard while real data exists) | `42P01` → zeros with `fallback:true,reason`; everything else → 500 |
| `GET /api/provider/marketplace-visibility` | Any error → `marketplace_visible:true` (provider who hid themselves silently re-listed when column drift / RLS denial) | `42P01` / `42703` / `PGRST204` → legacy default with `fallback:true,reason`; everything else → 500. `PGRST116` (no row) handled inline. |
| `GET /api/shop/walkin-search` | Any error → `{found:false}` (provider re-creates duplicate of customer that exists but couldn't be fetched) | `42P01` → benign empty fallback; everything else → 500 |
| `GET /api/white-label/tenant` | Any error → `tenant:null,is_white_label:false` (paid white-label customer silently sees vanilla MCC branding) | `42P01` → null tenant with `fallback:true,reason`; everything else → 500 with `Cache-Control: no-store` so a bad cache can't pin the wrong tenant to a domain |

All six now follow the same shape Task #168 established for
`POST /api/member/survey` and `GET /api/admin/survey-analytics`.

## Medium risk — DOCUMENTED, NOT CHANGED

| Route | Why the broad fallback is acceptable |
|---|---|
| `GET /api/saas/plans` (line ~41916) | Falls back to the bundled `SAAS_PLANS` config constant — the response is functionally identical to the happy path, with `source:'config'` indicating the DB read failed. No silent data loss. |
| `GET /api/founder/campaign-stats` (line ~38682) | Scrapes wefunder.com (external HTTP, not a DB call). Cache-then-stub fallback is intentional so the marketing page never blanks out when the external scrape fails; `error:true` in payload signals the degraded state. |
| `GET /api/founder/campaign-stats` second copy (line ~39469) | Same external-scrape reasoning as above. |

## Low risk / intentional — DOCUMENTED, NOT CHANGED

| Route | Why 200-on-error is correct |
|---|---|
| `POST /api/sms/incoming` (Twilio webhook, line ~34316) | Twilio retries any non-2xx for up to 24h. Returning empty TwiML on internal error is the documented Twilio pattern; the error is logged for triage. |
| AI fallback paths (lines ~41298, ~41313, ~47124, ~47244, ~49748, ~50127, ~50231) | These catch AI-provider failures (Anthropic/OpenAI/Gemini) and fall back to deterministic logic. They are not DB-error swallows. |
| `} catch (creditErr)` in Stripe webhook bid-credits (line ~10821) | ~~Returning 200 to Stripe is required so Stripe doesn't retry the whole webhook (which would re-process the payment). The credit-add failure is logged.~~ **Resolved in Task #394.** The bid-credit grant logic was extracted to `lib/bid-credit-grants.js`; on any DB failure it now (a) returns `{ok:false}` so the webhook emits a 5xx and Stripe retries the event under its idempotency key (Stripe charges are not re-processed — only the webhook is re-delivered, and the `bid_credit_grants(transaction_id)` unique constraint guarantees credits aren't double-granted), and (b) writes an escalated `ai_action_log` row (`module='bid_credit_grant_failure'`) so admins are alerted. Safety net: `netlify/functions/bid-credit-reconciler-scheduled.js` runs daily at 03:30 UTC, lists Stripe Checkout Sessions completed in the last 7 days with `metadata.bids`, cross-checks `bid_credit_grants`, and emails admin (`bid_credit_grant_missing`) for any session paid ≥ 1h ago without a grant row. Regression coverage: `netlify/functions-tests/bid-credit-grant.test.js` (12 tests). |
| Best-effort logging blocks (account-deletion email, check-in SMS, POS member-lookup SMS, etc.) | These are non-fatal post-success notifications. The primary write succeeded; a failed notification correctly does not roll back the user-visible action. |

## Regression test

`tests/api-fallback-audit.spec.js` exercises the tightened handlers
through the same `maybeWrapSupabaseForApiTest` seam introduced in
Task #228. The seam was generalised in Task #229 to support arbitrary
target tables via the new `x-test-supabase-table-error` header (format
`<table>:<code>[,<table>:<code>]…`), so future audit fixes can pin
their error shape with one line per case.

## How to run

```bash
SURVEY_TEST_HOOK_SECRET=local-test-secret \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
PROVIDER_TEST_EMAIL=... PROVIDER_TEST_PASSWORD=... \
MEMBER_TEST_EMAIL=... MEMBER_TEST_PASSWORD=... \
npx playwright test tests/api-fallback-audit.spec.js
```

(Env-var names match `tests/helpers.js` — the helper exports
`TEST_PROVIDER_EMAIL` / `TEST_MEMBER_EMAIL` constants but reads them
from `PROVIDER_TEST_EMAIL` / `MEMBER_TEST_EMAIL` for backward compat
with the rest of the test suite.)

Tests auto-skip when the seam secret or test credentials aren't set,
so CI without those vars stays green.
