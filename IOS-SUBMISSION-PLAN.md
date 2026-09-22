# MCC — iOS Submission Readiness Plan
*Drafted 2026-09-22. Companion to HANDOFF-2026-09-22.md.*
*Revised 2026-09-22: added Phase 0.6 (iOS submission mechanics), SIWA as potential second HARD blocker, stale-draft note in 0.2, recommended path for 1.1, two-call clarification and SOFT/HARD branch for 2.1, 4.1 reclassed SOFT, new 2.5 (rollback DDL housekeeping), new Phase 5 (prior-rejection response pack), screenshot/video verification for 1.1, parallelization note in critical path.*

## How to read this

This plan sequences everything that should be resolved before submitting My Car
Concierge to the App Store. It is built from work confirmed in the 09-21/09-22
sessions plus the records/payouts recon. It is **not** yet confirmed against the
live App Store Connect record — that's Phase 0.

Each item carries a confidence tag:
- **[CONFIRMED]** — verified this session, state is known.
- **[INFERRED]** — strongly implied by code/context; recon to confirm exact state.
- **[KNOWN GAP]** — confirmed missing/broken, scope understood.
- **[UNKNOWN]** — needs Phase 0 recon to even scope.

And a blocker class:
- **HARD** — Apple will (or very likely will) reject without it.
- **SOFT** — quality/legal/data risk; fix before real users, not necessarily a
  gate for review approval.
- **HYGIENE** — tech debt; do before it grows, not a submission gate.

Everything is READ-ONLY until you approve each build step. Every schema/prod
change follows the discipline proven on 20260921h: recon → transaction-wrapped
dry-run on real data → apply watched → behavioral E2E → rollback DDL in hand.

---

## Phase 0 — Submission recon (do first, read-only)

The rest of this plan is only as complete as our picture of what Apple actually
requires here. Close that gap before building anything.

**0.1 App Store Connect state** [UNKNOWN]
Pull the current record: app status, last submission + any prior rejection
reasons (verbatim), build/archive state, TestFlight status, bundle id
(`com.zanetisholdings.mycarconcierge` — asserted, not verified). Prior
rejection text is the single most valuable input — it converts guesses into a
checklist. **The SOFT/HARD status of Item 2.1 (below) hinges on whether that
rejection cited account-deletion data handling; do not decide 2.1's phase
until this is in hand.**

**0.2 Guideline 3.1.1 exposure** [INFERRED]
A `docs/apple-guideline-3.1.1-response-draft.md` exists and the driver-fundraising
section is deliberately phase-hidden (`data-driver-phase-out`). Confirm: is 3.1.1
(in-app purchase / external fundraising) an active review issue? Inventory EVERY
fundraising/donation/external-payment surface (Wefunder card, support-donation,
package crowdfund, driver fundraising) and confirm each is either removed from the
native bundle or IAP-compliant. This is the highest-uncertainty Apple risk.

**Also read `docs/apple-guideline-3.1.1-response-draft.md`.** The 09-21 handoff
flagged the Sept-18 wording as STALE — superseded by PRs #23/#24/#26 which
changed the flow it describes. The expected output of 0.2 is to **invalidate or
rewrite that draft**, not just confirm the surfaces are clean.

**0.3 Privacy & data** [UNKNOWN]
Confirm App Privacy "nutrition label" accuracy, the account-deletion disclosure,
the Facebook data-deletion callback status, and that the privacy policy / ToS URLs
resolve. Account deletion (5.1.1(v)) intersects here.

**0.4 Native bundle parity** [INFERRED]
Confirm the iOS public bundle's `_redirects` covers all `/api/*` routes the app
calls — the standing note flagged `/api/car-club/*` specifically. A route the app
calls that 404s in the native build is a completeness (2.1) risk.

**0.5 Completeness sweep** [INFERRED]
Grep the native build for dead/dark routes the UI reaches (the `receipt-pdf` dark
route, any car-club orphan routes). Apple 2.1 rejects apps with visibly broken
features. Concrete grep: `grep -R "/api/" ios/App/App/public/` cross-referenced
against `www/_redirects` + `netlify/functions/*`. Also check for buttons/links
that render but 404 on tap.

**0.6 iOS submission mechanics** [MOSTLY UNKNOWN — feeds Phase 0, does NOT bypass it]
These items live outside this repo's Netlify/Supabase focus and are easy to
forget. Each MUST be recon'd; several are potential rejections in their own
right. Every tag below is honest — most are UNKNOWN or INFERRED, none are done
today:

