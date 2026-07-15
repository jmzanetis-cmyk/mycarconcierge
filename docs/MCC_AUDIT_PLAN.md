# MCC Comprehensive Feature & Admin Audit — Plan

**Date:** 2026-07-14 · **v1.0**
**Scope:** whole-app audit — the pilot-blocker class we've been finding by accident, done systematically.
**Related:** [CAR_CLUB_COMPLETION_PLAN.md](CAR_CLUB_COMPLETION_PLAN.md) — Car Club pilot spec, first execution of the Phase 1 money-path audit method (see its 2026-07-13 PROOF entry for the reference workflow), and origin of roughly half the concrete bugs cited below.

## Why, in one paragraph

In two sessions of ordinary testing we found: a member-facing page that bounced every user since it shipped (missing client init), a provider page calling an API that was never built, a nav link 404ing for all providers, a login fast-path that ignored roles, a verification gate that would have silently blocked the pilot's founding provider, and a points system whose "is it even built?" status was unknown to its own team. None of these were exotic — they were *wiring* failures between layers that nothing ever cross-checked. The inventory says there's more: **454 distinct `/api/…` paths called from the frontend vs 236 redirect rules and 188 functions.** The audit's job is to find every remaining void systematically instead of stumbling into them mid-pilot.

## Scale (measured)

80 deployed pages · 188 Netlify functions · 236 redirect rules · 454 distinct frontend API paths · 22,446-line admin portal · 150+ SQL migrations · 3 feature flags (`car_club_programs_enabled`, `crowdfunding_enabled`, `shop_saas_enabled`).

---

## Phase 0 — Automated integrity sweep (1 session, mostly Claude, read-only)

Build a repo-level audit script that mechanically catches today's entire bug classes:

- **Route integrity matrix:** extract every `/api/…` call site from `www/` → match against `_redirects` rules → match against each function's internal dispatcher. Outputs three lists: *frontend→void* (job-board class — calls with no backend), *unrouted functions* (backend with no path in), *orphan redirects*. Every finding carries `file:line`.
- **Page wiring check:** for each of the 80 pages: loads supabase CDN **and** `supabaseclient.js` in the right order; no bare `supabase.auth` usage (car-club-member class); redirect chains on auth failure don't loop through the login fast-path; SW `STATIC_ASSETS` membership vs cache-bump discipline; dead root `sw.js` and similar strays.
- **Era-mismatch grep set:** punch-card-era tables/copy vs points-era (`club_reward_rules` vs `club_rewards` reads), legacy endpoint names, emoji sweep, known console-noise endpoints (`/api/config`, notifications, testimonials, recommended, clover/POS/bgcheck…) — classify each as *implement*, *stub 204*, or *remove caller*.

**Calibration & stated miss rate (amendment 2026-07-14).** Grep-based extraction has known blind spots: template-string URL construction (``${apiBase}/api/…``), paths assembled from config lookups, URLs split across variables, URLs in comments producing false positives, generated code. Before trusting the findings register, **hand-check 3–4 pages against the script's output** to calibrate accepted miss rate (target: <10% false negatives; note the number in the register itself). Findings from the script are the starting point, not the ceiling.

Deliverable: findings register (CSV/MD) with severity and calibration note. This becomes the regression gate — re-run before every iOS build.

## Phase 1 — Money paths (1–2 sessions, highest stakes)

Walk every dollar: care-plan escrow lifecycle (create → bid → accept/PI → capture/release → refund → dispute → clawback), stripe-webhook's 13 event handlers one by one, wallet load/spend, driver tips/cashouts/payouts, bid-credit purchase, founder commissions + clawbacks, member credits/referrals, Car Club accrual (done ✅ — use its method as the template: code trace, then controlled $2-class live transaction, then ledger verification). Claude verifies DB truth per step; Stripe dashboard deliveries check closes the loop. **Reference implementation:** see the [2026-07-13 PROOF entry in CAR_CLUB_COMPLETION_PLAN.md](CAR_CLUB_COMPLETION_PLAN.md) for the code-trace + signed-webhook-sim + ledger-verify + cleanup pattern.

## Phase 2 — Member portal walk (1–2 sessions)

