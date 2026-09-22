# Session run sheet — 2026-09-22

*iOS resubmission session. Chronological record of what shipped, in the order it landed.*

## Phase 0 — Read-only recon

Turned the plan's `[UNKNOWN]`/`[INFERRED]` items into a verified blocker list. Two pivots:

### Pivot 1 — Prior rejection wording → is Item 2.1 (founder commissions) HARD?

- Pulled ASC record via ES256 JWT signed with `AuthKey_BUXJKGV927.p8` + issuer `c27ef061-1e34-4eb5-a427-bedbf841e5cb`.
- **Confirmed by Jordan mid-session: Apple sent a Guideline 2.1 "Information Needed" letter for a limited-history developer account — not a data-handling rejection.**
- **Verdict:** Item 2.1 (founder-commission preservation) **stays SOFT**, deferred to post-submission hardening.

### Pivot 2 — Sign in with Apple (Guideline 4.8) → HARD if Facebook auth is exposed and SIWA is absent?

- Confirmed all three third-party sign-ins are user-visible: Apple `www/login.html:1035`, Google `:1041`, Facebook `:1050`.
- Confirmed `com.apple.developer.applesignin = Default` in `ios/App/App/App.entitlements` + Supabase OAuth flow wired at `onboarding-provider.html:2471`, `onboarding-member.html:1771`, `www/index.html:2955`, and the iOS mirror at `ios/App/App/public/index.html:2278,2950`.
- **Verdict:** **RESOLVED.** SIWA is a first-class option; Apple 4.8 satisfied. Not a HARD blocker.

### Phase 0.6 iOS submission mechanics — inventory

- Bundle ID `com.zanetisholdings.mycarconcierge` — confirmed in `project.pbxproj`.
- `MARKETING_VERSION 1.1.0`, `CURRENT_PROJECT_VERSION 17` (both Debug + Release) — bump needed before archive.
- `IPHONEOS_DEPLOYMENT_TARGET 14.0` — flagged raise to 15.0 (SOFT).
- `PrivacyInfo.xcprivacy` present at `ios/App/App/` — RESOLVED.
- App icon set (1024 universal), launch storyboard — RESOLVED.
- Screenshots — LIKELY MISSING/off-repo — flagged for pre-submission capture.
- Push entitlement `aps-environment = production` declared — APNS `.p8` presence in ASC needs off-repo verify.
- AASA served with correct Content-Type per netlify.toml — RESOLVED.

Phase 0 recon report captured in a prior turn.

---

## Phase 1 — HARD blocker fixes, three-in-one commit

**Commit `5e297091366ad9e4c27e8df45868f2c8b000dc2a`** — deployed `6ab2c84666aedd0008a34019` at 2026-09-22T18:26:51Z (Netlify build gated by `npm test`, provider-alerts live block passed).

### 1.1 — Delete-account BUTTON works end-to-end (Guideline 5.1.1(v))

Root cause: server (`account-delete.js:57-70`) requires `{ password }` in the body and re-verifies via `signInWithPassword` (stolen-JWT defense); client sent no password → every tap returned 400.

Fix scope — CLIENT-only, password re-entry KEPT (security-model preserving):
- `www/members.html` — added a password input to the delete-account modal.
- `www/providers.html` — same shape.
- `www/members-core.js` — `openDeleteAccountModal()` gates the submit button on DELETE typed AND password non-empty; `confirmDeleteAccount()` reads password and includes it in the POST body.
- `www/providers-core.js` — same shape.

### 1.2 — Community-contribute hidden on iOS (Guideline 3.1.1)

The community-contribute button at `www/members-core.js:3724` invoked `openContributeModal()` which mounted in-app Stripe Elements card entry for a peer-to-peer donation (not 3.1.3(b) physical services) — Apple 3.1.1 hard-prohibits.

Fix:
- `www/members.html` — extended `applyMccFeatureGates()` to detect Capacitor iOS and force-set `crowdfunding_enabled = false`, hiding both the Community Board tab and panel.
- `www/members-core.js` — belt+suspenders check at the top of `openContributeModal()` that toasts users to the web if somehow reached on iOS.

Also inventoried other in-app Stripe Elements mounts (upsell, care-plan, escrow-card) — all 3.1.3(b) physical services or already gated by prior retirement logic.

### 1.3 — Native route parity for reachable dead endpoints (Guideline 2.1)

Original 0.4 recon flagged missing redirects for `/api/2fa/send-code|verify-code`, `/api/apple-pay/*`, `/api/escrow/*`. Recon revealed handler functions don't exist in `netlify/functions/`, so "add redirects" wouldn't fix anything.

Followup recon on reachability:
- Apple Pay + escrow create/confirm/release — inside the RETIRED escrow flow (`members-packages.js:3849-3868` PACKAGE-ESCROW RETIRED gate) — dead code, not reachable.
- SMS 2FA — reached from login.js's SMS-fallback branch. Verified `auth.mfa_factors`: **0 SMS enrollments**, 1 unverified TOTP. `pending2faUser` variable never assigned anywhere. Entirely orphaned dead code.
- Escrow refund button — reachable from `members-packages.js:2641` "Request Refund" CTA on package cards.

Fix — hide the reachable dead paths:
- `www/login.js` — removed the ~220-line SMS-2FA block (state vars, send/verify/resend/back functions).
- `www/login.html` — removed the `twofa-screen` div; kept `totp-screen`.
- `www/members-packages.js` — replaced "Request Refund" button with a Contact Support mailto pointer (`mailto:support@mycarconcierge.com?subject=Refund%20request%20-%20package%20${packageId}`).
- `www/sw.js` — CACHE_NAME v151 → v152.

