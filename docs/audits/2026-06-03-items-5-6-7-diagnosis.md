# Audit: Items 5, 6, 7 — Diagnosis Only (2026-06-03)

No fixes applied. All three items parked for future sessions.

---

## ⚠️ URGENT NOTE — Item 6

ADMIN_PASSWORD is confirmed live and authenticating in production. 29 Netlify function files still validate the `x-admin-password` header against `process.env.ADMIN_PASSWORD`. These are reachable from deployed routes. See Item 6 for full scope.

---

## Item 5 — agent-fleet 500 errors

### Root Cause

**PRIMARY — `utils.authenticateBearerAdmin()` has no error guard on the profiles lookup (`utils.js:60`):**

```js
var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single();
var profile = profileResult.data;          // profileResult.error is never checked
if (!profile || profile.role !== 'admin') return null;
```

If `.single()` returns an error (no matching row, RLS blocks it, transient DB issue), `profileResult.error` is non-null but ignored. If the Supabase client itself throws, the exception escapes uncaught because the caller (`agent-fleet-admin.js:2901`) calls it raw with no try/catch — Netlify catches the unhandled rejection and returns 500.

**SECONDARY — `agent-fleet-admin.js:1752` still sends `x-admin-password` for internal service-to-service calls** to downstream functions (e.g. calling `agent-fleet-runtime`). Not the 500 source, but means outbound internal calls depend on the old password even though this function's own incoming auth is already on Bearer JWT.

### Affected Routes

All 31 routes share the same dispatcher and auth preamble — the 500 affects every route whenever the profiles lookup fails. Most commonly hit:

| Method | Route |
|--------|-------|
| GET | `/api/admin/agent-fleet/actions` |
| GET | `/api/admin/agent-fleet/briefing` |
| GET | `/api/admin/agent-fleet/stats/24h` |
| POST | `/api/admin/agent-fleet/actions/:id/apply` |
| GET/POST | `/api/admin/agent-fleet/social/*` |
| GET/PUT | `/api/admin/agent-fleet/director/*` |

### Severity

**High.** Entire agent-fleet admin panel is intermittently inaccessible. Any transient Supabase hiccup on the profiles table returns 500 instead of a clean 401. Matchmaker bid awards and Treasurer payment operations blocked during these windows.

### Proposed Fix — DO NOT APPLY

**Fix 1 — Guard the profiles lookup in `utils.js` (~line 60):**
```js
var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single();
if (profileResult.error) {
  console.error('[utils] admin profile lookup failed:', profileResult.error.message);
  return null;  // surface as 401, not unhandled throw
}
var profile = profileResult.data;
if (!profile || profile.role !== 'admin') return null;
return user;
```

**Fix 2 — Wrap auth call in agent-fleet-admin.js dispatcher (~line 2901):**
```js
let admin;
try {
  admin = await utils.authenticateBearerAdmin(event, supabase);
} catch (e) {
  console.error('[agent-fleet-admin] auth middleware threw:', e.message);
  return jsonResponse(500, { error: 'Auth service unavailable' });
}
if (!admin) return jsonResponse(401, { error: 'Unauthorized' });
```

Fix 1 is the correct root-cause fix; Fix 2 is defensive belt-and-suspenders. Both are one-liners.

---

## Item 6 — ADMIN_PASSWORD admin-access modal

### Is the modal live in deployed code?

**Yes. Live and functional — but the password verification step is broken.**

`www/admin.js:713` calls `showModalState('password')` when an authenticated admin user loads the page. The modal renders, the user types a password and clicks Continue. `verifyAdminPassword()` (line 830) then calls:

```js
const { data, error } = await supabaseClient.rpc('verify_admin_password', { input_password: password });
```

`verify_admin_password` **does not exist as a Supabase RPC** — no migration defines it, no Netlify function implements it. The call returns an error, the admin is stuck on the modal, and the dashboard is inaccessible via the UI.

