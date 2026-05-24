# MCC progress report for Claude Code

**As of:** commit `3e3b2209` on `main` (pushed to GitHub).
**Companion file:** `docs/claude-code-tasks.md` (the original brief list).

This is a status update of work merged since the Claude Code briefs were
written (`d9f2e8ca`). Read this first before picking up any remaining brief —
several have been completed, and a few left side-effects you should know
about.

---

## What's already merged (do NOT redo)

| Task | Title | Commit |
|------|-------|--------|
| #362 | Smoke-test fake bid push abuse cases | `94a96b28` |
| #367 | Fix `profiles.referred_by_founder_id` FK target | `3ed4807c` |
| #373 | Admin Providers tab: BackgroundChecks.com Mode visibility | `a06c129c` |
| #374 | Provider-facing "BGC sub-account linked?" status card | `7953b334` |
| #375 | Regression test pinning providers can't SELECT `bgchecks_api_key` | `769857b7` |
| #386 | Translate updated homepage copy into 6 non-English locales | `bdeeabcc` |
| #387 | Sweep stale "platform fee / commission" language across site | `a71610f0` |
| #389 | Provider self-serve match preferences (categories / radius / pause) | `25a26cc9` |
| #391 | Survey Analytics: thread date range through list + export | `88b55e99` |
| #392 | Move Survey Analytics aggregation into a single Postgres RPC | `8aa4d0c8` |
| #393 | Regression test: chart totals match headline (>1000-row bug guard) | `e6258f52` |
| #394 | Stop Stripe webhook from charging without granting bid credits | `3e3b2209` |

---

## Status of each brief in `docs/claude-code-tasks.md`

### Tier 0
- **#468 — Restore workspace SUPABASE_ANON_KEY** — **still pending.** Human
  action only; no code change possible. The user has not confirmed they set
  the secret. Until they do, every JWT-gated smoke step (23, 24, 24b-jwt,
  24d, 24e, 24f, 31) continues to SKIP.

### Tier 1 (launch blockers)
- **#316 — [LAUNCH 01] Fix admin route safety lockdown test** — **still
  open.** Untouched.
- **#271 — [LAUNCH 05] DB-trigger lockdown on admin-only payment columns** —
  **still open.** No conflicts with #387's copy sweep. Note that #387 changed
  some `payments.admin_note` *labels* in the UI but not the column.
- **#289 — [LAUNCH 06] RLS proof: providers can't dismiss other providers'
  alerts** — **still open.** #375 just landed the same-shape test for
  `provider_background_check_accounts.bgchecks_api_key` — use
  `netlify/functions-tests/bgc-rls.test.js` as the **template** (uses real
  `$DATABASE_URL` + isolated schema, falls back to static migration scan
  when no DB). Copy that pattern instead of inventing a new one.
- **#268 — [LAUNCH 07] Honour Twilio STOP replies** — **still open.**
- **#272 — [LAUNCH 08] Admin audit-log UI** — **still open.**

### Tier 2 (silently-broken in prod)
- **#394 — Stripe webhook silently 200s on credit-insert failure** —
  **DONE.** Implementation deviated slightly from the brief: instead of a
  `stripe_webhook_failures` table + scheduled retry, the fix uses
  `lib/bid-credit-grants.js` (returns ok:false on DB error → webhook
  returns 500 so Stripe retries naturally via its existing ladder),
  plus a daily reconciler at
  `netlify/functions/bid-credit-reconciler-scheduled.js` (cron
  `30 3 * * *`) that cross-checks Stripe Checkout Sessions from the last
  7 days against `bid_credit_grants` and emails admin for any 1h+ gap.
  Idempotency is enforced via the existing `bid_credit_grants.transaction_id`
  UNIQUE. Two follow-ups proposed in the project task list (#486 admin
  dashboard, #487 manual-grant double-count guard) — don't recreate.
- **#455 — Wire (or delete) 8 silently-404ing payment endpoints** — **still
  open.**
- **#456 — Wire (or delete) 6 silently-empty AI/calendar/tracking endpoints**
  — **still open.**
- **#411 — Real-time alert when audit-log write fails after Stripe moved
  money** — **still open.** The new `lib/bid-credit-grants.js` from #394
  uses the same `ai_action_log` + Resend dedup pattern this brief
  prescribes — borrow the helper shape.
- **#412 — Detect stuck `retry_payout` Treasurer actions** — **still
  open.**
- **#419 — Care-plan status mismatch with DB CHECK constraint** — **still
  open.**
- **#438 — Fix the pre-existing failing self-bid test** — **still open.**

### Tier 3
- **#467 — Smoke step: re-finalize as already-promoted provider** —
  **still open.** Blocked in practice by #468 (the new step would SKIP
  without a real anon key).