---

## Bid-report button (Apple 1.2 soft-edge close)

**Commit `336fa7a03f3da749d625c99979adcc19240645c6`** — deployed `6ab2c982fba7800008de060f` at 2026-09-22T18:32:02Z.

Added a subtle right-aligned ghost "Report" button on each bid card (`www/members-packages.js:2506`), matching the styling of the reviews-report button. Payload: `contentType='bid', contentId=bid.id, reportedUserId=bid.provider_id`. `sw.js` v152 → v153. Closes the last UGC surface that only had indirect reporting (via messaging).

---

## Demo account seed enrichment

**Commit `72f895f25d0e98c2a461051023808990fa2fd659`** — no deploy needed (seed is a script, not part of the served bundle).

Verified `DEMO_EMAIL=demo@mycarconcierge.com` exists in Supabase Auth (id `dc595485-4a0d-44d7-990b-902daec5b973`), profile has `is_also_member=true` + `is_also_provider=true` so both portals are reachable.

Added four new idempotent seed helpers to `seed-appreview-demo.js` and ran `node --env-file=.env seed-appreview-demo.js` against prod:

- **Pending bid** on the existing "Front Brake Pads & Rotors" open package — $220 from Roadside Rescue Auto (id `e2eb6a0c-…`).
- **Accepted package** — "Wiper blades + cabin air filter", $85 accepted bid from Roadside Rescue (pkg `afcc2041-…`, bid `9cd2810d-…`).
- **Completed care plan** — "60,000-mile Service" status=completed + `plan_bids` accepted + `care_plan_completions` row with the h+i identity snapshots (`member_name_snapshot='MCC Demo'`, `provider_business_name_snapshot='Roadside Rescue Auto'`), $380 (plan `75a3bb46-…`, completion `7d2738db-…`).
- **Provider review** — 5★ published review from MCC Demo about Roadside Rescue Auto (id `4f40e39d-…`, `package_id=null`, `review_text="Fast, honest work…"`).

All idempotent (skip-if-exists). Safe to re-run.

Flagged inline in the seed script: `providers-core.js:906` `loadMyReviews` was reading from a non-existent `reviews` table — the review row is inserted anyway, ready for the query fix (see below).

---

## SMOKE-test residue cleanup

Read-only preview identified 7 SMOKE-suffixed packages + 1 lowercase duplicate "Oil change" on the demo member. Zero enrichment artifacts matched the delete patterns.

Executed the deletion in one MCP transaction:
- DELETE 6 rows in `concierge_jobs` (RESTRICT parent, all status='scheduled', tied 1:1 to the SMOKE brake packages; verified 0 downstream `ride_cancellations`).
- UPDATE 8 `maintenance_packages` rows SET `accepted_bid_id = NULL` (breaks the NO ACTION FK on packages→bids).
- DELETE 6 bids referencing SMOKE packages.
- DELETE 8 maintenance_packages (7 SMOKE + 1 duplicate Oil change).

Post-verify: 0 SMOKE rows remain, all 6 enrichment artifacts intact. Final demo package list: 5 clean-titled entries across open + accepted states.

(Direct DB cleanup, no repo commit.)

---

## Review-query fix

**Commit `edcfc0d50ffaba8a07a7bb09b9cfeba12e83b70f`** — deployed `6ab2d06f72cc2a0008da4fd0` at 2026-09-22T19:01:35Z.

Bug: `providers-core.js:906` executed `.from('reviews').select('*, maintenance_packages(title)')` — but the `reviews` table doesn't exist in prod. Only `provider_reviews` does. PostgREST returned `PGRST116`/`42P01`, the error was silently swallowed, and `myReviews` always ended up `[]`. The provider "My Reviews" tab rendered "No reviews yet." **unconditionally, for months**.

Fix:
- `www/providers-core.js:906` — `.from('reviews')` → `.from('provider_reviews')`.
- `www/providers-core.js:958` — `${r.comment ? ...}` → `${r.review_text ? ...}` (both the conditional and the interpolated value; the actual column name in `provider_reviews`).
- `www/sw.js` — CACHE_NAME v153 → v154.

Verified live in the served bundle: fetched `https://www.mycarconcierge.com/providers-core.js?v=<cachebust>` — zero occurrences of `.from('reviews')` remain, the fixed `.from('provider_reviews')` and `${r.review_text ? ...}` are present. Seeded review `4f40e39d-…` now renders on the demo provider's "My Reviews" tab with the per-review Report button visible.

Third UGC report+block surface active for Apple 1.2 — alongside messaging chat header and bid card.

---

## Summary — 4 commits, 3 deploys, 1 prod DB transaction, 1 seed script run

| # | Commit | Deploy | Purpose |
|---|---|---|---|
| 1 | `5e29709` | `6ab2c846…` | Phase-1 HARD blockers: 1.1 delete button + 1.2 iOS 3.1.1 gate + 1.3 dead-route cleanup |
| 2 | `336fa7a` | `6ab2c982…` | Bid-card Report button (Apple 1.2 soft-edge close) |
| 3 | `72f895f` | (no deploy) | Seed enrichment — pending bid, accepted package, completed care plan + snapshots, published review. Ran against prod. |
| 4 | `edcfc0d` | `6ab2d06f…` | Review-query fix: point loadMyReviews at `provider_reviews.review_text` |

Plus one out-of-band DB transaction that deleted 8 maintenance_packages + 6 bids + 6 concierge_jobs of SMOKE-test residue on the demo account.

All Phase-0 Apple-facing HARD blockers → shipped or resolved. `origin/main` at `edcfc0d`. Remaining before resubmission = off-repo mechanics only.
