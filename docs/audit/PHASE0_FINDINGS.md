# Phase 0 — Integrity Sweep Findings

**Generated:** 2026-07-16 · via `scripts/audit-integrity.js`
**Raw data:** [PHASE0_RAW.json](PHASE0_RAW.json)
**Scope:** static analysis of `www/`, `netlify/functions/`, `supabase/migrations/`, root twins. No network, no prod queries.

## Summary counts

| Severity | Count |
|---|---|
| CRITICAL — user-facing dead feature | **11** |
| HIGH — silent data bug | **2** (era-mismatch reads; both bare-namespace flags were FP after calibration) |
| MEDIUM — noise / infra hygiene | **48** (6 unrouted noise endpoints + 41 stale root/www twins + 1 sw.js version drift) |
| LOW — cleanup | **21** unrouted functions (helper-filtered), 0 orphan redirects, ~5 non-splat rule gaps |

## Calibration statement

**Measured miss rate: 0% false negatives on hand-audited pages; ~50% false positive on bare-namespace check.**

Hand-audited: `www/members.html` (17 unique `/api/…` paths — script matched 17), `www/providers.html` (3/3), `www/admin.html` (0/0 — all admin logic lives in `www/admin.js`, verified separately: 50 unique paths from grep, 0 flagged as void), `www/fleet.html` (1/1). Random pick: `www/admin.js` (chosen because admin.html had 0 hits — the real admin code lives here; 50 unique paths grep-verified against 0 void findings, meaning all 50 are routed).

**Blind spots retained** (documented, not fixed):
- Dynamic URL construction via `apiBase + '/api/...'` split across variables — captured in `sectionA.unresolvedFetches` (14 hits, all in `www/.netlify-deploy/` bundled artifacts which the script now excludes; live-code dynamics live in `apiFetch()` calls that resolve at runtime).
- Comment/string-literal false positives on the bare-namespace check — both flags below are FP (localStorage key literal and prose comment). Real bug class from car-club-member.html (`supabase.auth.getSession()` at runtime) exists in the codebase before the 2026-07-14 fix but no longer appears in current source.
- Generated code / bundled Netlify artifacts under `www/.netlify-deploy/` — excluded from scan after first-run showed 67 phantom voids from bundled function copies.

**Confidence:** high on route matrix (0% FN on 4 hand-checked pages), medium on wiring (regex-based, 1/1 real signal + FP filtering done), high on twins (byte-diff is deterministic).

---

## CRITICAL — user-facing dead feature (11)

Frontend calls with no matching redirect rule, on real user-visible pages. Each is a `job-board`-class bug: the page ships expecting an endpoint that doesn't exist. Suggested one-liner fix per item.

| # | API path | Called from | Severity note | Suggested fix |
|---|---|---|---|---|
| 1 | `/api/tenant/me` | `www/members.html:9614` | White-label tenant surface on member portal | Add redirect or implement `netlify/functions/tenant-me.js` |
| 2 | `/api/tenant/roster` + `/api/tenant/roster/` | `www/members.html:9801, :9843` | Same white-label surface | Implement or gate the caller behind `white-label` feature flag |
| 3 | `/api/tenant/analytics` | `www/members.html:9861` | Same | Same |
| 4 | `/api/tenant/loyalty-config` | `www/members.html:9941` | Same | Same |
| 5 | `/api/tenant/approval-workflow` | `www/members.html:9981` | Same | Same |
| 6 | `/api/fleet/subscription` | `www/members.html:9369` | Fleet feature (member sidebar) | Implement or hide the sidebar item |
| 7 | `/api/fleet/setup` | `www/fleet-signup.html:407` | Fleet signup flow | Implement `netlify/functions/fleet-setup.js` |
| 8 | `/api/fleet/import-vehicles` | `www/fleet.html:984` | Fleet vehicles page | Same |
| 9 | `/api/fleet/check-approval` + `/api/fleet/update-mileage` | `www/fleet-driver.html:499, :589` | Fleet driver interface | Same |
| 10 | `/api/2fa/{status,enable,disable,send-code,verify-code}` | `www/providers.js:11767–12074` | Provider 2FA settings — 5 endpoints, all voids (TOTP endpoints exist under `/api/2fa/totp/*` — non-TOTP flow is orphaned) | Consolidate providers.js 2FA calls onto the TOTP endpoints, or add `/api/2fa/*` rules |
| 11 | `/api/founder/{campaign-stats,campaign-link-stats,payout-receipt/${id}}` | `www/founder-dashboard.js:505, 1286, 1354` | Founder dashboard — matches the "founder dashboard UI + read-endpoints" gap flagged in CAR_CLUB_COMPLETION_PLAN.md §2a | Implement the three endpoints per the §2a Founder Dashboard backlog |

