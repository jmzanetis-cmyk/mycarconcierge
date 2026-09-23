# App Review Notes — My Car Concierge

*Companion to the ASC submission Notes field. Reply to Apple's Guideline 2.1 "Information Needed" letter.*

*Version reference: submitting from commit `65d8312cbec75b3caaea7fd9bc347736d065b19b` — CFBundleShortVersionString `1.1.0`, CFBundleVersion `19`. (Build 18 was uploaded to TestFlight and revealed a language-selector coverage bug on the provider portal, fixed in this commit; build 17 was side-loaded only.)*

*Demo credentials for the reviewer go in the App Store Connect "Sign-in required" section, NOT this file. See the pre-send checklist at the bottom.*

---

## 1. What is the app's core concept? Who is the target audience?

**My Car Concierge is a two-sided automotive-service marketplace** connecting vehicle owners with vetted independent mobile service providers via competitive bidding.

- **Members** post a maintenance or repair request ("Front Brake Pads & Rotors"), attach a vehicle, and receive real-time bids from local providers. They compare bids side-by-side, message the provider directly, and accept the one they want.
- **Providers** are independent auto-service businesses and mobile mechanics who receive alerts for open requests in their radius, submit competitive bids, and manage their bookings + earnings through a separate provider portal.

**Target audience:** private US vehicle owners looking for transparent, price-competitive service alternatives to the traditional dealership or unknown-shop experience — and independent service providers (mobile mechanics, small shops, mobile detailers, tire installers) who want direct customer flow without paying dealership-level marketing overhead.

The app is currently US-only, launching in the Northeast + Midwest metros first.

## 2. How do users set up the app after they install it? How do they reach the main features?

On first launch:

1. **Splash → onboarding intro** (2 short screens explaining the marketplace).
2. **Sign-in / register screen** — options for email + password, **Sign in with Apple**, Sign in with Google, or Sign in with Facebook.
3. **Role selection** — user picks "I need service" (Member portal) or "I offer service" (Provider portal). The app supports dual-role users (a member can later add provider capabilities and vice versa).
4. **First-run vehicle add** (Member path) — asked to add a vehicle (year, make, model, nickname) so requests can be tied to a real car. Provider path collects business name, service area, and payout details for Stripe Connect onboarding.

Reaching main features from the Member Portal home:
- **Post a service request** — big primary CTA on the home tab.
- **Compare bids** — Packages tab → open a package → bids render inline with amount, description, star-rating, and Message / Accept Bid / Report controls.
- **Message a provider** — Messages icon in the header (badge shows unread count).
- **Track a job** — Packages tab → In Progress section.
- **View past jobs / receipts** — Care Plans / Services tab → Completed section.
- **Delete my account** — Profile → Account settings → "Delete Account" (see §3 walkthrough below).

Reaching main features from the Provider Portal home:
- **View open marketplace requests** — Bids tab.
- **Submit a bid** — open a request card → tap Bid.
- **Track earnings / payouts** — Earnings tab, wired to Stripe Connect.
- **My Reviews** — see published customer reviews with Report control on each.

## 3. Step-by-step walkthrough for the reviewer

**Demo credentials (in ASC Notes):** email `demo@mycarconcierge.com`, password `[FILL IN — do NOT commit; paste into App Store Connect > App Information > App Review Information > Sign-In Information]`.

The demo account is a dual-role user (member + provider). Both portals can be exercised from the same login.

### A. Registration flow (fresh account, optional)
1. Tap "Register" on the sign-in screen.
2. Choose "Continue with Apple" (or email/password).
3. Complete the onboarding — pick "I need service", add a vehicle.
4. Land on the Member Portal home.

### B. Sign in with the demo account (recommended for review)
1. Enter `demo@mycarconcierge.com` and the password provided in ASC Notes.
2. Land on the Member Portal home. The account has:
   - 4 vehicles in the garage
   - Multiple maintenance packages (open, in-progress, and one completed 60,000-mile Service)
   - 1 unread message from the provider "Roadside Rescue Auto"

### C. Exercise the three report + block mechanisms

