# MCC — iOS Submission Readiness Plan
*Drafted 2026-09-22. Companion to HANDOFF-2026-09-22.md.*

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
(`com.zanetisholdings.mycarconcierge`). Prior rejection text is the single most
valuable input — it converts guesses into a checklist.

**0.2 Guideline 3.1.1 exposure** [INFERRED]
A `docs/apple-guideline-3.1.1-response-draft.md` exists and the driver-fundraising
section is deliberately phase-hidden (`data-driver-phase-out`). Confirm: is 3.1.1
(in-app purchase / external fundraising) an active review issue? Inventory EVERY
fundraising/donation/external-payment surface (Wefunder card, support-donation,
package crowdfund, driver fundraising) and confirm each is either removed from the
native bundle or IAP-compliant. This is the highest-uncertainty Apple risk.

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
features.

**Output of Phase 0:** a confirmed, verbatim blocker list that supersedes the
INFERRED items below. Do not start Phase 1 builds until this is in hand.

---

## Phase 1 — HARD blockers (fix or Apple rejects)

**1.1 Account-deletion BUTTON works end-to-end** — Guideline 5.1.1(v) [CONFIRMED]
The `/api/account/delete` endpoint was fixed and verified in prod on 09-22. BUT
the in-app button still fails: the client posts no `password`, the server requires
one, so every tap returns 400. **Apple tests the actual button.** A working
endpoint an unreachable UI can't call is still a rejection.
- Fix: add the password field + confirmation to the delete flow in
  `providers.html` / `members.html` (client sends what `account-delete.js`
  requires), OR adjust the handler's auth contract if password re-entry isn't
  desired. Decide the UX first (password re-entry vs. typed-DELETE confirm).
- Verify: run the button on a real device/build through to a successful deletion.
- Depends on: nothing. **This is the #1 pre-submission task.**

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
- Fix: FKs CASCADE → SET NULL on the founder tables; add `founder_deleted_at`;
  snapshot founder name onto `founder_commissions` / `founder_payouts`; teach
  `account-deletion-core.js` to anonymize instead of delete.
- Discipline: full h+i playbook (recon → dry-run → apply watched → E2E on a
  throwaway founder account → rollback in hand).
- Depends on: nothing. Unblocks the 1099 work (can't build a tax form from
  deleted data).

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

## Phase 4 — Hygiene / tech debt (HYGIENE; before it grows)

**4.1 Deploy-gate hygiene** — [CONFIRMED, from 09-22]
`netlify.toml` wires `npm test` into the build gate, and it includes live-DB tests
that hit prod (create/delete auth users, insert rows). One (`provider-alerts-rls`)
silently self-skipped for ~4 months, then failed the build when un-masked.
- Fix: audit the suite for other live-DB tests; extract them into
  `npm run test:live` out of the deploy gate; consider a dedicated test project
  instead of prod.

**4.2 Household / Part B rebase** — [CONFIRMED, from 09-22]
The Household/Part B branch also touches `account-deletion-core.js`. It must be
rebased on current `main` (which now carries h+i + the founder-commission fix once
2.1 lands) and re-reconciled on that file before it merges — otherwise it clobbers
or conflicts with the deletion-core changes.
- Sequencing note: if 2.1 (founder commissions) also edits
  `account-deletion-core.js`, land 2.1 first, then rebase Household on top.

---

## Critical path to submission

The minimum set that gates an Apple submission:

1. **Phase 0** (recon) — turns the INFERRED items into a real checklist.
2. **1.1** (delete button) — the one confirmed HARD blocker.
3. Whatever **Phase 0.2 (3.1.1)** and **0.4/0.5 (completeness)** surface as HARD.

Everything in Phases 2–4 is strongly advisable but not, on current evidence, a
review gate — **pending Phase 0 confirming none of them is Apple-facing.** In
particular, if Apple's prior rejection cited account-deletion data handling, 2.1
(founder commissions) could jump from SOFT to HARD.

**Recommended execution order:**
Phase 0 → 1.1 → (any HARD items 0 surfaces) → 2.1 → 2.2 → 3.1 → 3.2 → 4.1 → 4.2
→ 2.3 → 2.4.

## Definition of "ready to submit"

- [ ] Delete button works on a real device build, end-to-end (5.1.1(v)).
- [ ] Phase 0 blocker list resolved (3.1.1 clear, no dead routes, native parity).
- [ ] Privacy label + deletion disclosure accurate.
- [ ] No sole-copy user data destroyed on deletion (2.1, 2.2 landed).
- [ ] Shipped consent copy matches code behavior (3.1 landed).
- [ ] Full test suite green in the Netlify build; no live-test flakiness gating.
- [ ] Fresh archive built, mirrors regenerated (`ios:prep`), uploaded to TestFlight.

---
*Confidence caveat: items tagged [INFERRED]/[UNKNOWN] rest on code/context, not a
verified App Store Connect record. Phase 0 exists to make this plan authoritative;
until it runs, treat the HARD/SOFT split as provisional.*
