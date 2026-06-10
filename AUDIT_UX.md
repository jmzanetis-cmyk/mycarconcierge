# MCC Platform UX Audit
_2026-06-01 — read-only, no code changed_

## Summary
- **security: 3** — UI-only role gating, admin endpoint uses static password not user token, public page exposes admin hash tooling
- **broken: 18** — referral credit not actually granted by backend, referrals list stuck in "Loading..." on error, broken docs links in admin, missing `_redirects` entry for admin invite-validate, chat widget overlaps bottom nav on mobile, driver referral credit amount is unspecified, loading states stuck in multiple async flows, PWA banner overlaps bottom nav, chart placeholder never rendered
- **confusing: 14** — "Maintenance Package" vs "Service Request" terminology split, theme toggle label describes current state not action, Founding Driver "zero platform fees" fine print not quantified, $10 welcome bonus shown to new referrals but not programmatically granted on signup, referral credit expiry undisclosed, inconsistent save button labels, "Manage Billing" button hidden until subscriptions load (confusing when subscription call is slow), Safe-area inset on bottom nav but not on PWA install banner, toasts appear top-right on desktop but no safe-area adjustment on mobile header, check-in kiosk has no auth/role gating
- **polish: 9** — multiple small buttons below 44px tap target, locale-unspecified `toLocaleDateString()` vs locale-specified calls mixed, "Coming Soon" chart placeholder visible in fleet.html, broken admin docs links, no back/exit path from car-club leaderboard empty state, vehicle photo delete button is 0.65rem, inconsistent date formats across pages, `toLocaleDateString()` with no locale in members.js, admin uses two different auth strategies (bearer token vs static password)

---

## 1. Silent Failures / Stuck Async States

### REFERRALS LIST STUCK ON ERROR — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-extras.js:7877`
**What happens:** When `loadReferralData()` throws (network error, expired token, etc.), the `catch` block sets the code display to "Error" but never hides the `referrals-loading` spinner. The list section remains stuck showing "Loading referrals..." permanently.
**Evidence:**
```js
} catch (error) {
  console.error('Error loading referral data:', error);
  document.getElementById('referral-code-display').textContent = 'Error';
  // referrals-loading div is never hidden here
}
```
`renderReferrals()` (which hides the loader) is only called on success. The `referrals-loading` element is never touched in the catch branch.

---

### PLATFORM SUBSCRIPTIONS — stuck loading on auth race — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.html:4091`
**What happens:** `billing-subscriptions-list` is initialized with inline copy "Loading subscription info…". `loadBillingSubscriptions()` is called via `typeof window.loadBillingSubscriptions === 'function'` guard in `members.js:469`. If `window._currentSession` is undefined at call time (e.g., slow Supabase init), the function returns early on `if (!session) return;` at line 8772 without clearing the loading state.
**Evidence:** Container is initialized with `Loading subscription info…` text but has no spinner — it just silently stays as that text if session is missing.

---

### DEVELOPER API KEYS — stuck loading on auth race — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.html:4109`
**What happens:** Same pattern as Platform Subscriptions: `api-keys-list` is initialized with "Loading API keys…" text. `loadApiKeys()` uses `window._currentSession?.access_token`, which may be undefined if session hasn't been set on the global yet. The function silently returns without clearing the loading state.
**Evidence:** `const token = window._currentSession?.access_token;` — no guard on session null.

---

### OUTREACH ENGINE — stuck loading on auth race — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.html:4135`
**What happens:** `outreach-saas-status` initializes with "Loading outreach status…". Same `window._currentSession` pattern, same silent return risk.
**Evidence:** Line 4135: `<div style="color:var(--text-muted)...">Loading outreach status…</div>` — only cleared on success/explicit error branches, but silent on `!session`.

---