**C1 — Messaging chat header (Report abuse / Block provider):**
1. Tap the Messages icon in the header (unread badge shows).
2. Open the "Front Brake Pads & Rotors" conversation with Roadside Rescue Auto.
3. In the chat header: tap **"Report abuse"** — a modal opens with reason radios (harassment, inappropriate, spam, fraud, other) and an optional details field. Submit and confirm the toast.
4. Also visible: **"Block provider"** — tap it, confirm, and the provider is added to the user's block list (filters them out of future conversations).

**C2 — Per-bid Report ghost button:**
1. From the Member Portal home, open the "Front Brake Pads & Rotors" package.
2. Scroll to the bids section — 1 pending bid from Roadside Rescue Auto ($220, "OEM ceramic pads + Brembo rotors, 12-month warranty").
3. Below the description, the action row shows Message / Accept Bid / a subtle underlined **Report** link.
4. Tap **Report** — same modal shape as C1, with `contentType=bid`.

**C3 — Per-review Report on provider "My Reviews" tab:**
1. Switch to the Provider Portal (the demo account has both roles via the account switcher, OR log in as the counterparty `demo.counterparty@mcc-test.com` / password `[FILL IN — in ASC Notes]` for a pure provider view).
2. Open the **My Reviews** tab.
3. A published 5★ review from "MCC Demo" shows, with a **Report** link in the row footer.
4. Tap **Report** — same modal, with `contentType=review`.

### D. Delete Account (Apple Guideline 5.1.1(v))
1. From the Member Portal, open **Profile** → **Account settings**.
2. Scroll to the "Delete Account" section — tap the red **Delete My Account** button.
3. A confirmation modal opens listing what will be deleted. It requires:
   - Typing `DELETE` in the confirmation field
   - Entering the current password (re-verification defense against stolen-JWT deletion)
4. Both filled → the **Delete My Account** button enables. Tap it.
5. Spinner runs briefly, then a success toast confirms the account is deleted and the app signs out and redirects to the home page.
6. **The account is now permanently deleted** — signing in with the same credentials fails.

Screen-recording reference: `[FILL IN — path/URL to device screen recording of steps D1–D6]`. See pre-send checklist below.

## 4. Report & Block mechanisms for user-generated content (Guideline 1.2)

Every surface where a user can see content authored by another user has both a **Report objectionable content** control and a **Block user** control, or is behind an indirect but discoverable path to both:

| Surface | Report control | Block control |
|---|---|---|
| Member↔Provider chat (Messages) | "Report abuse" button in chat header — writes to `content_reports` with `contentType=message`. | "Block provider" (member view) / "Block member" (provider view) in the same header — writes to `user_blocks` and filters the blocked party out of all conversation lists. |
| Provider bid cards (member viewing bids) | Per-bid ghost "Report" button — `contentType=bid`, `reportedUserId=bid.provider_id`. | Block available indirectly by opening a Message with the provider (1 tap → chat header → Block). |
| Provider "My Reviews" (provider viewing reviews about them) | Per-review "Report" link — `contentType=review`, `reportedUserId=review.member_id`. | Block available indirectly by messaging the reviewer OR by reporting the review with reason=harassment which flags the reviewer's account for admin review. |

Reason categories offered on the report modal: harassment/abuse, inappropriate/offensive content, spam/advertising, fraud/scam, other (with a free-text details field).

Content moderation policy: reports write to a `content_reports` table with `status='pending'` and are triaged by MCC support staff within 24 hours (documented in the Terms of Service). Repeat offenders and confirmed harassment cases trigger account suspension.

## 5. External services this app relies on

Confirmed active in this build:

- **Stripe** — payment processing for member service payments and provider payouts (via Stripe Connect). Also processes provider bid-credit purchases and monthly subscriptions.
- **Supabase** — backend (authentication, PostgreSQL, real-time subscriptions for chat and notifications, storage for uploaded photos).
- **Sign in with Apple** — offered as a first-class sign-in option per Apple 4.8, via `AuthenticationServices.framework` entitlement + Supabase OAuth.
- **Sign in with Google** and **Sign in with Facebook** — additional sign-in options (via Supabase OAuth).
- **Twilio** — SMS delivery for verification codes, appointment reminders, and provider bid alerts.
- **Resend** — transactional email delivery (receipts, reminders, admin notifications).
- **Anthropic Claude** — assists members composing service requests (natural-language → structured package), and powers admin-side operational triage assistants. No user data is trained on; requests go over Anthropic's API with standard privacy protections.
- **Google Places API** — address autocomplete for member service-request location entry and provider service-area setup.
- **Third-party background-check service** `[CONFIRM — Checkr was retired 2026-09-11 per code comments; current vendor is not Checkr — confirm name before submitting]` — runs identity and background verification on providers before their listings can accept bids. Members do NOT undergo background checks.

Third-party services do NOT include: cryptocurrency, ad networks, or any social-media data-sync beyond the initial Sign-in-with-provider OAuth handshake. Facebook data-deletion callback is implemented per Facebook's platform policy.

## 6. Regional consistency and regulated-industry classification

**Region:** The app is currently released only in the United States. All features work identically across all US states. There is no region-specific gating or premium content. `[CONFIRM — App Store availability set to US only in ASC pricing/availability]`.

**Regulated-industry classification:** My Car Concierge is a **coordination platform / marketplace**, NOT a regulated automotive dealer, mechanic, or financial institution.

- **Providers are independent third parties.** MCC does not employ mechanics. Every provider listed passes third-party identity + background verification before being allowed to bid, and each provider is contractually responsible for their own licensing, insurance, and warranty commitments per their listing.
- **Payments are processed by Stripe.** MCC holds no member card or bank data — Stripe is the merchant of record for member charges, and Stripe Connect is the payout rail for providers.
- **No advice, no diagnosis, no repair by MCC directly.** All service is performed by the independent provider the member accepts. MCC's role is limited to matching, messaging, payment escrow via Stripe, and dispute resolution.

The app therefore falls under Apple Business Model 3.2.1 (marketplace connecting service providers with customers) and not under specialized regulated-industry classifications like Financial Services, Medical, or Government.

---

## Pre-send checklist — MUST complete before resubmitting

Off-repo tasks after this doc is committed:

- [ ] **Screen recording of the delete flow (§3 D1–D6) captured on a real device / TestFlight build.** Upload to `[FILL IN — Vimeo / iCloud Drive / ASC media library]` and cite the URL in the ASC "Notes" field alongside these written responses.
- [ ] **Screenshots refreshed for every currently-required device size** (6.9" iPhone 16 Pro Max, 6.7", 6.5"; 13" iPad Pro if iPad-supported). Old sizes for retired devices removed.
- [ ] **Rebuild the archive from commit `65d8312cbec75b3caaea7fd9bc347736d065b19b`** — `CFBundleVersion=19`, `CFBundleShortVersionString=1.1.0`, `IPHONEOS_DEPLOYMENT_TARGET=15.0` (all set in the Xcode project already). Build 19 supersedes build 18 which had the language-switcher coverage bug.
- [ ] **Run `ios:prep`** to regenerate the iOS bundle mirror in `ios/App/App/public/` from the fresh `www/` (this pulls in commits 5e29709, 336fa7a, 72f895f, edcfc0d — all Phase-1 blocker fixes + the review-query fix).
- [ ] **Confirm `MinimumOSVersion`** raised from 14.0 → 15.0 in the Xcode project (soft — Apple hasn't enforced yet, but flagged).
- [ ] **Upload to TestFlight, verify the Delete Account flow on the real installed build end-to-end** before archiving for App Store submission.
- [ ] **Fill every `[FILL IN]` placeholder in this document.**
- [ ] **Paste the demo credentials into ASC → App Information → App Review Information → Sign-In Information.** Do NOT commit them to the repo.
- [ ] **Confirm the background-check vendor name** (Checkr retired; whatever the current vendor is — replace the `[CONFIRM …]` tag in §5).
- [ ] **Confirm US-only availability** in ASC's Pricing and Availability section (§6).
- [ ] **Update `docs/apple-guideline-3.1.1-response-draft.md`** if 3.1.1 comes up again — the draft was flagged as needing a targeted patch after the community-contribute iOS gate (deployed 2026-09-22).

Resubmit through ASC.