- **Reviewer test account** [INFERRED — `seed-appreview-demo.js` present but untracked].
  Confirm the seed script creates working credentials AND lands the demo user
  in a feature-rich, non-empty state (populated bids, at least one completed
  care plan, a preserved-not-empty dashboard). Apple reviewers who log into
  an empty account often reject on 2.1. Capture the credentials for
  submission notes.
- **Version bump** [INFERRED — 09-21 handoff: "iOS build 17 built but not installed"].
  Target `CFBundleVersion` (build number) and `CFBundleShortVersionString`
  (marketing version) both need to increment against the last submission.
  Verify what's live on TestFlight/App Store now and pick the delta.
- **MinimumOSVersion** [KNOWN GAP — 09-21 handoff: raise 14.0 → 15.0 before Spring 2027].
  Update in the Xcode project + Info.plist. Apple has been enforcing minimum
  OS version deprecations more strictly through 2026.
- **PrivacyInfo.xcprivacy manifest** [UNKNOWN].
  Apple began enforcing privacy manifests more strictly in 2024+, especially
  for apps using "required reason" APIs (UserDefaults, File timestamp, System
  boot time, Disk space, Active keyboards). Confirm the file exists at the
  right path and declares every SDK's reason. Missing manifest = warning at
  minimum, rejection at worst.