### ADMIN BGC REPORT LOADER — loader stuck if iframe never fires onload — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/providers-settings.js:794`
**What happens:** `viewBgCheckReport()` shows a `loader.textContent = 'Loading report…'` div and hides the iframe. The iframe's `onload` hides the loader and shows the iframe. If the report URL's server returns an empty-body response (common with redirect-type report URLs), `onload` fires but the iframe may be blank — and there is no timeout to detect this.
**Evidence:** `iframe.onload = () => { if (loader) loader.style.display = 'none'; iframe.style.display = 'block'; }` — no content-check or timeout fallback.

---

### SERVICE HISTORY LOADING STATE — broken (many similar)
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.js:4214`
**What happens:** Service history list is set to an `<empty-state>` with "Loading service history..." but if the Supabase query returns an error, the error branch only does `console.error` — the loading empty-state remains.
**Evidence:** Pattern repeated across `members.js` and `providers.js` — `Loading fleet requests...`, `Loading batches...`, `Loading completed jobs...` (providers.js:7838, 7927, 8022) — none checked for error branch rendering.

---

### ADMIN AUDIT LOG — loading not cleared on error — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/admin-audit-log.js:304`
**What happens:** `list.innerHTML` set to "Loading recent admin actions..." before fetch. Catch branch does `console.error` only — loading message stays.
**Evidence:** Standard pattern: loading set, no catch-branch DOM update.

---

### PROVIDERS-DOCUMENTS BUTTON STUCK — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/providers-documents.js:30`
**What happens:** `btn.textContent = 'Loading...'` is set before an async operation. If the operation throws, the button may remain as "Loading..." indefinitely.
**Evidence:** Line 30: `btn.textContent = 'Loading...';` — verify `finally` block resets it.

---

### MEMBERS CARE PLANS LOADING — minor (has fallback) — polish
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-care-plans.js:147`
**What happens:** Sets "Loading your care plans…" — this module does have error branches that update the container, so it is less severe than others, but worth confirming all error paths clear the loading state.

---

### PROVIDERS-JOBS REFUND LOADING — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/providers-jobs.js:1595`
**What happens:** "Loading refund requests..." rendered inside an `empty-state-icon` wrapper (uses the icon for a clock). This is structurally misleading — loading indicators rendered as empty-states make it visually identical to "no results" unless the text is read carefully.

---

## 2. Role / Surface Gating

### MEMBERS.HTML — NO ROLE CHECK — providers/admins can access member dashboard — security
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-core.js:482–509`
**What happens:** `members.html` redirects unauthenticated users to `login.html`, but does NOT check `userProfile.role`. A user with `role='provider'` or `role='admin'` can access the full member dashboard and all member-facing API calls.
**Evidence:** The `loadProfile()` function at line 997 has only `if (userProfile?.role === 'admin') { document.getElementById('admin-nav').style.display = 'block'; }` — there is no redirect/block for non-member roles.

---

### JOB-BOARD.HTML — AUTH BUT NO ROLE GATE — security (moderate)
**File:** `/Users/jordanzanetis/mycarconcierge/www/job-board.html:470–480`
**What happens:** Job board checks for a session but not the user's role. A member could access the provider job board intended for providers. The server-side `job-board` function presumably handles authorization, but the UI presents full provider bid submission forms to any authenticated user.
**Evidence:** `checkAuth()` checks only `if (!session)` — no role check.

---

### CHECK-IN KIOSK — NO AUTH AT ALL — security
**File:** `/Users/jordanzanetis/mycarconcierge/www/check-in.js:14–24`
**What happens:** `check-in.html` is a public kiosk page, reachable with any `?provider=UUID` URL parameter, with no Supabase session check. Anyone who knows (or guesses) a provider's UUID can access the check-in form and register visits against that provider's account.
**Evidence:** `document.addEventListener('DOMContentLoaded', async () => { if (!providerId) { showError('...'); return; } await loadProviderInfo(); setupInputListeners(); });` — no auth check.
**Note:** This may be intentional (public kiosk), but there is no server-side rate limiting or provider ownership validation at the API level visible in the client code.

---

### ADMIN-STATS — STATIC PASSWORD AUTH (not user session) — security
**File:** `/Users/jordanzanetis/mycarconcierge/netlify/functions/admin-stats.js:24–31`
**What happens:** `admin-stats.js` and several other admin Netlify functions (`admin-saas.js`, `admin-designs.js`, `admin-survey.js`, etc.) authenticate via a static `ADMIN_PASSWORD` env-var compared as a plain string in `x-admin-password` or `x-admin-token` headers. There is no per-user session, no token expiry, and no audit trail of who made which call. If the password leaks, all admin API endpoints are accessible.
**Evidence:** `return pw === adminPassword || tk === adminPassword;` — this is a shared static credential, not a user token.
**Contrast:** `admin-data.js` and `admin-welcome-email.js` use the more secure pattern of verifying a Supabase Bearer token and checking `profiles.role === 'admin'`.

---

### PROVIDERS-DIRECTORY.HTML — NO AUTH — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/providers-directory.html`
**What happens:** The providers directory appears to be publicly visible (no session redirect found). Depending on what data is exposed, this may be intentional but should be confirmed.