- **#375 — Regression test: providers can't read decrypted BGC key** —
  **DONE** (see Tier 1 note above). Behavioural Postgres test +
  static-scan in `netlify/functions-tests/bgc-rls.test.js`. Removed from
  remaining work.
- **#363 — Resend webhook: fail-closed in prod when secret missing** —
  **still open.**
- **#463 — Sweep remaining admin loaders onto adminFetch +
  renderAdminAuthError** — **still open.**
- **#404 — and the rest of Tier 3 / 4 — still open.**

---

## Codebase changes since the briefs were written (relevant heads-up)

These are facts about the repo that may affect a brief's instructions:

1. **`lib/bid-credit-grants.js` exists now.** Tier 2 brief #411 wants
   `lib/audit-warning-alert.js`. Model the file shape (and the `ai_action_log`
   `module=...`, `escalated=true`, dedup-by-action-id pattern) on
   `lib/bid-credit-grants.js`.
2. **`bid-credit-reconciler-scheduled.js` is in `netlify.toml` cron list.**
   When adding any new scheduled function (#411 alert helper does NOT need
   one; #394's reconciler already exists), don't accidentally remove existing
   schedules in the cron block.
3. **`lib/survey-analytics.js` is the new aggregation seam.** If any new
   brief mentions modifying `/api/admin/survey-analytics`, route work through
   `computeSurveyAnalytics()` instead of inlining.
4. **`docs/api-fallback-audit.md` row for "bid credit grant" now reads
   "Resolved in Task #394".** When picking up #455/#456, leave that row
   alone and update only the row for the endpoint you actually fix.
5. **`provider_match_preferences` table + RPC exist (#389).** If a brief
   touches AI matching or provider radius logic, check
   `handleMatchProvidersForPackage` in `www/server.js` — it now consults
   `provider_match_preferences` first, falls back to legacy
   `provider_applications.service_radius_miles`.
6. **Homepage copy in `www/locales/{es,fr,el,zh,hi,ar}.json` was rewritten
   in #386.** If a brief edits `landing.*` keys, you're working on the
   refreshed copy; don't restore the old "One app / Every auto need" hero.
7. **`MCC_FEE_PERCENT` is now `0` in `stripeutils.js`** (#387). The constant
   is intentionally kept (and exported) as the single switch for any future
   fee model. Don't delete it without coordinating with the in-flight
   discussion in proposed task #479.
8. **Founding-Provider PDF agreement text is duplicated across four files**
   (`netlify/functions/admin-agreements.js`,
   `netlify/functions/sign-agreement.js`, `server.js`, `www/server.js`).
   #387 fixed all four — if you edit the agreement again, update all four
   or extract to a shared module first (no module exists yet; the reviewer
   on #387 suggested it as a follow-up).

---

## Git / GitHub state

- `main` HEAD: `3e3b2209`, pushed to `origin/main` (GitHub:
  `jmzanetis-cmyk/mycarconcierge`).
- A persistent cosmetic warning may appear on push: "Unable to create
  `.git/refs/remotes/origin/main.lock`: File exists." It's a sandbox
  restriction (Task #473), not a real failure — pushes succeed. Confirm
  with `git ls-remote origin main` after any push.
- `.local/` is globally gitignored. **Never** put deliverable docs there.
  This file and the briefs both live in `docs/` for that reason.

---

## Recommended next pull-order for Claude Code

1. **#468** (operator action — just nag the user; nothing else unblocks
   without this).
2. **#316** (turns `npm test` green — 1-line fix, gates everything else).
3. **#438** (turns `bash scripts/run-function-tests.sh` green — pairs
   well with #316 as a "tests pass cleanly" milestone).
4. **#289** (use #375 / `bgc-rls.test.js` as the template — fast win).
5. **#363** (small surface, security-positive).
6. **#411** (use `lib/bid-credit-grants.js` as the template).
7. **#268, #271, #272** (launch blockers, each is a meaty PR).
8. Everything else in original brief order.