### ADMIN_PASSWORD scope across the repo

30 Netlify function files reference `ADMIN_PASSWORD` or the `x-admin-password` header:

```
admin-api-usage.js, admin-audit-log.js, admin-chat-insights.js,
admin-facebook.js, admin-founders.js, admin-printful.js,
admin-white-label.js, agent-fleet-admin.js*, agent-fleet-runtime.js,
agent-gatekeeper.js, agent-orchestrator.js, agent-treasurer.js,
ai-ops-admin.js, anthropic-health-scheduled.js, api-key-expiry-admin.js,
apollo-admin.js, bgc-admin.js, concierge-jobs-admin.js,
concierge-push-notifier-scheduled.js, driver-payouts-admin.js,
gatekeeper-smoke-core.js, gatekeeper-smoke-scheduled.js,
initiate-driver-bgc.js, integration-health-scheduled.js,
launch-broadcast-admin.js, matchmaker-smoke-scheduled.js,
provider-application-review.js, social-monitor-scheduled.js,
treasurer-smoke-scheduled.js, utils.js
```

`*` `agent-fleet-admin.js` uses ADMIN_PASSWORD only for **outbound** calls to other functions (line 1752) — its own **incoming** auth is already on Bearer JWT via `utils.authenticateBearerAdmin()`. All others validate `x-admin-password` on **incoming** requests (29 functions).

`utils.js:53` comment: "Used by admin Netlify functions that have **migrated off** the static ADMIN_PASSWORD" — confirming Bearer JWT is the target pattern but most functions haven't switched yet.

### Security Assessment

**Not a new regression — but the migration is incomplete and the UI gate is broken.**

- Static password still guards 29 function files for incoming requests. Same posture as before migration started — no new exposure introduced.
- An attacker who knows `ADMIN_PASSWORD` can call any of these 29 endpoints directly via `x-admin-password` header, bypassing the broken UI. This was always true; migration was meant to close it.
- UI breakage (RPC missing) is a functional blocker for admins, not a new attack surface.

### Proposed Fix — DO NOT APPLY

**Option A — Complete the JWT migration (recommended, multi-step):**
1. Replace every `authenticateAdmin()` in the 29 legacy functions with `utils.authenticateBearerAdmin()` (already used in `agent-fleet-admin.js`, `admin-data.js`, `admin-team.js`).
2. Remove the password modal from `admin.js` — admin access gates on Supabase session + `profiles.role = 'admin'`, no second factor needed.
3. Remove `ADMIN_PASSWORD` from env vars once all functions are migrated.

**Option B — Quick unblock (restores working state without completing migration):**
Add a `verify-admin-password` Netlify function that validates the submitted password against `process.env.ADMIN_PASSWORD` and returns `{ valid: true/false }`, then update `admin.js:847` to `fetch('/api/admin/verify-password', ...)` instead of the non-existent RPC. Unblocks admins today without touching the 29 legacy functions. Technical debt.

Jordan's decision: Option A is the right path, Option B is the fallback. Parking for a dedicated migration session.

---

## Item 7 — console 404/401 catalog

### The 5 Known Errors

| Endpoint | File:Line | Feature | UI on failure | Bucket | Notes |
|----------|-----------|---------|---------------|--------|-------|
| `/api/config` | `www/mcc-config.js:76` | Global MCC config object | Falls back to hardcoded defaults; invisible to user | **C — Ignore** | `.catch()` logs "Using default config" and continues. Correct fail-silent. |
| `/api/white-label/config` | `www/white-label-client.js:108` | White-label tenant branding | Returns null; page renders without tenant overrides | **C — Ignore** | Line 113: `r.ok ? r.json() : null`. Non-white-label domains always 404 here by design. |
| `/api/vehicle/{id}/predictions` | `www/members-core.js:781` | AI maintenance forecast card | Shows "Analyzing vehicle data…" placeholder; no error shown | **B — endpoint missing** | Real UI element with auth header. Try-catch returns null cleanly. Endpoint planned, never deployed. |
| `/api/member/onboarding` | `www/members.html:8400` | Onboarding checklist | Falls back to local vehicle/package count check; onboarding UI still renders | **C — Ignore** | Catch at line 8428 handles failure with local fallback. Works without endpoint. |
| `/api/vehicle/{id}/recalls` | `www/members-vehicles.js:11` | NHTSA recall modal | Modal opens, shows "Loading recalls…" then stays blank — silent failure | **Bug — header mismatch** | Redirect exists (`_redirects:169`), function exists (`vehicle-recalls.js`), auth implemented — but `members-vehicles.js:11` sends **no `Authorization` header** while `vehicle-recalls.js:23-26` requires Bearer token. One-line fix: add auth header to the fetch call. |