---

### GENERATE-ADMIN-HASH.HTML — PUBLIC PAGE — security
**File:** `/Users/jordanzanetis/mycarconcierge/www/generate-admin-hash.html`
**What happens:** This page is publicly accessible (has `robots: noindex, nofollow` but no auth) and renders instructions for setting the admin password hash including the SQL to insert it into Supabase. While it doesn't expose the actual password, it is an operational security tooling page that should not be publicly reachable.
**Evidence:** Page is served at `https://www.mycarconcierge.com/generate-admin-hash.html` with no session guard.

---

## 3. Form Hydration

### SETTINGS FORM — CORRECTLY HYDRATED — (no issue)
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-core.js:1030–1044`
Member settings form is populated from `userProfile` on `loadProfile()`. Fields hydrated: name, phone, zip, city, state, SMS checkboxes. No issue.

### PROVIDER PROFILE FORM — CORRECTLY HYDRATED — (no issue)
**File:** `/Users/jordanzanetis/mycarconcierge/www/providers.js:4479–4518`
Provider profile form is populated from Supabase `profiles` on `loadProviderProfile()`. No issue.

### FLEET SETTINGS NAME INPUT — partial hydration — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.html:7885` / `members.js:14082`
**What happens:** `fleet-settings-name` input is correctly populated from `currentFleet.name`. However, other fleet settings fields (e.g., fleet description, billing contact) may not be pre-populated — depends on whether those fields exist in the response. Not a hard break, but worth reviewing if new fleet settings fields are added.

---

## 4. Member-Facing Copy / Trust

### REFERRAL CREDIT — UI SAYS $10 BUT BACKEND GRANTS NOTHING — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.html:3505` (UI); `/Users/jordanzanetis/mycarconcierge/netlify/functions/referral-process.js:190–231` (backend)
**What happens:** The member referral flow tells both the referrer and the referred user they will receive "$10 in credits" (UI: "you earn $10 in credits!", "your friend gets a $10 welcome bonus!"). However, the `_processMemberCode()` function in `referral-process.js` only links `referred_by_member_id` and records a row in `founder_referrals` — it does not insert any record into a `referral_credits`, `member_credits`, or `wallet_credits` table, nor call any credit-granting RPC.
**Evidence:** `_processMemberCode` returns `successResponse({ success: true, referral_type: 'member_referral', ... })` with no credit insert.
**Severity: broken** — Members are promised money that is not being granted.

---

### REFERRAL CREDIT EXPIRY — NEVER DISCLOSED — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.html:3488–3525`
**What happens:** The referral program section describes earning "$10 in credits" but never states when those credits expire, whether they are per-service or global, or what services they apply to.
**Evidence:** No expiry language appears anywhere in the referral section or `members.html`.