**Additional voids worth batching** (below the top-11 line because they're either single-caller minor pages or plausibly acceptable as-is):
- `/api/admin/agent-fleet` (rule `/api/admin/agent-fleet/*` exists but doesn't match bare path — `www/admin/agent-fleet-detail.html:317`, `agent-fleet.html:483`). Also 4 similar splat/bare-path gaps across the file.
- `/api/admin/outreach` (`www/outreach-engine-api.js:1523`) — matches Phase 6 outreach triage.
- `/api/bgcheck/initiate` (`www/providers-settings.js:773`, `providers.js:6190`) — BGC feature.
- `/api/clover/disconnect`, `/api/square/{connect,disconnect}`, `/api/pos/{inspection,receipt-delivery,session}` — POS integrations, likely dark.
- `/api/escrow/create` (`www/stripeutils.js:97`) — escrow lifecycle piece, may be superseded by care-plans flow. **Money-adjacent → belongs to Phase 1 triage.**
- `/api/privacy-request` (`www/data-rights.html:235`) — GDPR-adjacent, low-traffic but compliance-relevant.
- `/api/notify/urgent-update` (`www/providers.js:3580`), `/api/maintenance-reminders` (`www/providers.js:11420`) — provider notifications.
- `/api/provider/{availability, blocked-time, profile/publish, push/subscribe, push/unsubscribe, referral-codes}`, `/api/push/vapid-key` — provider surface completeness.
- `/api/shop/book`, `/api/shop/profile/` — booking widget SaaS surface.

Full list in `PHASE0_RAW.json` under `sectionA.frontendToVoid`.

---

## HIGH — silent data bug (2 — era mismatch only; bare-namespace flags all FP)

**Bare-namespace check: both 2026-07-16 flags are FALSE POSITIVES** (documented for calibration, no action):
- `www/signed-agreements.html:457` — `k === 'supabase.auth.token'` is a localStorage-key string literal, not a namespace call.
- `www/signup-provider.html:1044` — inline prose in a code comment.

The real car-club-member.html instance was fixed 2026-07-14 (commit `d038749`); no remaining live occurrences.

**Era mismatch — punch-era `club_reward_rules` still referenced** (22 hits across 4 files):
- `netlify/functions/car-clubs.js` — the `/my-rewards` handler at `:308` reads `club_reward_rules`. Documented in the CAR_CLUB_COMPLETION_PLAN.md DIRECTION CHANGE as "on the wrong track" post-2026-07-13 pivot to points-per-dollar.
- `supabase/migrations/20260703d_club_reward_rules.sql` — table definition (schema, keep for now; retire when the code path is decommissioned).
- `www/car-club-member.html:1103` — client renders `/my-rewards` output; same "wrong-track" note.
- Root twin `car-clubs.js` — stale copy (see Twins below).

Suggested fix: **defer to the Phase 1 Car Club revisit** (per the CAR_CLUB_COMPLETION_PLAN.md CORRECTION), not batched into Phase 0 fixes. The reads work; they just retrieve nothing useful in the new model. Not user-facing broken.

Related counts (context, not findings):
- `club_rewards` (points-era, correct) — 32 hits in 4 files.
- `car_club_redemptions` (legacy) — 7 hits in 3 files.
- `club_points_redemptions` (current) — 20 hits in 5 files.

---

## MEDIUM — noise / infra hygiene (48)

### Unrouted noise endpoints called from live code (6)

Called but no `_redirects` rule → 404 in browser console. Zero business impact today; classify each for later:

| Endpoint | Callers | Suggested class |
|---|---|---|
| `/api/config` | 3 (mcc-config.js, onboarding-provider.html, misc) | `stub-204` — treat as bootstrap-info hook |
| `/api/clover` (family: /clover/disconnect etc.) | 6 across providers.js | `remove-caller` — POS integration is dark |
| `/api/pos` (family: session/receipt/inspection) | 20 in providers.js | `remove-caller` — same |
| `/api/bgcheck/status` | 4 across providers-settings, providers.js | `implement` — BGC feature is live per plan §9a; caller drift |
| `/api/analytics/track` | 1 (analytics-tracker.js:26) | `stub-204` — front-end pings, no backend dependency |
| `/api/white-label/config` | 1 (white-label-client.js:108) | `remove-caller` — tenant feature is dark |

Note: `/api/car-club/{notifications, testimonials, recommended}` and `/api/concierge` ARE routed and resolve — they weren't the noise I expected. Left in the raw JSON for reference.

### Root vs `www/` stale twins (41 non-identical + 1 identical)

Full list in `PHASE0_RAW.json` under `sectionC.twins`. Highlights (by delta size):

- `members.html` — root=662k, www=851k, **delta 189k** — root is ~22% smaller, so materially stale.
- `admin.html` — root=138k, www=428k, **delta 290k** — the plan-doc reference "22,446-line admin portal" refers to `www/admin.html` at 428k; root is a legacy stub.
- `members-extras.js` — root=450k, www=532k, delta 82k.
- `providers.html` — root=595k, www=682k, delta 86k.
- `providers.js` — root=569k, www=631k, delta 62k.
- `sw.js` — **v104 vs v118** (14 versions behind; already flagged 2026-07-14).

None of these root files are served by Netlify (publish dir is `www`, confirmed in `netlify.toml`). Cleanup path: delete the root twins in a single follow-up commit; if any external tooling still reads from root, that's a follow-up problem. Retains a small risk that some legacy Replit build path still touches root — verify by grep for hardcoded absolute paths before deleting.

Suggested fix: not this pass; batch a "retire root twins" commit as part of Phase 6 cleanup.

### STATIC_ASSETS retrospective (informational)

`www/sw.js` `STATIC_ASSETS` currently lists 44 entries. Files in the set (excerpt): `/index.html`, `/login.html`, `/members.html`, `/members-core.js`, `/members-extras.js`, `/members-packages.js`, `/members-settings.js`, `/members-vehicles.js`, `/members-care-guide.js`, `/members-push.js`, `/providers.html`, `/providers.js`, `/providers-bids.js`, `/providers-jobs.js`, `/providers-settings.js`, `/manifest.json`, `/supabaseclient.js`, and 27 more. Full list in raw JSON `sectionB.staticAssets`.

**Not audited retrospectively in this pass** — the git log cross-reference (commits touching STATIC_ASSETS files vs sw.js version bumps in the same commit) is a separate exercise. Standing rule (plan §8) applies going forward: any edit to a listed file → bump `CACHE_NAME` in the same commit.

---

## LOW — cleanup (21)

### Unrouted functions (helper-filtered)

21 functions in `netlify/functions/` with no `_redirects` route and no `-scheduled` / `-shared` / `-core` suffix (those suffixes were filtered as they're clearly not endpoints):

- **Agent/orchestration (11):** `agent-analyst`, `agent-cron-emitter`, `agent-fleet-runtime`, `agent-gatekeeper`, `agent-hunter`, `agent-matchmaker`, `agent-orchestrator`, `agent-promoter`, `agent-treasurer`, `dispute-resolver-background`. Likely all invoked via other functions or scheduled but not caught by the schedule regex. Mostly Phase 6 outreach/agent territory.
- **BGC (2):** `bgc-expiration-sweep`, `bgc-send-reminders`. Possibly cron.
- **Outreach (4):** `outreach-cleanup`, `outreach-cycle`, `outreach-cycle-background`, `outreach-followups`, `outreach-followups-background`. Phase 6 triage territory.
- **Social/transport (2):** `social-adapter-reddit`, `social-adapters`, `transport-scheduled-dispatch`. Same.
- **Utility (1):** `utils` — likely a shared helper file that shouldn't be at top level.

Suggested fix: hand-classify in a Phase 6 pass — most are likely `background` invocations or scheduled without the exports.config signature the script recognizes. `utils` may be misplaced.

### Orphan redirects: 0 found.

Every `_redirects` rule pointing at `/.netlify/functions/<name>` resolves to an existing function file. Clean.

### Non-splat rule gaps (5 estimated)

Rules with `/*` splat that don't also match the bare path — the `agent-fleet` example: rule `/api/admin/agent-fleet/*` covers `/api/admin/agent-fleet/foo` but not `/api/admin/agent-fleet` itself. Similar pattern likely exists for other splat rules; not enumerated exhaustively in this pass.

---

## What the script can't see

- **Dynamic URL construction:** `` fetch(`${apiBase}${route}`) `` where `route` comes from config or a variable. Captured in `sectionA.unresolvedFetches` but not resolved. **Any Phase 2/3 UI walk should flag "unexpected 404 in Network tab" — that's a manual signal that catches what static analysis misses.**
- **RLS-gated calls that return 200 with empty data:** static analysis says the route resolves; the response may be an authoritative empty list because RLS filtered everything. **Phase 5 (RLS spot-checks) catches these.**
- **Feature-flag-gated dead code:** an endpoint may be reachable in code but always short-circuited by a flag. Grep won't distinguish. **Phase 5's flag audit catches these.**
- **Sub-path dispatchers with non-standard shape:** functions using custom routers, event-name switching, or dynamic loading of handler modules. Script's dispatcher extraction is best-effort; misses some.

## Recommended sequencing for the fix batch (informational — do not act yet)

1. Batch 1 (CRITICAL, hides dead features): the 5 tenant/white-label + 4 fleet + 1 founder dashboard voids. Either implement or gate behind flag/feature-detect so the surfaces stop 404'ing.
2. Batch 2 (CRITICAL, security-adjacent): 2FA endpoint consolidation on providers.js.
3. Batch 3 (MEDIUM cleanup): retire root-level twins, drop caller for known-dark POS/clover/white-label endpoints, stub the noise ones.
4. Batch 4 (LOW): Phase 6-territory unrouted functions triage.

Era-mismatch and STATIC_ASSETS retrospective defer to Phase 1 Car Club revisit and separate git-log exercise respectively.

---

## Regenerating this report

```
node scripts/audit-integrity.js
```

Idempotent, ~1 sec. Re-run before every iOS build per the audit plan's regression-gate discipline.

---

## Bonus finds during Batch 2 (2026-07-16) — PostgREST FK-name embed class

Not surfaced by this script (the script grep-matches `/api/…` strings; PostgREST FK-name embeds are a different bug shape) but discovered when the "member sees 'No bids yet' despite one bid" bug surfaced against Chris's dress-rehearsal plan. **Class shape:** `.select('...profiles!<constraint_name>(...)')` where `<constraint_name>` references an FK whose target table is `auth.users`, not `profiles` — or references a constraint name that doesn't exist at all. PostgREST returns an error which the caller often swallows into an empty-data response.

Verified against `pg_constraint` in prod. **7 broken sites, all fixed in the commit that lands with this note** — two-query stitch pattern (fetch parent → collect ids → `profiles.select().in('id', ids)` → JS stitch), with `console.error` + 500-return where the primary query error was previously swallowed.

| # | Site | Broken constraint | Actual FK target |
|---|---|---|---|
| 1 | `netlify/functions/care-plans.js:139` | `plan_bids_provider_id_fkey` | `auth.users` |
| 2 | `www/admin.js:13999` | `provider_referral_codes_provider_id_fkey` | `auth.users` |
| 3 | `www/signup-loyal-customer.html:646` | `provider_referrals_provider_id_fkey` | `auth.users` |
| 4 | `netlify/functions/vehicle-verify.js:307` | `registration_verifications_user_id_fkey` | `auth.users` |
| 5 | `netlify/functions/vehicle-verify.js:380` | `rides_member_id_fkey` | `auth.users` |
| 6 | `www/providers-core.js:735` | `reviews_member_id_fkey` | *(doesn't exist)* |
| 7 | `netlify/functions/car-clubs.js:370` | `club_memberships_member_id_fkey` | *(doesn't exist)* |

**OK embeds retained** (target-table matches embed): `booking.js:101`, `car-clubs.js:1054`, `vehicle-verify.js:684` (`insurance_verifications_user_id_fkey` → `profiles` ✓), `admin-data.js:60`, `community-board.js:57`, `providers-jobs.js:1167`, `providers-bids.js:91`, `providers.js:1444`, `supabaseclient.js:374`.

**Standing rule for future PostgREST embeds:** any `.select('!<fk_name>(...)')` **MUST be verified against `pg_constraint`** before shipping. Query pattern:
```sql
select conname, conrelid::regclass, pg_get_constraintdef(oid)
from pg_constraint
where conname = '<fk_name_from_embed>';
```
If the FK's target table (from `pg_get_constraintdef`) doesn't match the embed's parent table, PostgREST returns "Could not find a relationship between … and …" — often silently in swallowed-error callers.

**Audit script enhancement (future):** add a Section D that greps embed constraint names and cross-checks against a hardcoded `pg_constraint` snapshot (rebuild the snapshot on schema changes). Would automate this bug class. Not this pass — deferred to a Phase 0 v2.

---

## Batch 2 resolution log (2026-07-16)

### Commit A — route/noise triage
- `www/providers-settings.js` — bgcheck initiate rewired `/api/bgcheck/initiate` → `/api/provider/initiate-background-check` (existing function). Status widget + report viewer hidden with pending-integration messages (BGC tables exist but are 0-rows in prod — reinstate when Checkr integration lands).
- `netlify/functions/car-clubs.js` — added `my-club` dispatcher alias (wraps `my-provider-clubs`, reshapes to `{club: clubs[0]}`) + three 200-empty stubs (`notifications`, `testimonials`, `recommended`) to kill console-noise 404s without touching callers.
- `www/mcc-config.js` — skip `/api/config` fetch entirely, dispatch `mcc-config-loaded` immediately with defaults (fetch always failed → caught → defaults; net effect unchanged, one fewer 404).
- `www/analytics-tracker.js` — no-op'd `track()` until `/api/analytics/track` ingest handler ships.
- **SW bump:** v120 → v121 (providers-settings.js in STATIC_ASSETS).

### Commit B — copy/UX batch (5 items from BACKLOG.md)
- **B5** "Care Plans" → "Service Requests" in member UI: nav (members.html:1108), page header + subtitle + loading empty state + AI helper copy + button labels + vehicle-photos hint copy; `en.json` values for `carePlans`, `carePlansSubtitle`, `carePlansLoading`, `carePlansEmpty`, `cpUntitledPlan`, `cpLoadingDetail`. Non-English locales left for translator refresh. Internal `care-plans` route/section id UNCHANGED. `care-plans-count` badge semantic verified correct (Task #284 already counts pending-bid + requires_payment plans, not just plans).
- **B6** Maintenance Packages nav hidden for zero-package members: `nav-item-packages` id added to members.html:1107, hide logic appended at end of `loadPackages()` in members-core.js. Fail-open (nav stays visible on error).
- **B7** Member bid card provider name: `members-care-plans.js:307` and `:421` now fall back to `full_name` before "Provider" placeholder. Real providers without `business_name` populated now show their name.
- **B8** job-board.html countdown timezone fix: Supabase returns `bid_closes_at` as `"YYYY-MM-DD HH:MM:SS.SSS+00"` (space, not `T`). Safari (and some engines) drop the timezone offset and parse as local time → ~24h drift. `formatCountdown` now normalizes to ISO 8601 by swapping the first space for `T` before parsing.
- **B9** `formatValue` helper already returns `$N–$M`; six call sites in job-board.html were prepending another `$` (`$${formatValue(...)}` → `$$2–$5`). Stripped the extra `$` at all 6 call sites (single replace_all edit).
- **SW bump:** v121 → v122 (members.html + members-core.js in STATIC_ASSETS).