### Additional Endpoints from Sweep

| Endpoint | File:Line | Feature | UI on failure | Bucket | Notes |
|----------|-----------|---------|---------------|--------|-------|
| `/api/vehicle/{id}/predictions/invalidate` | `www/members-core.js:885` | Prediction cache bust | Silent fail | **B** | Paired with predictions; both missing together |
| `/api/care-plans/mine` | `www/members-care-plans.js:149` | Care Plans section list | "Failed to load care plans" **visible error** | **B** | Full UI section, never deployed |
| `/api/care-plans/{id}` | `www/members-care-plans.js:238` | Care plan detail modal | Error in modal | **B** | |
| `/api/care-plans/{id}/accept-bid` | `www/members-care-plans.js:446` | Accept bid button | POST fails with exception | **B** | |
| `/api/care-plans/{id}/complete` | `www/members-care-plans.js:672` | Mark complete button | POST fails with exception | **B** | |
| `/api/care-plans/{id}/dispute` | `www/members-care-plans.js:745` | Dispute button | POST fails with exception | **B** | |
| `/api/saas/plans` | `www/members.html:8663` | SaaS subscription plan list | "Failed to load plans" **visible error** | **B** | Stripe checkout flow, never deployed |
| `/api/saas/checkout` | `www/members.html:8729` | Subscribe button | Toast: "Failed to start checkout" | **B** | |
| `/api/saas/billing-portal` | `www/members.html:8749` | Manage subscription button | Toast error | **B** | |
| `/api/vehicle-photos/{id}` | `www/members-vehicles.js:1125` | Vehicle photo upload persist | Console error; photo not saved | **B** | POST with Bearer token; function missing |
| `/api/tenant/me` | `www/members.html:9100` | White-label tenant identity | Silent try-catch | **B** | Multi-tenant only; irrelevant for non-WL |
| `/api/tenant/roster` | `www/members.html:9287` | Tenant member list | Error in UI | **B** | Multi-tenant only |
| `/api/tenant/analytics` | `www/members.html:9347` | Tenant analytics panel | Error in UI | **B** | Multi-tenant only |
| `/api/tenant/loyalty-config` | `www/members.html:9427` | Tenant loyalty settings | Error in UI | **B** | Multi-tenant only |
| `/api/tenant/approval-workflow` | `www/members.html:9467` | Tenant workflow settings | Error in UI | **B** | Multi-tenant only |

### Bucket Summary

| Bucket | Count | Endpoints |
|--------|-------|-----------|
| **A — delete the dead call** | 0 | None — every call has a real feature behind it |
| **B — endpoint missing, needs building** | 14 | predictions (+invalidate), care-plans (5), saas (3), vehicle-photos, tenant (5) |
| **C — ignore** | 3 | /api/config, /api/white-label/config, /api/member/onboarding |
| **Bug fix (header mismatch)** | 1 | /api/vehicle/{id}/recalls — endpoint exists, just missing auth header on client |

### Priority within Bucket B

Care-plans and saas endpoints produce **visible error messages** in the UI — members can see them. Predictions and vehicle-photos degrade silently. Tenant endpoints only matter for white-label deployments.