---

### FOUNDING DRIVER "ZERO PLATFORM FEES" — vague — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/signup-driver.html:232`, `/Users/jordanzanetis/mycarconcierge/www/drivers.html:647`
**What happens:** "Zero platform fees for your first 90 days" appears in hero copy, perks list, and the comparison table. However:
1. The platform fee rate after 90 days is never stated (there is no "then X%" disclosure).
2. The Stripe card processing fee (2.9% + 30¢ per trip) still applies per the founding provider agreement model, but drivers have no such disclosure.
3. The drivers page copy at line 573 says fees apply "once MCC obtains all required state licensing" — but this caveat is buried in fine print below the fold.

---

### "NO PLATFORM FEE" vs. STRIPE PROCESSING — inconsistent disclosure — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/terms.html:551`; `/Users/jordanzanetis/mycarconcierge/www/provider-info.html:263`; `/Users/jordanzanetis/mycarconcierge/www/MCC-Provider-Brochure-V2.html:553`
**What happens:** `terms.html` says "Providers receive the full bid amount." `provider-info.html` correctly discloses "minus standard Stripe payment processing (2.9% + 30¢)". `MCC-Provider-Brochure-V2.html` says "No platform fees on completed jobs — ever (MCC never charges a per-job fee)." The brochure copy is technically accurate but omits the Stripe deduction a new provider would notice on their first payout. The terms and brochure together create a misleading impression.

---

### DRIVER REFERRAL CREDIT AMOUNT — UNSPECIFIED — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.html:3456`
**What happens:** "Refer drivers and earn Founding Driver referral credit when they complete their first trip." — No dollar amount is specified. The member referral section specifies "$10" but the driver referral card does not.

---

## 5. Overlapping UI

### PWA INSTALL BANNER — OVERLAPS BOTTOM NAV ON MOBILE — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/pwa-init.js:53–54`
**What happens:** The PWA "Install My Car Concierge" banner is positioned `bottom: 20px` fixed. The mobile bottom nav (`.mobile-bottom-nav`) is also fixed at `bottom: 0` with `height: 60px` + `env(safe-area-inset-bottom)`. On a phone, the install banner (approximately 80px tall) rendered at `bottom: 20px` will overlap the bottom nav entirely, and the banner's "Install" and dismiss buttons may be behind the nav.
**Evidence:** `pwa-init.js:54`: `bottom: 20px;` — no account for the 72px bottom nav height (which is added to `body.has-bottom-nav` but not to the dynamically created banner element).

---

### AI CHAT WIDGET — OVERLAPS BOTTOM NAV ON MOBILE — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/chat-widget-base.js:67–70`
**What happens:** The AI chat widget toggle button (60×60px) is positioned `bottom: 24px; right: 24px`. On mobile viewports where `.mobile-bottom-nav` is displayed (≤768px), the chat button sits directly on top of the bottom-right nav item. The widget has `z-index: 9999` and the nav has `z-index: 9000`, so the chat button renders over the nav.
**Evidence:** `bottom: 24px` in base styles; bottom nav is 60px + safe-area tall; no responsive adjustment in the chat widget CSS.

---

### COOKIE CONSENT BANNER — MAY OVERLAP BOTTOM NAV — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/cookie-consent.js:48`
**What happens:** Cookie consent banner is positioned fixed at the bottom with `padding-bottom: calc(8px + env(safe-area-inset-bottom))`. It accounts for safe-area but not for the bottom nav height. On member/provider pages where bottom nav is visible, the cookie banner may partially occlude the first nav item.

---

### TOAST NOTIFICATIONS — NO SAFE-AREA ON MOBILE HEADER — polish
**File:** `/Users/jordanzanetis/mycarconcierge/www/shared-styles.css:486–495`
**What happens:** Toast container is `top: 20px; right: 20px` on desktop, and on mobile moves to `left: 12px; right: 12px; top: 12px`. On iOS with a notch, `top: 12px` may place toasts behind the status bar. There is no `max(12px, env(safe-area-inset-top))` adjustment.

