# Phase 4a Findings — Admin Destructive & Security Actions

**Started:** 2026-09-18
**Method:** per `MCC_AUDIT_PLAN.md` Phase 4a spec — inventory every destructive/security-sensitive admin action, verify (a) the backend endpoint rejects non-admin callers, (b) destructive actions write `admin_audit_log`. Code-traced all 37 `netlify/functions/*-admin.js` + `admin-*.js` files; live-verified the auth gate against production (`mycarconcierge.com`) with no-token and garbage-token requests. A real non-admin-JWT live test (the plan's stated "security core" check) is queued — see Open Items.
**Register class:** CRITICAL (exploitable now) → HIGH (real gap, no live exploit found) → MEDIUM (hygiene/inconsistency) → LOW (cleanup) → CLEAN (audited, no finding).

---

## Summary counts

| Severity | Count | Status |
|---|---|---|
| HIGH | 0 | — |
| MEDIUM | 2 | #1 CLOSED 2026-09-18 (fixed at the live site; remaining call sites investigated, not live bugs), #2 CLOSED 2026-09-18 (audit-log gaps filled) |
| CLEAN verdicts | 2 classes | Auth gating (all 37 files); admin-invite.js public-by-design flow |
| Open items | 0 | All closed |

---

## CLEAN verdict #1 — admin backend auth gating, all 37 files, audited 2026-09-18

Every `netlify/functions/*-admin.js` and `admin-*.js` file (37 total) rejects unauthenticated callers before doing anything destructive. Three correct patterns in use, no gaps found:

- `utils.authenticateBearerAdmin(event, supabase)` — verifies the Supabase JWT, then requires `profiles.role === 'admin'`. Used by the majority (admin-agreements, admin-data, admin-dispute-resolve, admin-founders, admin-refunds, admin-release-payment, admin-saas, admin-sms-log, admin-team, admin-welcome-email, admin-marketing, agent-fleet-admin, ai-ops-admin, api-key-expiry-admin, outreach-admin, provider-admin, and others).
- `utils.authenticateAdminSection(event, supabase, section)` — newer (Task: Team Login, 2026-09-03) scoped variant: full admins pass unconditionally, non-admin `admin_team_members` rows pass only if their role is allow-listed for that specific `section` in `lib/admin-role-permissions.js` (the same map that drives the nav filter, so backend access can never exceed what a role's own UI shows). Used by admin-designs, admin-hubspot, admin-provider-outreach, admin-stats, admin-survey, admin-team-login, and the `OrTeam` variant (admin-api-usage, admin-chat-insights, admin-printful, admin-white-label). Per its own code comment, every function NOT yet retrofitted to this still defaults to the strict `authenticateBearerAdmin` — including payments, disputes, refunds, agreements, and team-management, i.e. the highest-stakes surfaces deliberately kept on the stricter gate.
- `ops-flags-admin.js` — inline equivalent (`profile.role !== 'admin'` check), functionally identical, just not routed through the shared helper.
- `stripe-key-expiry-admin.js` — thin shim delegating to `api-key-expiry-admin.js`'s handler (itself gated via `authenticateBearerAdmin`).

**Live-verified 2026-09-18** against production with no `Authorization` header and with a garbage/malformed Bearer token — `/api/admin/refunds`, `/api/admin/saas/subscriptions`, and `/api/admin/founders` all correctly returned `401 {"error":"Authentication required"}` in both cases. Extends Phase 1's per-file auth review of `admin-founders`/`agent-fleet-admin` to the full 37-file surface.

## CLEAN verdict #2 — admin-invite.js public endpoint, audited 2026-09-18

`admin-invite.js` is intentionally unauthenticated ("Public endpoints for accepting admin team invites — no auth required, token IS the credential"). Reviewed for the obvious ways that pattern goes wrong:
- Token: `crypto.randomBytes(32).toString('hex')` (256 bits) — not guessable.
- Expiry enforced (`expires_at` checked server-side) and single-use enforced (`status !== 'pending'` rejected).
- The granted `role` on accept comes from the server-side invite row (`role: invite.role`), not from the client request body — a crafted `invite-accept` POST can't escalate its own role.

No finding.

---

## Finding #1 — MEDIUM · PARTIALLY FIXED 2026-09-18 · frontend conflates 403 with "admin session expired"

**Where:** `www/admin.js`. The shared fetch wrapper `aiOpsFetch` (aka `adminFetch`, aka what `safeFetch` delegates to — line ~14174) tagged *every* `401` and `403` response with `code = 'ADMIN_AUTH_REJECTED'`, which renders the "⚠ Your admin session expired — Sign in again" prompt (`renderAiOpsAuthError`, line ~14293).

**Why it's wrong:** grep-verified across every `admin-*.js` backend (see CLEAN verdict #1's sibling check) — a *real* "you're not an admin" rejection is always `401`. Every `403` in the admin backend means the caller IS an authenticated admin but the specific action is blocked for another reason: a feature flag is off (`admin-saas.js` → `feature_disabled`), a business rule (`admin-founders.js` → "commission rate is contractually locked"), or a team-login-specific state (`admin-team-login.js`). Telling the admin their session expired and offering a reauth button is actively misleading — re-authenticating never fixes any of these.

**Caught live:** SaaS Subscriptions (`data-section="saas-subscriptions"`) — `shop_saas_enabled` is off, so `/api/admin/saas/subscriptions` correctly 403s with `feature_disabled`, but the UI showed the session-expired prompt.

**Fixed (commit `e19d6be`, branch `fix/admin-403-error-handling`, not yet merged to `main`):** `aiOpsFetch` now only tags `401` as `ADMIN_AUTH_REJECTED`; `403` gets a new `REQUEST_FORBIDDEN` code and falls through to the existing (already-correct) non-auth error display, which shows the real server-side reason.

**Remaining ~15-20 call sites — investigated 2026-09-18, no live bug found.** These do their own inline `if (response.status === 401 || response.status === 403) err.code = 'ADMIN_AUTH_REJECTED'` rather than going through `aiOpsFetch`: `admin.js:1575, 1769, 2344, 2431, 2840, 4172, 9606, 12378, 12464, 13002, 13058`, backing `/api/admin/{providers,members,packages}` (admin-data.js), `/api/admin/agreements` (admin-agreements.js), `/api/admin/refunds` (admin-refunds.js), `/api/registration/verifications` (vehicle-verify.js), `/api/admin/provider-outreach/*` (admin-provider-outreach.js), `/api/admin/launch-broadcast/*` (launch-broadcast-admin.js). Checked every one of those backends for an actual 403 return path: `admin-data.js`, `admin-refunds.js`, `admin-agreements.js`, and `launch-broadcast-admin.js` never return 403 at all (401-only auth gate). `admin-provider-outreach.js` uses the scoped `authenticateAdminSection` helper but its own route handler collapses any authorization failure back to 401, never 403. `vehicle-verify.js`'s verifications handler (`handleGetVerifications`) does its own inline admin check that changes the response *shape* for non-admins rather than rejecting with 403. So unlike SaaS Subscriptions — which hits a feature-flag-gated 403 from `admin-saas.js` — none of these can currently produce a 403 a real user would ever see; the branch is dead code today. Left as-is rather than rewrite ~11 working functions for a scenario that doesn't happen; worth a second look only if one of these backends later grows a scoped/feature-gated 403 the way `admin-saas.js` did. `loadApplications` (line 1575) is a different case — it reads a raw Supabase client error, not a fetch response, and a real RLS-driven auth failure there would mean the JWT genuinely isn't an admin's, so "sign in again" is accurate messaging in that one case.

## Finding #2 — MEDIUM · CLOSED 2026-09-18 · `admin_audit_log` adoption was inconsistent across destructive actions

**Where:** repo-wide grep, `netlify/functions/*-admin.js` + `admin-*.js`.

**Correction to the original write-up:** the initial pass under-counted adopters — `admin-dispute-resolve.js` and `admin-release-payment.js` already write to `admin_audit_log` via the shared `_shared/audit.js` helper (`resolved_by`/`performed_by: user.id`, action `dispute_resolved_by_admin` / `payment_released_by_admin`). Missed on the first grep because the insert is abstracted behind that shared helper rather than a literal `.from('admin_audit_log')` call in the file itself — worth remembering for future greps of this codebase.

**What was actually missing, and is now fixed:**
- `admin-refunds.js` (`handleProcess`) — approve/deny a refund, including live Stripe refund issuance. Now writes `refund_denied_by_admin` / `refund_processed_by_admin` via the same shared `_shared/audit.js` helper used by `admin-dispute-resolve.js`.
- `admin-founders.js` (milestone pay endpoint, line ~443) — marking a founder milestone payout as paid. Now writes `founder_milestone_marked_paid`.
- `admin-team.js` — **was the weakest instance:** role changes and member removal had neither row-level actor attribution nor an audit-log entry — no record of which admin changed another team member's role or removed them. Now writes `team_member_updated` (capturing previous vs. new role/status, whether a password was reset) and `team_member_removed` (capturing who was removed and their prior role), both attributed to `admin.id`.

All three use the existing `_shared/audit.js` helper (`alertOnFailure: true` — a failed audit write pages ops rather than silently vanishing) rather than inventing a new logging path, matching how `admin-dispute-resolve.js` and `admin-release-payment.js` already do it. Fixed alongside Finding #1's follow-up in commit `4a79949` on `fix/admin-audit-cleanup` (branch not yet merged).

This was never a security hole — every one of these was still correctly gated behind `authenticateBearerAdmin` (see CLEAN verdict #1) even before the fix — it was an accountability/observability gap. Admin → Audit Log now shows the full picture for these four files.

---

## Open items

- ~~Live non-admin-JWT test~~ — **DONE 2026-09-18.** Jordan logged into the demo account (role never elevated past `authenticated` in the JWT itself — the app checks `profiles.role` server-side, not the JWT), pasted the resulting access token, and it was used live against production: `/api/admin/refunds`, `/api/admin/saas/subscriptions`, `/api/admin/founders` all correctly returned `401 {"error":"Authentication required"}` with a real, valid, non-admin token. This closes the plan's stated "security core" check for the sampled endpoints — the pattern (DB role lookup, not JWT-claim trust) is identical across all 37 files per CLEAN verdict #1, so this sample generalizes.
- **Phase 4b (admin read-only surfaces)** — correctness/completeness/performance of the other ~35 sections — not started, per the original plan's own sequencing (4a first).