- **Icons, launch screen, screenshots** [UNKNOWN].
  Icon set complete for every required size; launch screen present and not
  the default; App Store screenshots for every currently-supported device
  size (6.7", 6.5", 5.5"). Old screenshot sizes for devices Apple has
  deprecated are a rejection reason.
- **Sign in with Apple (Apple 4.8)** [UNKNOWN — POTENTIAL SECOND HARD BLOCKER].
  If the app offers ANY third-party sign-in (Facebook is present in this
  codebase — Facebook data-deletion callback is referenced in
  `account-deletion-core.js`), Apple 4.8 requires **Sign in with Apple** as
  an option OR one of a narrow list of alternatives. If SIWA is not wired
  and Facebook auth is user-visible, this is a HARD rejection on par with
  1.1. Recon: search for `authorizationController` / `ASAuthorizationAppleIDProvider`
  in `ios/`; search for `signInWithApple` in `www/`; check the login UI.
- **Push notification capability** [INFERRED — `concierge-push-notifier-scheduled` exists in netlify.toml].
  If the app declares push (aps-environment entitlement), a valid APNS `.p8`
  auth key must be uploaded in App Store Connect. Confirm the key is
  present, not expired, and matches the team/key id used at runtime.
- **AASA (Apple App Site Association)** [INFERRED].
  Already served with correct Content-Type per `netlify.toml:271-274`.
  Confirm the domains list is current and universal-link entries match the
  app's `associatedDomains` entitlement.

**Output of Phase 0:** a confirmed, verbatim blocker list that supersedes the
INFERRED items below. Do not start Phase 1 builds until this is in hand.

---

## Phase 1 — HARD blockers (fix or Apple rejects)

**1.1 Account-deletion BUTTON works end-to-end** — Guideline 5.1.1(v) [CONFIRMED]
The `/api/account/delete` endpoint was fixed and verified in prod on 09-22. BUT
the in-app button still fails: the client posts no `password`, the server requires
one, so every tap returns 400. **Apple tests the actual button.** A working
endpoint an unreachable UI can't call is still a rejection.

- **Recommended path:** **KEEP password re-entry, fix scope is CLIENT-side only.**
  The handler at `account-delete.js:57-70` re-verifies the password via
  `anonSupabase.auth.signInWithPassword` — this is a deliberate defense
  against stolen-JWT deletion (an attacker with only a JWT can't wipe the
  account). Dropping password re-entry would be a security regression.
  Instead, add a password field + confirmation to the delete flow in
  `providers.html` / `members.html` so the client sends what the server
  already expects.
- **Verify:** Run the button on a real device / TestFlight build through to a
  successful deletion. **Capture a screenshot or short video of the working
  flow** — Apple reviewers strongly benefit from this in the resubmission
  notes when 5.1.1(v) is being re-evaluated.
- **Depends on:** nothing (implementation-wise). **This is the #1 pre-submission
  task.**

**1.2 Guideline 3.1.1 fundraising/IAP compliance** — [INFERRED, from Phase 0.2]
Everything Phase 0.2 turns up. Any donation/fundraising/external-payment surface
visible in the native app must be removed from the bundle or made IAP-compliant.
The driver-fund phase-out suggests this is already partly handled — confirm it's
*complete* across all surfaces, not just the driver card.
- Depends on: Phase 0.2 inventory.

**1.3 Native bundle route parity** — Guideline 2.1 completeness [INFERRED]
Any `/api/*` the app calls must resolve in the native `_redirects`. Fix gaps
(car-club routes flagged). Bump `CACHE_NAME` if cached JS is touched (standing
rule). Regenerate iOS/Android mirrors via `ios:prep`.
- Depends on: Phase 0.4.

**1.4 Sign in with Apple** — Apple 4.8 [INFERRED — pending Phase 0.6, POTENTIAL HARD BLOCKER]
If Phase 0.6 finds Facebook auth (or any third-party sign-in) exposed in the
iOS bundle AND Sign in with Apple is NOT wired, this becomes a HARD blocker
alongside 1.1. Apple 4.8 does allow narrow alternatives (Apple's own guideline
lists them), but "we have Facebook and nothing else" is not among them.
- Fix if HARD: add SIWA via `AuthenticationServices.framework` on iOS, or
  scoped-hide the Facebook option in the iOS bundle so Apple sees only
  email + supported alternatives.
- Depends on: Phase 0.6 recon.

---

## Phase 2 — Data-integrity & legal (SOFT; some Apple-adjacent)

These protect real users' records and your contractual/tax obligations. Not
classic review blockers, but 5.1.1(v) implies deletion must handle data
*correctly*, and #2.1 is a promise you've made in signed agreements.

**2.1 Founder commission preservation on account deletion** — [KNOWN GAP, HIGH]
The 09-22 recon found `account-deletion-core.js` **hard-deletes**
`founder_commissions` and `member_founder_profiles`. A founder closing their
account wipes commission history, YTD dashboard inputs, maturation dates, and the
data behind the contractually-promised **1099-NEC**. Same class of bug as the one
20260921h just closed — same fix pattern.

**SOFT/HARD status is an explicit branch decided by Phase 0.1:**
- If Phase 0.1 finds Apple's prior rejection cited account-deletion data
  handling (or 5.1.1(v) more broadly) → **2.1 becomes HARD**, must land
  before submission.
- Otherwise → **2.1 stays SOFT**, post-submission hardening. Ship 1.1 and
  submit; land 2.1 in the following release train.

Do not pre-decide it.

- **Fix scope — two anonymize-not-delete rewrites in `account-deletion-core.js`:**
  - Line **44**: `.delete().eq('founder_id', ...)` on `founder_commissions`
    → rewrite to update with `founder_id: null`, `founder_deleted_at: now`,
    and snapshot the founder's name / email onto the row.
  - Line **167**: `.delete().eq(...)` on `member_founder_profiles`
    → same treatment; snapshot the founder's identity before nulling.
- **Schema:** FKs CASCADE → SET NULL on both tables; add `founder_deleted_at`;
  add `founder_name_snapshot` (and perhaps `founder_email_snapshot`) on
  `founder_commissions` and `founder_payouts`; CHECK constraint that a row
  has either `founder_id` OR `founder_deleted_at`; BEFORE UPDATE trigger to
  stamp `founder_deleted_at` when `founder_id` is nulled (same pattern as
  20260921i).
- **Discipline:** full h+i playbook (recon → dry-run → apply watched → E2E on a
  throwaway founder account → rollback DDL in hand).
- **Depends on:** nothing (implementation). Unblocks the 1099 work (can't build
  a tax form from deleted data).

**2.2 Vehicle snapshot on completed jobs** — [KNOWN GAP, MEDIUM]
`vehicles` CASCADE-deletes on member deletion and no vehicle snapshot exists, so
warranty/tax records go anonymous ("your 2019 Subaru" → blank).
- Fix: `vehicle_year/make/model_snapshot` on `care_plans` (or completions),
  written once at completion time. Narrow schema + one write.

**2.3 receipt-pdf reads the h+i snapshots** — [KNOWN GAP, LOW]
`receipt-pdf.js` reads provider/member name via live FK (now nullable), falls back
to literal `'Provider'`/`'Vehicle'`, never consults the snapshots h+i wrote.
- Fix: code-only (~15-20 lines), read the completion snapshots as fallback.
- Mitigation: route is currently **dark** (no UI caller) — no user impact today.
  Cheap to do while touching the receipt path; not urgent alone.

**2.4 1099-NEC generation** — [KNOWN GAP, deferred]
Contracts promise a 1099-NEC for founding providers >$600/yr; no code builds it.
Not a submission blocker. Depends on 2.1 being fixed first. Scope as its own
feature later.

**2.5 Rollback DDL housekeeping** — [KNOWN GAP, hygiene-adjacent]
The h+i rollback DDL currently lives inline in `HANDOFF-2026-09-22.md`. That's
survives-the-session storage, not durable engineering discipline. If 2.1 lands
on top, the combined h+i+2.1 rollback story gets harder to reason about the
longer it stays informal.
- Fix: create `supabase/migrations/rollbacks/` and extract the h+i rollback
  as `20260921h_i_rollback.sql` (with the pre-flight abort guard intact).
  Mirror the same pattern for whatever 2.1 introduces at the time it
  migrates. Update the handoff to link out to the file instead of holding
  the DDL inline.
- Not a submission blocker; do it as a small cleanup alongside 2.1.

---

## Phase 3 — Disclosure & consent (SOFT; honesty of shipped copy)

**3.1 Section B — 3-day notice + `trial_end`** — [INFERRED, carried from 09-21]
Your live plan-consent copy (Section A, shipped) promises "3 days' notice by email
before the first charge." The code doesn't yet deliver it: the bid-accept hook
still sets `trial_end:'now'`. This gap makes shipped consent copy inaccurate.
- Fix: `trial_end` → now + 3 days; wire `customer.subscription.updated` to move
  the credit-lot `expires_at`; add the cancel-before-charge test-clock case.
- Note: before writing, confirm nothing in the master spec changed the disclosure
  mechanics (the 09-21 skim said it didn't).

**3.2 Plan-consent backfill guard** — [INFERRED, carried from 09-21]
Scheduled function flagging `provider_subscriptions` with
`status in ('active','trialing') AND terms_accepted_at IS NULL AND created_at >
2026-09-21`; one `admin_audit_log` entry per run. Mirrors the
`credit_ledger_drift_scheduled` pattern.

---

## Phase 4 — Hygiene / tech debt

**4.1 Deploy-gate hygiene** — [CONFIRMED, from 09-22] **SOFT (was HYGIENE)**
`netlify.toml` wires `npm test` into the build gate, and it includes live-DB tests
that hit prod (create/delete auth users, insert rows). One (`provider-alerts-rls`)
silently self-skipped for ~4 months, then failed the build when un-masked. A
flaky live-DB test bouncing a hotfix deploy during Apple's resubmission window
would be genuinely bad — hence SOFT, not HYGIENE.

- **Pre-submission (SOFT, narrow):** ensure no live-DB test can bounce a
  deploy. Audit the suite for other live-DB tests (`grep -l "SUPABASE_ANON_KEY\|admin.createUser\|admin.deleteUser" netlify/functions-tests/`).
  For each: either confirm it's a genuine unit test with no live dependency,
  or gate its live-block behind an explicit env flag (`RUN_LIVE_TESTS=1`)
  that Netlify's build doesn't set.
- **Post-submission follow-up (HYGIENE, larger):** extract live tests into
  `npm run test:live` out of the deploy gate entirely; consider a dedicated
  test project instead of prod. This is the architecturally correct fix but
  scoped bigger than a submission-window change.

**4.2 Household / Part B rebase** — [CONFIRMED, from 09-22] HYGIENE
The Household/Part B branch also touches `account-deletion-core.js`. It must be
rebased on current `main` (which now carries h+i + the founder-commission fix once
2.1 lands) and re-reconciled on that file before it merges — otherwise it clobbers
or conflicts with the deletion-core changes.
- Sequencing note: if 2.1 also edits `account-deletion-core.js`, land 2.1
  first, then rebase Household on top. Rebase can start now as a
  diff-reading task independent of when 2.1 finally lands.

---

## Phase 5 — Prior-rejection response pack [GATED on Phase 0.1 finding a rejection]

If Phase 0.1 turns up a prior rejection, resubmission benefits from a written
response citing exactly what changed and why the reviewer's specific concern is
addressed. Do not draft this until Phase 0.1 is in hand — the response depends
on the rejection's verbatim wording.

Contents when it exists:
- Direct quote of the rejection reason(s).
- Per reason: the specific code change (commit SHA, file:line), the behavioral
  verification (screenshot, video, log excerpt), and any policy citation
  supporting the new behavior.
- For 5.1.1(v) specifically: the working delete-button screenshot/video from
  1.1's verification step, plus a reference to the h+i migrations that made
  the underlying deletion safe.
- For 3.1.1: link to the `docs/apple-guideline-3.1.1-response-draft.md`
  rewrite from 0.2 (once written), or the fresh response if the draft was
  invalidated.

Section F from the 09-21 handoff ("evidence pack") is a related shape and its
scaffolding can be reused where relevant.

---

## Critical path to submission

The minimum set that gates an Apple submission:

1. **Phase 0** (recon) — turns the INFERRED items into a real checklist.
2. **1.1** (delete button) — the one confirmed HARD blocker.
3. **1.4** (Sign in with Apple) — POTENTIAL SECOND HARD BLOCKER pending Phase 0.6.
   If Facebook auth is user-visible and SIWA isn't wired, land it before submission.
4. Whatever **Phase 0.2 (3.1.1)** and **0.4/0.5 (completeness)** surface as HARD.
5. Whatever **Phase 0.6** surfaces as HARD (missing icons/screenshots for
   currently-required device sizes, missing PrivacyInfo.xcprivacy, missing
   push key, missing SIWA, etc.).

Everything in Phases 2–5 is strongly advisable but not, on current evidence, a
review gate — **pending Phase 0 confirming none of them is Apple-facing.** In
particular, if Apple's prior rejection cited account-deletion data handling, 2.1
(founder commissions) jumps from SOFT to HARD.

**Recommended execution order (with parallelization):**

Sequential critical path: Phase 0 → 1.1 → any HARD items Phase 0 surfaces
(1.4 SIWA, 0.2 3.1.1 fixes, 0.6 mechanics) → (submit here if 2.1 stays SOFT).

**Parallelizable alongside 2.1** (once 2.1 is decided HARD or SOFT):
- **3.2** — plan-consent backfill guard (new scheduled function, no file
  overlap with 2.1).
- **4.1** — deploy-gate hygiene, narrow pre-submission piece (edits in
  `netlify/functions-tests/`, no overlap with 2.1).
- **4.2** — Household rebase diff-reading (independent branch).
- **0.6 mechanics** — version bump, MinimumOSVersion raise,
  PrivacyInfo.xcprivacy verification, screenshots refresh (all
  iOS-project changes, no overlap with the Netlify/Supabase side).

Serialized after 2.1: **2.2** (vehicle snapshot — same discipline as 2.1),
then **2.3** (receipt-pdf snapshot fallback, code-only). **2.4** (1099-NEC)
and **2.5** (rollback DDL housekeeping) are the final trailing items.

**Presentation order in this doc is not execution order** — the phases are a
grouping for reasoning, not a schedule.

## Definition of "ready to submit"

- [ ] Delete button works on a real device build, end-to-end (5.1.1(v)),
      screenshot/video captured.
- [ ] Phase 0 blocker list resolved (3.1.1 clear, no dead routes, native parity).
- [ ] Phase 0.6 iOS mechanics resolved: reviewer test account works and is
      feature-rich; version numbers incremented; MinimumOSVersion current;
      PrivacyInfo.xcprivacy present; icons/launch/screenshots current;
      SIWA wired if Facebook auth is exposed; push `.p8` in ASC; AASA current.
- [ ] Privacy label + deletion disclosure accurate.
- [ ] No sole-copy user data destroyed on deletion (2.1 if HARD, otherwise
      queued for post-submission; 2.2 as scope allows).
- [ ] Shipped consent copy matches code behavior (3.1 landed).
- [ ] Full test suite green in the Netlify build; no live-test flakiness gating
      (4.1 narrow pre-submission piece done).
- [ ] Fresh archive built, mirrors regenerated (`ios:prep`), uploaded to TestFlight.
- [ ] Prior-rejection response pack drafted if applicable (Phase 5).

---
*Confidence caveat: items tagged [INFERRED]/[UNKNOWN] rest on code/context, not a
verified App Store Connect record. Phase 0 exists to make this plan authoritative;
until it runs, treat the HARD/SOFT split as provisional.*