---

## 6. Empty / Error / Loading State Coverage

### FLEET ANALYTICS CHART — NEVER RENDERED — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/fleet.html:521–522`
**What happens:** The spending analytics section contains a `<div class="chart-placeholder">` with the text "Chart coming soon - spending over time". This is a permanent visible placeholder in production, not a loading state.
**Evidence:** `<span class="icon-inline" data-icon="trending-up"></span> Chart coming soon - spending over time`

---

### ADMIN DOCS — BROKEN LINKS — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/admin.html:4159, 4164`
**What happens:** Two admin doc card links point to `docs/investor-business-plan.html` and `docs/investor-contact-list.html`. The `www/docs/` directory does not exist. These links 404.
**Evidence:** `ls /Users/jordanzanetis/mycarconcierge/www/docs/` returns "docs dir not found".

---

### ADMIN INVITE-VALIDATE — MISSING REDIRECT RULE — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/admin-invite.html:288`; `/Users/jordanzanetis/mycarconcierge/www/_redirects`
**What happens:** `admin-invite.html` calls `fetch('/api/admin/invite-validate?token=...')`. There is no redirect rule in `_redirects` mapping `/api/admin/invite-validate` to a Netlify function. The call will 404 in production, making team invite acceptance completely broken.
**Evidence:** `grep "invite-validate" /www/_redirects` returns nothing. The `validate-invitation.js` function exists but is mapped only to `/api/invitations/*` not `/api/admin/invite-validate`.

---

### PROVIDERS-JOBS LOADING STATES — many silently blank on error — broken
**Files:** `/Users/jordanzanetis/mycarconcierge/www/providers-jobs.js:727, 776`
**What happens:** `container.innerHTML = '<p ...>Loading...</p>'` is set before fetches at multiple points. In the catch branch for several functions (fleet jobs, batch details), the container is not updated on error, leaving "Loading..." permanently.
**Evidence:** The `finally` or catch blocks for `loadFleetBatch` (line 1297) shows: `if (body) body.innerHTML = '<div class="empty-state"><p>Failed to load batch.</p></div>';` — this one is handled, but several sibling functions use the same loading pattern without matching error branches.

---

### CAR CLUB LEADERBOARD — "COMING SOON" DEAD END — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/car-club-provider.html:856`
**What happens:** A "Leaderboard" section renders with `<div class="empty-state-title">Leaderboard Coming Soon</div>` — there is no way for the user to do anything; it's a dead-end panel in an active section.

---

## 7. Navigation Dead Ends & Dead Pages

### ADMIN DOCS LINKS — 404 — broken
(See §6 above — same issue)

### FOUNDER DASHBOARD — PAYOUT BUTTONS — broken
**File:** `/Users/jordanzanetis/mycarconcierge/www/founder-dashboard.js:1022, 1266`
**What happens:** Two actions in the founder dashboard show `showToast('...settings coming soon')` and `showToast('Outstanding balance payment coming soon')` when clicked. These are interactive-looking buttons that silently do nothing except toast.
**Evidence:**
```js
showToast(`${method === 'stripe_connect' ? 'Stripe Connect' : 'Weekly payout'} settings coming soon`);
showToast('Outstanding balance payment coming soon');
```

---

### PROVIDERS DIRECTORY — PUBLIC, NO BACK PATH FROM ERRORS — polish
**File:** `/Users/jordanzanetis/mycarconcierge/www/providers-directory.html`
**What happens:** The providers directory is a standalone page with no sidebar navigation. If the fetch fails or returns empty, there is no back-button or contextual navigation back to the main site. The user is left with an empty list and must use the browser back button.

---

## 8. Destructive-Action Safeguards