Every sidebar surface on `members.html` + satellite pages: vehicles, care plans (incl. AI-create when credits allow + manual path), maintenance packages, household, fleet, reminders, referrals, car clubs (done ✅), wallet, messages, service history, insurance/fuel tracker, settings, notifications, check-in QR. Per surface: loads? API exists? happy path completes? data persists and is re-readable? Console clean? Jordan drives with a per-surface checklist; Claude traces failures in code live (today's method).

## Phase 3 — Provider portal walk (1–2 sessions)

Dashboard cards, shop setup checklist, bid credits purchase (money path overlap), **job board (fixed ✅ — endpoint + CDN both landed 2026-07-14)**, browse packages, my bids, active jobs, awarded plans, refund requests, emergency queue, fleet services, customer queue, earnings + analytics, reviews, performance, settings, provider club management (known broken: `/api/car-club/my-club` void), documents/verification upload, onboarding. Use the test provider account throughout.

## Phase 4a — Admin destructive & security actions (1–2 sessions)

Inventory every **destructive or security-sensitive** action in `admin.html`/`admin.js` and audit per action: endpoint exists → works → **rejects non-admin JWTs** (test with a member token — this is the security core) → destructive actions write `admin_audit_log`. Cover: payments edit/delete, provider suspend/activate, verification-status management (the gate that nearly killed the pilot — confirm the admin UI can actually set it), feature-flag editor, agent-fleet controls, refunds, disputes, white-label tenants, API keys. Findings here are security-weighted by default.

## Phase 4b — Admin read-only surfaces (1 session)

The rest of `admin.html` / `admin.js` — dashboards, reports, lists, drill-downs. Audit for: correctness (data reflects reality), completeness (no silently-missing rows), and performance (large tables don't time out). Lower urgency than 4a because read-only surfaces have narrower blast radius when broken. **Rationale for the split (amendment 2026-07-14):** 22k admin lines in 2 sessions was aggressive when Phases 2 and 3 get the same budget on much smaller surfaces. Splitting lets 4a stay tight and security-first; 4b can slip into a lull session or defer to Phase 6 without blocking pilot.

## Phase 5 — Auth, roles, RLS & schema-code coherence (1–2 sessions)

Role-routing matrix (member / provider / admin / driver / pending / dual-role / suspended) × (fresh login, fast-path, logout, deep-link); the three feature flags: who's enabled, what each gates, whether any surface leaks when off; `verification_status` lifecycle end to end.

**RLS spot-checks (amendment 2026-07-14):** use *user-scoped* tokens against sensitive tables (`profiles`, `payments`, `club_points_ledger`, `member_credits`, `care_plans`, `plan_bids`, `messages`, `member_founder_profiles`, `founder_commissions`) — service-role code paths bypass RLS, so test what the anon client can actually reach. **Automated inputs:** run Supabase MCP `mcp__supabase__get_advisors` (catches missing RLS-enable on tables, exposed policies, security-definer misuse) and `mcp__supabase__list_tables` (catches Replit-era untracked tables from the same drift class as `member_founder_profiles`, `member_club_balances`, `profiles.qr_code_token`). Both are cheap; findings feed the same register.

**Schema-code coherence check (amendment 2026-07-14):** the "two tables mean similar things, code reads one and writes the other" class isn't only era-mismatch. BUG-02 (redeem RPC reading `club_rewards` while punch wrote `club_reward_rules`) was one instance. Scan for the general pattern: pairs of related tables where FKs / writes / reads should agree but don't. Concrete checks: RPCs that read table X but no code path writes to X in that context; FKs that resolve to zero rows for the intended use case; tables with matching column shapes but different write/read call sites. Broader than the Phase 0 era grep, needs the DB inventory Phase 5 already touches.

## Phase 6 — Long tail: audit, dark, or retire (1 session, triage-only)

Drivers app + live tracking, custody chain, white-label/SaaS, outreach engine + agent fleet, crowdfunding, dream car finder, Spanish i18n, PWA/service worker. Per module, decide one of three: *audit properly* (it's near-term), *flag dark* (built but not now), or *retire* (delete dead code — less surface = fewer voids). Not everything deserves a full audit; deciding is the deliverable.

---

## Method conventions (all phases)

Claude reads code and traces (direct repo access — no relayed reports); Claude executes SQL verification via Supabase MCP against prod and manages git; Jordan drives the UI and screenshots; every finding gets `file:line` + severity + fix-or-defer; fixes batch into small commits per phase with plan-doc log entries; the Phase 0 script re-runs after each phase as regression proof. **iOS build waits until Phases 0–4a fixes land** (the binary bundles `www/` — shipping it earlier freezes today's bugs into the App Store build).

## Sequencing (resolved 2026-07-14)

1. **Finish the dress rehearsal first** — the flag-scoped test-provider transaction (bid → pay → release → earn → redeem → validate) proves the last unverified link from the Car Club PROOF (real Stripe delivery + PI-creation runtime) and money-path-audits the core flow for free.
2. **Chris live on Alpha only, flag-scoped** — Stage 2 flag-on remains scoped to `test_users` array (Jordan + Chris + test provider); no global enable. This lets Chris run his real transaction alongside the audit without waiting 7–10 sessions of audit for pilot flag-on. Non-pilot members remain flag-off; audit runs in parallel on non-pilot surfaces.
3. **Phase 0 next session** — Claude builds + runs the script, calibrates against 3–4 hand-checked pages, findings register lands same day.
4. **Phases 1 → 2 → 3 → 4a → 5 in order** — money first, then surfaces by user impact, then admin security, then auth/RLS/schema coherence.
5. **Phase 4b (admin read-only)** slots into a lull session or moves to Phase 6 triage if calendar tight.
6. **Phase 6 triage**, then the iOS build + resubmission off the cleaned tree.

Rough total: **8–11 working sessions** (up from the original 7–10 to accommodate the 4a/4b split and the expanded Phase 5). Front-loaded so each session ships fixes, not just findings.

---

## Cross-reference back

Findings from any phase that touch Car Club specifically → log in [CAR_CLUB_COMPLETION_PLAN.md](CAR_CLUB_COMPLETION_PLAN.md) §1a (real bugs) or §9a (post-pilot debt) as appropriate. Findings elsewhere → log inline in this doc under the relevant phase, with `file:line` and severity.
