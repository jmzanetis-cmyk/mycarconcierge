# API Route Coverage Audit (Task #352)

Sequel to Task #257 (member POST `/api/care-plans/:id/dispute-response`
silently 404'd in production because the prod redirect was missing).
Task #450 already added the **dev→prod** parity check
(`netlify/functions-tests/api-route-parity.test.js` +
`_dev-only-api-routes.json`): every route handled in `www/server.js`
must either be ported to a Netlify function with a `www/_redirects`
rule, or explicitly grandfathered.

This audit covers the **client→handler** direction the parity test
does not: every `fetch('/api/...')` URL called from `www/*.js` and
`www/*.html` was checked against:

1. A matching rule in `www/_redirects` (→ routed to a Netlify
   function in production), **OR**
2. A handler in `www/server.js` (handles it in the Replit dev
   environment, even if production 404s — covered by the existing
   `_dev-only-api-routes.json` allowlist), **OR**
3. An external URL (e.g. `https://api.apollo.io/api/v1/...`,
   `https://api.nhtsa.gov/...`) — not an internal call.

## Methodology

```
# 1. Collect every /api/... URL referenced from www/ JS + HTML
#    (excluding www/.netlify-deploy/ build artifacts, www/stress-test-*.js,
#    *.test.js / *.spec.js, and comment lines).
rg -oNI -e '/api/[A-Za-z0-9_./$:{}-]+' www/ \
   -g '!*.netlify-deploy/**' -g '!stress-test-*.js' \
   -g '!*.test.js' -g '!*.spec.js'

# 2. For each URL, normalize template literals (${...}, {x}, :foo)
#    to a wildcard segment, then check:
#    - matches an /api/... source pattern in www/_redirects, or
#    - has a literal handler in www/server.js
#      (req.url === / startsWith / .match(/.../) / req.url.split(...))
```

## Findings

**611 distinct caller URLs** (after normalizing template params).
**11 endpoint families** are called from production-shipped client
JS but have **no handler in `www/server.js` AND no `_redirects`
rule** — they 404 silently in *both* dev and prod and the existing
`.catch(() => {})` swallows the failure, exactly the Task #257 shape.
Follow-up tasks **#455** (Stripe/payments cluster: families 1, 4, 5,
6, 9) and **#456** (feature cluster: families 2, 3, 7, 8, 10, 11)
track the remediation; **#457** tracks codifying this audit as a CI
test so the next dead caller is caught before users are.

| # | Endpoint family | Caller(s) | Feature impact |
|---|---|---|---|
| 1 | `POST /api/apple-pay/validate`, `POST /api/apple-pay/process` | `www/mobile-pay.js:140,156` | Apple Pay merchant validation + payment processing. Apple Pay buttons silently fail. |
| 2 | `GET /api/appointments/:apptId/ical` | `www/members-packages.js:2485`, `www/providers-jobs.js:1833` | "Add to calendar" download from member + provider appointment cards returns the SPA shell instead of a .ics file. |
| 3 | `GET /api/care-plans/mine` | `www/members-care-plans.js:149` | Member-side care-plans tab fetches the user's own plans. The `.catch` swallows the 404 so the tab silently renders empty. |
| 4 | `POST /api/connect/create-account`, `POST /api/connect/onboarding-link`, `POST /api/connect/transfer` | `www/stripeutils.js:216,232,247` | Stripe Connect onboarding helper functions (separate from the routed `/api/stripe/connect/*` family). Dead code path — confirm whether any caller still invokes `createStripeConnectAccount()` / `transferToProvider()` and either route them in prod or delete. |
| 5 | `POST /api/create-bid-checkout-mobile` | `www/providers.js:5371`, `www/providers-bids.js:1129` | Provider in-app bid checkout on iOS/Android (the routed `/api/create-bid-checkout` is the web variant). Native bid-pack purchase 404s. |
| 6 | `POST /api/escrow/create-with-payment-method` | `www/stripeutils.js:442`, `www/members-packages.js:3810,3869` | Member pays a care-plan escrow with a saved card. Web-based "Pay with saved card" 404s. |
| 7 | `GET /api/obd/scans/:vehicleId` | `www/members.js:7819` | Member vehicle OBD scan history list. Returns empty in prod. |
| 8 | `POST /api/package/ai-suggestions` (singular, note: `/api/packages/...` family IS handled separately) | `www/members-packages.js:85` | AI package-builder suggestions on the member "create package" flow. |
| 9 | `POST /api/payments/save-method`, `GET /api/payments/methods` | `www/stripeutils.js:313,327` | Saved-payment-method list/save helpers (separate from Stripe Connect). |
| 10 | `GET /api/review-summary/:providerId`, `POST /api/review-summary` | `www/supabaseclient.js:1035,1049` | AI review-summary helper. Provider profile review summaries silently empty. |
| 11 | `POST /api/tracking/update` | `www/providers-jobs.js:420` | Provider "I'm on the way" live location ping for member ETA updates. Pings silently dropped. |

These are the **caller-side complement** of the `_dev-only-api-routes.json`
allow-list: each one represents a client surface that calls a server
endpoint nobody implemented (or that was deleted by Task #208's prod
shadow-tree removal and never re-added on the client).

## False positives the audit excluded

The same grep flagged ~140 additional URLs that are NOT silently broken:

- **External APIs**: `https://api.apollo.io/api/v1/*`,
  `https://api.nhtsa.gov/recalls/*`,
  `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/...`,
  `https://maps.googleapis.com/maps/api/js`,
  `https://hostname/api/v2/connection` (Replit connectors API) —
  these are full HTTPS URLs that happen to contain `/api/` in the
  path; not internal calls.
- **Documentation strings**: `www/developers.html` lists the
  Automotive AI API endpoints (`/api/v1/vin/{vin}`, etc.) as text
  for developers, not as actual fetches.
- **Routes with dev handlers using regex routing**: e.g.
  `/api/packages/:id/ai-mediation`,
  `/api/packages/:id/share-with-car-club`,
  `/api/care-plans/:id/complete`,
  `/api/checkin/:sessionId/lookup`,
  every `/api/car-club/*` route, every `/api/checkin/*` route,
  every `/api/pos/session/*` route, etc. These ARE handled in
  `www/server.js` via `req.url.match(/^\/api\/.../)` patterns and
  are already covered by `_dev-only-api-routes.json` prefix entries.

## Next steps

Each of the 12 broken families needs its own remediation decision:
**port to a Netlify function + add `_redirects` rule**, **delete the
dead client caller**, or **explicitly grandfather** in
`_dev-only-api-routes.json` if the dev-server route is intentionally
coming later. Follow-up tasks track them.

## Re-running this audit

```bash
node netlify/functions-tests/api-route-parity.test.js
# (existing — covers dev→prod direction)

# For the client→handler direction (this audit), the methodology
# section above is the canonical recipe. A future task may codify it
# into a sibling parity test that grandfathers the 12 families above
# into a _broken-client-callers.json allow-list, then fails the build
# when a NEW caller URL is added without a handler.
```
