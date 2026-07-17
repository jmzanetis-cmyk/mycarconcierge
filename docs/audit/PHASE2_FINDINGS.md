# Phase 2 Findings — Member Portal Walk

**Started:** 2026-07-20 (My Vehicles surface)
**Method:** per the MCC_AUDIT_PLAN.md Phase 2 spec — Jordan drives every sidebar surface on members.html + satellite pages with a per-surface checklist; Claude traces failures in code live. Findings ranked CRITICAL → HIGH → MEDIUM → LOW → CLEAN verdicts.
**Related:** [MCC_AUDIT_PLAN.md](../MCC_AUDIT_PLAN.md) Phase 2. Cross-file findings that touch Car Club get logged in `CAR_CLUB_COMPLETION_PLAN.md` per the standing rule.

---

## Summary counts

| Severity | Count | Status |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 1 | 1 FIXED (Finding #1 — deployed 2026-07-20) |
| MEDIUM | 2 | 2 open (Findings #2, #3) |
| LOW | 0 | — |
| CLEAN verdicts | 0 | Vehicles walk in progress; verdicts logged when surfaces are cleared. |

**Boot-hardening batch (queued):** Findings #3 + the pre-existing `showSection` race (plan doc §1 line 35 context) belong to the same "auth guard / session-restore / navigation race" class. Batch together in a follow-up commit rather than as one-offs.

---

## Finding #1 — HIGH · FIXED 2026-07-20 · `vehiclePhotos` duplicate-variable SyntaxError

**Reproduction:** open members portal in Safari, navigate to My Vehicles (or Recalls, or Verification). Console shows: `SyntaxError: Can't create duplicate variable: 'vehiclePhotos'`.

**Root cause:** `members-vehicles.js` is loaded TWICE:
1. Statically at page init via `<script src="members-vehicles.js?v=20260213">` at `www/members.html:8727`.
2. Dynamically on section-switch via `loadModule('vehicles')` at `www/members-core.js:2795` (called from `loadModuleForSection('vehicles')` at :2789, which is invoked from `showSection()` at :2861 for the vehicles / my-vehicles / recalls / verification sections).

The static load succeeds and defines `let vehiclePhotos = []` at `members-vehicles.js:1969` in the top-level module scope. The dynamic re-injection tries to define the same `let` again → SyntaxError on parse → the re-injected script's evaluation aborts entirely.

**What functionality did the killed second-load take down?** Nothing that wasn't already provided by the first (static) load. `members-vehicles.js` is designed to be loaded once; its top-level `let vehiclePhotos = []` is one-time module init, not per-section-show state. The functions defined in the file (`renderVehiclePhotosGrid`, upload handlers, etc.) are already in the global scope from the successful first load. So the practical damage is:
- **Every user session sees a visible SyntaxError in console** on first navigation to vehicles/recalls/verification.
- **`loadModule('vehicles')` may or may not settle cleanly** depending on browser — Safari fires `onload` for scripts that parse-fail after fetch, so `loadedModules['vehicles']` gets marked true and subsequent switches skip re-injection (one error per session, not per navigation). If a browser fired `onerror` instead, every switch would re-inject and re-throw endlessly.
- **The FIRST load's functionality is fully intact** — no user-visible feature was killed, just console noise and the developer signal of "something is wrong here."

**Same class as** plan §1 line 32's flagged `_mccLeafletPromise` and `currentEscrowElements` — vestigial `loadModule()` path re-injecting scripts that are already statically loaded, triggering `let` redeclaration errors.

**Fix (this commit):** pre-seed `loadedModules` in `members-core.js:2763` with all five modules that members.html loads statically at page init (`vehicles`, `packages`, `care-plans`, `settings`, `extras`). `loadModule()`'s existing early-return at :2766 (`if (loadedModules[name]) return Promise.resolve();`) now fires immediately for these keys, no re-injection, no SyntaxError. Vestigial injection path is retained as-is — pre-seed just short-circuits the modules that are already loaded.

**One-line fix; kills the class in one place.** Other members-* modules with top-level `let`/`const` declarations (all of them likely) would have hit the same error class if they'd been section-triggered — pre-seeding all five prevents any of them from surfacing.

**SW cache bump:** `members-core.js` is in STATIC_ASSETS; bumped `www/sw.js` CACHE_NAME v122 → v123 in the same commit.

**Verification:** live testing required (Jordan). Expected: no SyntaxError on first navigation to My Vehicles / Recalls / Verification after the deploy propagates + service-worker upgrade cycle runs.

---

## Finding #2 — MEDIUM · OPEN · Vehicle update PATCH has no retry/backoff + useless error logging

**Reproduction:** on flaky network — first two PATCH attempts to update vehicle mileage failed with network errors, third succeeded. UI showed "Vehicle update error: Object" in console (useless). Mileage did eventually persist (write path itself is verified good; this is a resilience + logging issue, not a data-integrity one).

**Two problems, one code site:**

1. **No retry/backoff.** The client-side PATCH call has no automatic retry on transient network failure. Users on flaky connections either hit the error state and give up, or manually re-try until it works. Neither is a good UX.

2. **Error logging is opaque.** `"Vehicle update error: Object"` is the useless-toString bug — someone's using `console.error('...', err)` or logging `err` where `err` is an Error/Response object that stringifies to `[object Object]`. The real error message + status code is invisible to devs and support.

**Fix shape (proposed, not shipped):**

- Wrap the PATCH in a small retry helper: 2 retries with exponential backoff (250ms, 750ms), then surface a real user-visible error toast if all three attempts fail. Only retry on network errors / 5xx — don't retry on 4xx (client mistake, retrying won't help).
- Fix the logging: `console.error('[members-vehicles] Vehicle update failed:', { status: res.status, statusText: res.statusText, message: err?.message, body: await res.text().catch(() => '(unreadable)') });`. Structured object logs cleanly across Safari/Chrome/Firefox devtools.

**Blast radius:** every vehicle PATCH the client does — mileage updates, name/nickname changes, primary-flag toggles. Not a data-loss risk (write path itself is good), just a UX + debuggability risk.

**Follow-up:** batch with other client-side network resilience touch-ups if any turn up during the rest of the Phase 2 walk. Not urgent for pilot.

---

## Finding #3 — MEDIUM · OPEN · Transient logout on page load (auth-guard vs session-restore race)

**Reproduction:** on cold page load or hard-refresh, member is briefly bounced to `/login.html` — pressing browser Back returns them to the members portal, fully authenticated. Session was never invalid; the auth guard checked `supabaseClient.auth.getSession()` before the client had finished restoring the persisted session from localStorage / IndexedDB.

**Root cause (traced in code, verify at fix time):** the auth guard in `members-core.js` or wherever the initial-load redirect check lives calls `getSession()` immediately on DOMContentLoaded / script init. Supabase-js restores the session asynchronously — there's a window (usually <100ms, sometimes longer on cold storage reads) where `getSession()` returns `null` even though a valid persisted session exists. The guard sees `null`, redirects to `/login.html`. Meanwhile the async restore completes and the session becomes available — but the redirect already fired.

**Fix shape (proposed, not shipped):** gate auth-check redirects on the `INITIAL_SESSION` event from `supabaseClient.auth.onAuthStateChange(...)`:
```js
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'INITIAL_SESSION') {
    if (!session) window.location.replace('/login.html');
    // else: proceed with member-portal init
  }
});
```
The `INITIAL_SESSION` event fires exactly once after Supabase has finished its session-restore attempt — it's the canonical "is the user logged in" signal. Guarding on it eliminates the race entirely.

**Batch this with the pre-existing `showSection` race** flagged in the plan doc §1 line 35 (localStorage `mcc_portal` state read racing navigation) — same class ("boot-time state race"), same fix pattern (defer navigation until state settles), same review surface. One "boot-hardening" commit is cheaper than three separate ones.

**Blast radius:** every cold page load / hard-refresh. Users who catch it experience an unexpected logout → back-button-recovery. Users who don't catch the Back trick get frustrated / support-tickets / churn. Not a data-integrity issue; a first-impression UX issue.

**Follow-up:** queue for the boot-hardening batch. If more race-class findings surface in the Phase 2 walk, add them to the same batch.

---

## Finding #4 — MEDIUM · OPEN · Get Started card doesn't persist dismissal + no auto-retire on core-step completion

**Reproduction:** on the member overview, the "Get Started" onboarding card renders with a Dismiss button. Clicking Dismiss hides the card for the current session — refresh the page and it's back. Also: completing 4 of 5 core onboarding steps (add vehicle, first request posted, etc.) still shows the card as if nothing has progressed; there's no auto-retire threshold.

**Two problems, one surface:**

1. **Dismissal doesn't persist.** The Dismiss button appears to update in-memory state only (or writes to localStorage but not to the server). Every fresh page load re-shows the card. Users learn to ignore it rather than close it — the CTA loses signal value.

2. **No auto-retire when core steps complete.** The card is meant to prompt new members through onboarding. Once a member has completed the "core" steps (vehicle added, first request created, etc.), the card should retire itself even if the "optional" steps (upload photo, invite household, etc.) haven't been touched. Instead it lingers indefinitely.

**Fix shape (proposed, not shipped):** two-part, mirrors the existing profile-completion pattern already in the codebase:

1. **Server-side `dismissed` flag on the member's profile** (or a `member_onboarding_state` row with a `getting_started_dismissed_at` timestamp). Dismiss button POSTs to a small endpoint that sets the flag; render logic checks the flag on load and skips the card if set. Persistent across sessions and devices.

2. **Auto-retire threshold based on core-step completion.** Introduce a `coreSteps` vs `optionalSteps` split in the client-side onboarding progress calculator (or, better, compute on the server so the same signal drives the Dismiss endpoint's decisions). When all `coreSteps` are complete (4/5 with only `optionalSteps` remaining), auto-hide the card without requiring manual dismissal. Rationale: members who've done the meaningful onboarding shouldn't need to explicitly dismiss the prompt — completion IS the dismissal.

**Not urgent:** cosmetic-plus-a-bit UX finding, not data-integrity. Card lingering is annoying, not broken. Batch with any other "onboarding state persistence" findings when they surface (Phase 2 walk is likely to find more of these).

**Cross-reference:** the "no server-side dismissed flag" is a class — check other dismiss-able cards (banners, alerts, promo prompts) during the rest of the Phase 2 walk. If any use client-side-only state, they should get the same fix pattern.