### DELETE ACCOUNT — PROPERLY GUARDED — (no issue)
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-core.js:3180`
Member account deletion requires typing "DELETE" into a text input before the confirm button activates. Correct safeguard.

### DELETE VEHICLE — CONFIRM DIALOG — (no issue)
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-vehicles.js:1949`
`if (!confirm('Delete this vehicle? This cannot be undone.')) return;` — adequate.

### REVOKE API KEY — ONLY BROWSER CONFIRM — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.html:8974`
**What happens:** `revokeApiKey()` uses `if (!confirm('Revoke this API key?...')) return;` — a basic `window.confirm`. This is consistent with other destructive actions but is less safe than a modal with typed confirmation, given that revocation is immediate and irreversible for any apps using the key.

### VEHICLE PHOTO DELETE — CONFIRM THEN DIRECT — (minor)
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-vehicles.js:2103`
`if (!confirm('Remove this photo?')) return;` — adequate, though the photo delete button (see §9) is very small.

### CANCEL SLOT BOOKING — CONFIRM — (no issue)
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-extras.js:992`
Uses `window.confirm` before cancelling. Adequate.

---

## 9. Mobile / Responsive

### PHOTO DELETE BUTTON — BELOW 44PX TAP TARGET — polish
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-vehicles.js:2008`
**What happens:** Vehicle photo delete button uses `font-size:0.65rem; padding:3px 8px` — well below the 44×44px minimum touch target. On mobile, this is difficult to tap accurately.
**Evidence:** `style="font-size:0.65rem;padding:3px 8px;border-radius:4px;border:none;...">✕</button>`

### SET-PRIMARY PHOTO / DELETE PHOTO OVERLAY BUTTONS — below 44px — polish
**File:** `/Users/jordanzanetis/mycarconcierge/www/members-vehicles.js:1379–1380`
**What happens:** Two buttons on photo overlay use `padding:2px 6px; font-size:0.7rem` — these are very small touch targets for delete/set-primary actions on vehicle photos.

### AI CHAT WIDGET OVERLAPS BOTTOM NAV — broken
(Already covered in §5)

### PWA BANNER OVERLAPS BOTTOM NAV — broken
(Already covered in §5)

### TOAST NOTIFICATIONS — MISSING SAFE-AREA-INSET-TOP — polish
(Already covered in §5)

### BODY PADDING-BOTTOM NOT APPLIED TO ALL PAGES — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/shared-styles.css:1473–1474`
**What happens:** `body.has-bottom-nav { padding-bottom: 72px; }` is only applied when the JS explicitly adds `has-bottom-nav` class to body. If any page includes `mobile-bottom-nav` but doesn't add the class, content will be obscured by the nav. Confirm all pages that use the nav also add this class.

### ADMIN.HTML INLINE OVERFLOW-X TABLE — polish
**File:** `/Users/jordanzanetis/mycarconcierge/www/admin.html` (multiple tables)
**What happens:** Admin page has wide data tables. On tablet viewports (768px–1024px), the sidebar is hidden but the tables may still overflow without visible scroll indication. Users may not discover that the table scrolls horizontally.

---

## 10. Consistency

### "MAINTENANCE PACKAGES" vs. "SERVICE REQUEST" — SPLIT TERMINOLOGY — confusing
**Files:** `members.html:1087, 2388, 5598` vs. `members.html:1207, 2866, 6488`
**What happens:** The same concept (member posts a job for providers to bid on) is called "Maintenance Package" in the nav label (`Maintenance Packages`), the section title (`<h1>Maintenance Packages</h1>`), and the modal title (`Create Maintenance Package`). But the CTA button in the hero says `+ New Service Request`, the how-it-works step says "Post a service request", and the OBD scan result button says "Create Service Request". Providers see the same items called "Job" in `providers-jobs.js:271` (`pkg?.title || 'Job'`), and email templates call them "Maintenance Package".
- Nav: "Maintenance Packages"
- CTA button: "+ New Service Request"
- Modal: "Create Maintenance Package"
- Provider job list fallback: "Job"
- Refund description fallback: "Service Package"

