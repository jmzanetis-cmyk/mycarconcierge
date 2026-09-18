# Phase 4a Findings — Admin Destructive & Security Actions

**Started:** 2026-09-18
**Method:** per `MCC_AUDIT_PLAN.md` Phase 4a spec — inventory every destructive/security-sensitive admin action, verify (a) the backend endpoint rejects non-admin callers, (b) destructive actions write `admin_audit_log`. Code-traced all 37 `netlify/functions/*-admin.js` + `admin-*.js` files; live-verified the auth gate against production (`mycarconcierge.com`) with no-token and garbage-token requests. A real non-admin-JWT live test (the plan's stated "security core" check) is queued — see Open Items.
**Register class:** CRITICAL (exploitable now) → HIGH (real gap, no live exploit found) → MEDIUM (hygiene/inconsistency) → LOW (cleanup) → CLEAN (audited, no finding).

---

## Summary counts

| Severity | Count | Status |
|---|---|---|
| HIGH | 0 | — |
| MEDIUM | 2 | Both open — #1 (403/401 conflation, partially fixed), #2 (audit-log adoption gap) |
| CLEAN verdicts | 2 classes | Auth gating (all 37 files); admin-invite.js public-by-design flow |
| Open items | 1 | Live non-admin-JWT test (garbage/missing token confirmed rejected; a real member/provider token not yet tested) |

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

**Not yet fixed — same conflation exists independently in ~15-20 other call sites** that do their own inline `if (response.status === 401 || response.status === 403) err.code = 'ADMIN_AUTH_REJECTED'` rather than going through `aiOpsFetch`. Grep hits: `admin.js:1575, 1769, 2344, 2431, 2840, 4172, 9606, 12378, 12464, 13002, 13058` (approximate — re-grep `status === 401 || .* status === 403` before starting). Each needs its own small look (confirm the endpoint it's calling can even return a non-auth 403 before touching it) rather than a blind find-replace across all of them at once. Scoping a follow-up pass is a reasonable next step, not done in this session.

## Finding #2 — MEDIUM · OPEN · `admin_audit_log` adoption is inconsistent across destructive actions

**Where:** repo-wide grep, `netlify/functions/*-admin.js` + `admin-*.js`. Only 7 of 37 files write to `admin_audit_log`: `ai-ops-admin.js`, `apollo-admin.js`, `concierge-jobs-admin.js`, `driver-payouts-admin.js`, `outreach-admin.js`, `provider-admin.js`, plus `admin-audit-log.js` itself (the reader).

**What's missing it, with real destructive actions:**
- `admin-refunds.js` (`handleProcess`, line ~100) — approve/deny a refund, including live Stripe refund issuance (`stripe.refunds.create`, line ~178). No `admin_audit_log` row. *Partial mitigation:* the `refunds` table itself records `approved_by: userId` and `approved_at` on the row (lines ~127, ~186) — so the action IS attributable, just not visible from the Admin Portal's own "Audit Log" nav section, which (per its own file) reads from the centralized table.
- `admin-dispute-resolve.js` (line ~161) — same pattern: `resolved_by: user.id` on the row, no centralized log entry.
- `admin-founders.js` (line ~443) — `paid_by: user.id` on the payout row, no centralized log entry. (This is the file with the double-pay race fixed in July — the fix added idempotency, not audit logging.)
- `admin-team.js` — **the weakest instance.** Role changes (`updates.role = body.role`, line ~219) and member removal (`.delete()`, line ~251) have **neither** row-level actor attribution **nor** an `admin_audit_log` entry. There's no record of which admin changed another team member's role or removed them. This is the one place in the list where the gap isn't softened by an on-row fallback — worth prioritizing given it's the audit trail for who has admin access in the first place.

**Not a security hole** — every one of these is still correctly gated behind `authenticateBearerAdmin` (see CLEAN verdict #1), so this is an accountability/observability gap, not an unauthorized-access one. But it's exactly the class the plan doc calls "security-weighted by default" for refunds/disputes specifically, and it means Admin → Audit Log does not show the full picture of what your team has done.

**Suggested fix (not applied — scope/priority call for Jordan):** either (a) add `admin_audit_log` inserts to these four files following the pattern already used in `provider-admin.js`, or (b) if row-level attribution is judged sufficient for refunds/disputes/founders, at minimum add it to `admin-team.js` since that one currently has nothing at all.

---

## Open items

- **Live non-admin-JWT test.** The plan's stated "security core" check — hit an admin endpoint with a *real, valid* member/provider token (not just missing/garbage) and confirm rejection. No-token and garbage-token requests both correctly 401'd live against production; a genuine non-admin JWT test is still queued (blocked only on getting a token without me handling credentials directly — see conversation).
- **Phase 4b (admin read-only surfaces)** — correctness/completeness/performance of the other ~35 sections — not started, per the original plan's own sequencing (4a first).
- **Follow-up sweep** for Finding #1's ~15-20 remaining call sites, once someone's eyes are on each one individually.