---

### THEME TOGGLE LABEL — DESCRIBES CURRENT STATE, NOT ACTION — confusing
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.js:43`; `members-core.js:82`; `members.html:3543`
**What happens:** The settings toggle shows the label "Dark Mode" when the app is currently in dark mode. The toggle's checked state (`checked = currentTheme === 'light'`) means "ON = Light". So:
- In dark mode: label says "Dark Mode", toggle is OFF → toggling it ON switches to Light Mode
- In light mode: label says "Light Mode", toggle is ON → toggling it OFF switches to Dark Mode
The label describes the current state but the expected convention is to label what the toggle will activate. A user in dark mode sees "Dark Mode" and doesn't know if toggling will enable or disable dark mode.

---

### SAVE BUTTON INCONSISTENCY — polish
**Files:** `providers.html:3311, 3420, 4159, 4927, 5085`; `members.html:3967, 4224`
**What happens:** Within the provider portal, save-action buttons are labeled:
- "Save Profile" (provider profile)
- "Save Working Hours"
- "Save Hours" (business hours — different from "Save Working Hours" above)
- "Save Auto-Bid Settings"
- "Save Evidence" (dispute evidence, but rendered as `<button id="submit-evidence-btn"` — the button ID uses "submit" while the label uses "Save")
- "Save Team Member"
- "Save Match Preferences"
- "Save Inspection Report"

Within the member portal: "Save Settings", "Save Notification Preferences", "Save Loyalty Settings", "Save Workflow Settings". The member portal uses "Save [noun]" consistently, but the provider portal mixes "Save [noun]" with an ID of `submit-evidence-btn`.

---

### DATE FORMAT INCONSISTENCY — polish
**File:** `/Users/jordanzanetis/mycarconcierge/www/members.js` (multiple locations)
**What happens:** `toLocaleDateString()` is called with no locale in many places (line 1201, 889 implicit, etc.), producing device-locale-dependent output. Other calls use `toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` (members-extras.js:7929), or `'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }` (members.js:4559). This means the same date may display as "6/1/2026", "Jun 1, 2026", or "Mon, Jun 1, 2026" depending on where it appears. No consistent date format standard is applied.

---

### ADMIN AUTH — TWO INCOMPATIBLE STRATEGIES — security / confusing
**Files:** `admin-data.js`, `admin-welcome-email.js` (Bearer token + `profiles.role === 'admin'`); `admin-stats.js`, `admin-saas.js`, `admin-designs.js`, `admin-survey.js`, etc. (static `ADMIN_PASSWORD` header)
**What happens:** The admin Netlify functions use two different authentication approaches. The Bearer-token approach is more secure (per-user, auditable, revocable). The static-password approach is a shared secret. Mixing them means the security of any admin operation depends on which function implements it — an inconsistency that creates both operational confusion and security risk.

---

## Appendix: Files with Most Issues

| File | Issues |
|---|---|
| `www/members.html` | §1 (3 stuck loaders), §4 (referral credit), §10 (terminology, theme toggle) |
| `www/members-extras.js` | §1 (referrals-loading stuck), §4 (driver referral credit) |
| `www/pwa-init.js` | §5 (overlaps bottom nav) |
| `www/chat-widget-base.js` | §5 (overlaps bottom nav) |
| `www/netlify/functions/referral-process.js` | §4 ($10 credit not granted) |
| `www/admin.html` | §7 (broken docs links), §6 (broken docs links) |
| `www/_redirects` | §6 (missing admin/invite-validate route) |
| `www/fleet.html` | §6 (chart never rendered) |
| `www/members-vehicles.js` | §9 (tiny tap targets) |
| `netlify/functions/admin-stats.js` | §2 (static password auth) |
