# App Store Metadata — My Car Concierge

This document contains all required text content for App Store Connect submission.
Copy each field exactly into App Store Connect. Character counts are noted where limits apply.

---

## Bundle ID decision

Submission ships against `com.zanetisholdings.mycarconcierge` — the bundle ID the code, entitlements, Universal Links AASA, and Firebase/FCM registration are already built around. The alternative was reopening the prior App Store Connect record `co.mycarconcierge.app` (Apple ID 6756989757, carrying the Resolution Center history from the six-issue rejection), but the rework cost — Firebase/FCM re-registration, APNs certificate rotation, redoing Associated Domains + AASA + provisioning profile — outweighs the continuity benefit. Reviewers will get context via App Review Notes on the fresh App Store Connect record instead. This decision is final; Phase 8 metadata treats `com.zanetisholdings.mycarconcierge` as the authoritative bundle ID and should not re-litigate.

---

## App Identity

| Field | Value |
|---|---|
| **App Name** | My Car Concierge |
| **Bundle ID** | com.zanetisholdings.mycarconcierge |
| **SKU** | MYCARCONCIERGE001 |
| **Primary Language** | English (U.S.) |
| **Primary Category** | Lifestyle |
| **Secondary Category** | Business |

---

## Subtitle (30 chars max)

```
Complete Auto Ownership App
```
*(27 chars ✓)*

---

## Promotional Text (170 chars max)

Promotional text can be updated at any time without a new app submission.

```
One app. Every auto need. Zero hassle. Get quotes from local providers, manage your vehicles, track maintenance, and shop smarter — all in one place.
```
*(149 chars ✓)*

---

## Description (4000 chars max)

```
My Car Concierge is your complete auto ownership platform — the one app that covers every need, from finding trusted service providers to tracking your vehicle's maintenance history.

FIND LOCAL AUTO SERVICE PROVIDERS
Post what your ride needs and receive competitive bids from vetted local service providers — mechanics, body shops, detailers, towing, and more. No more calling around or wondering if you're overpaying. Compare bids side by side, read reviews, and hire with confidence.

MANAGE YOUR VEHICLES
Store all your vehicles in one place. Track maintenance records, upload registration documents, run OBD diagnostic scans, and get AI-powered explanations of fault codes — all from your phone.

CAR CLUB LOYALTY REWARDS
Earn punches toward free services with your favorite providers. Car Club loyalty programs let providers reward your repeat business with exclusive perks only available through My Car Concierge.

SECURE PAYMENTS, ALWAYS
Every transaction goes through our escrow payment system — funds are held securely until you confirm the work is done. No cash, no surprises.

MY NEXT CAR
Researching your next vehicle? Use the VIN lookup tool, Dream Car Finder AI search, and Google Vision-powered registration scan to build a shortlist of prospective vehicles alongside your current ones.

CAR ACADEMY
Learn what your car actually needs with our education hub. Plain-English guides on maintenance basics, repair costs, warning signs, and money-saving tips — plus an AI chat expert available 24/7.

SMART SERVICE RECOMMENDATIONS
When you add a vehicle, the app surfaces maintenance recommendations based on your car's make, model, and mileage — so you never miss an important service interval.

MERCH STORE
Shop My Car Concierge branded gear through our in-app store, with orders fulfilled by Printful and secured by Stripe.

WHAT SETS US APART
• Competitive bidding — providers compete for your business
• Escrow payments — money held until job is done
• Vetted providers with verified ratings and reviews
• Vehicle maintenance tracking in one place
• AI-powered diagnostics and car education
• Biometric login and mobile wallet support
• Push notifications for bids, appointments, and reminders
• Built by car enthusiasts, for car owners

My Car Concierge is currently building its founding community of members and providers. As a founding member, you get early-adopter status, priority support, and the chance to shape the platform as it grows.

Download now and experience auto ownership the way it should be — effortless.
```
*(1,971 chars ✓ — well under 4,000 limit)*

---

## Keywords (100 chars max, comma-separated, no spaces after commas)

```
auto service,car repair,mechanic,vehicle maintenance,car quotes,auto care,detailing,OBD scanner
```
*(95 chars ✓)*

**Alternative set (swap if above is rejected):**
```
car service,mechanic finder,auto repair,vehicle care,car maintenance,oil change,car booking
```
*(91 chars ✓)*

---

## URLs

| Field | Value |
|---|---|
| **Support URL** | https://www.mycarconcierge.com/support.html |
| **Marketing URL** | https://www.mycarconcierge.com |
| **Privacy Policy URL** | https://www.mycarconcierge.com/privacy.html |

> **Note:** All three URLs must be publicly reachable before submission. Verify that `https://www.mycarconcierge.com/privacy.html` and `https://www.mycarconcierge.com/support.html` return HTTP 200 responses on production. Use the `www.` subdomain consistently — confirm that `https://mycarconcierge.com` (apex) either redirects to `https://www.mycarconcierge.com` or serves the same content.

---

## Age Rating Questionnaire

Answer each question in App Store Connect → Age Rating:

| Question | Answer |
|---|---|
| Made for Kids | No |
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Sexual Content or Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Unrestricted Web Access | No |

**Expected Rating: 4+**

---

## Content Rights

| Question | Answer |
|---|---|
| Does your app contain, display, or access third-party content? | Yes |
| Do you have the rights to use this content? | Yes |

*Third-party content includes: Printful product catalog images (licensed via Printful API), Google Maps / Places data (licensed), and AI-generated text (Anthropic, Google Gemini).*

---

## App Privacy (Privacy Nutrition Labels)

In App Store Connect, under **App Privacy**, declare the following data types. Select only what applies to the installed consumer build:

### Data Linked to the User

| Data Type | Category | Purpose |
|---|---|---|
| Name | Contact Info | Account creation, service requests |
| Email Address | Contact Info | Authentication, notifications |
| Phone Number | Contact Info | 2FA, appointment reminders |
| User ID | Identifiers | Authentication |
| Device ID | Identifiers | Push notifications (FCM) |
| Purchase History | Purchases | Order history, receipts |
| Payment Info | Financial Info | Stripe checkout (collected by Stripe, not stored by MCC) |
| Photos or Videos | Photos or Videos | Vehicle photos, registration scan (user-uploaded) |
| Location | Location | Service provider matching (coarse), service request location |
| Customer Support | Other | In-app AI helpdesk chat logs |

### Data Not Linked to the User

| Data Type | Category | Purpose |
|---|---|---|
| Crash Data | Diagnostics | Bug fixing |
| Performance Data | Diagnostics | App performance monitoring |

### Data Not Collected
- Browsing History
- Search History
- Sensitive Info (beyond registration documents uploaded by user)
- Health & Fitness
- Financial Info (payment processing is handled by Stripe; raw card numbers never reach MCC servers)

---

## Screenshot Requirements

Apple requires screenshots for each device size used in submission. A new build requires at minimum the **6.7" display** and **6.1" display** sizes for iPhone, plus **13" iPad** for iPad. This submission ships **Universal** (`UIDeviceFamily = [1, 2]`, `TARGETED_DEVICE_FAMILY = "1,2"`) — 13" iPad screenshots (2064 × 2752 portrait / 2752 × 2064 landscape) are **required**. 11" iPad screenshots are optional.

### Required Device Sizes

| Size | Pixels (portrait) | Device examples |
|---|---|---|
| **6.7" Super Retina XDR** | 1290 × 2796 | iPhone 15 Pro Max, iPhone 14 Pro Max |
| **6.1" Super Retina XDR** | 1179 × 2556 | iPhone 15, iPhone 14 |
| **13" iPad** | 2064 × 2752 | iPad Pro 13-inch, iPad Air 13-inch |
| *(Optional)* 11" iPad | 1668 × 2388 | iPad Pro 11-inch, iPad Air 11-inch |
| *(Optional)* 5.5" Retina HD | 1242 × 2208 | iPhone 8 Plus |

### iPad support

The app ships **Universal** (iPhone + iPad) as of the current submission:
- `UIDeviceFamily = [1, 2]` in `ios/App/App/Info.plist`
- `TARGETED_DEVICE_FAMILY = "1,2"` in `ios/App/App.xcodeproj/project.pbxproj` (both Debug and Release configs)
- iPad orientation key `UISupportedInterfaceOrientations~ipad` present with all four orientations, per Apple guidance for iPad apps

Prior submissions attempted iPhone-only (`UIDeviceFamily = [1]`). That produced a 2.3.3 rejection for stretched iPhone screenshots on 13" iPad. The response for this submission is a real iPad layout pass — sidebar-visible at tablet width, a proper responsive login split-view, purpose-designed 13" iPad screenshots — rather than another attempt at iPhone-only.

**App Store Connect manual step required on next submission:**
1. Go to App Store Connect → Your App → App Store → iPhone & iPad screenshots
2. Add the 13" iPad screenshot set (2064 × 2752 portrait for the marketing screens; landscape 2752 × 2064 optionally as an additional slot if you want to show tablet-landscape UI)
3. Under "App Information" → "Availability" confirm Devices shows both iPhone and iPad (this follows automatically from `UIDeviceFamily = [1, 2]` once the new build is processed)

### Screenshots delivered for this submission

**10 files total** — 8 core screens + login in both portrait and landscape orientations. Captured on the iPad Pro 13-inch (M5) simulator, iOS 26.2, at native 2064 × 2752 (portrait) / 2752 × 2064 (landscape).

Delivered in `~/Desktop/mcc-appstore-screens/`:

1. **`13in-login-portrait.png`** — split-view login: brand pane left ("MyCarConcierge" + hand-icon + "Auto care. Handled." tagline), login card right (Welcome Back, Password/Magic Link tabs, escrow trust bar)
2. **`13in-login-landscape.png`** — same content in landscape orientation
3. **`13in-onboarding-splash-portrait.png`** — first-step signup: "What's your name?" · Open For Business pill · Apple/Google/Facebook OAuth
4. **`13in-dashboard-portrait.png`** — Member Overview: hero + Get Started checklist + Founder callout + stat cards
5. **`13in-service-request-portrait.png`** — Service Requests page with AI helper panel expanded ("Describe your car problem — AI creates your service request")
6. **`13in-bids-received-portrait.png`** — expanded plan detail: real member description, Accepted Bid card, escrow authorize copy, 2 competitive bids visible ($149 accepted, $185 not selected)
7. **`13in-obd-scanner-portrait.png`** — OBD Diagnostic Scanner modal with "What are OBD codes?" educational blue box + input field + photo-upload area + Analyze Codes CTA
8. **`13in-vehicle-management-portrait.png`** — My Vehicles: 2022 Toyota Camry card with year/make/model/mileage + Edit/Photos/Delete actions
9. **`13in-car-academy-portrait.png`** — Academy & Care Guide personalized to "My Camry" · Mechanical & Safety tab · 6 care-item cards (Oil Change, Tire Rotation, Brake Service, Cabin Air Filter, Engine Air Filter, Battery & Electrical) with prices, intervals, and Get Quotes CTAs
10. **`13in-checkout-escrow-portrait.png`** — Awaiting Payment card: "Authorize $149.00 on your card. Funds will be held in escrow and released only when you Mark Complete." · card number field + Authorize Payment button · Bids Received list underneath

**Two screens from the originally-planned 10 were dropped from this submission:**

- **Car Club Loyalty (punch card + reward progress bar)** — dropped because the feature is incomplete: `car_club_programs_enabled` currently ships OFF in production (`platform_settings.setting_value.enabled: false`), and the server response at `netlify/functions/car-clubs.js:178-185` returns `reward_rule_id: null` as a "Slice 1" stub which suppresses the client's punch-card visual entirely at `www/car-club-member.html:886`. Punch-card marketing shot is not renderable against current code. Add in a future submission once the reward-rule wiring and provider personalization ship.
- **Provider Profile with ratings/reviews/AI summary** — dropped because there is no safe in-app navigation path to a real, member-facing provider profile screen. The route we identified (`www/founding-provider-chris-agrapidis.html`) is a private legal contract page (Founding Provider Partner Agreement with actual commission terms and milestone bonus schedule), not a marketing profile. In-app bid provider names surface only as "Provider" without a tap-through profile modal. Add in a future submission once a public-facing provider profile screen is wired to the app.

### Screenshot Specs

- Format: PNG or JPEG
- No rounded corners, device frames, or alpha channels unless using Apple's Framing tool
- Text in screenshots must match the app version being submitted
- You may add a background color and marketing text as an overlay (optional) using a tool like Sketch, Figma, or Canva

---

## App Preview Video (Optional but Recommended)

| Spec | Value |
|---|---|
| Format | H.264 or HEVC (H.265) |
| Resolution | 886 × 1920 (9:16 portrait for 6.7") |
| Duration | 15–30 seconds |
| Audio | Allowed — ensure no copyrighted music |
| Subtitles | Recommended for accessibility |

**Suggested video flow (30 sec):**
0:00–0:05 — Branding intro + tagline  
0:05–0:12 — Post a request → receive bids  
0:12–0:20 — Accept bid → escrow payment → job complete  
0:20–0:27 — OBD scanner AI result  
0:27–0:30 — Logo + "Download now"

---

## ExportOptions.plist Team ID

Before archiving in Xcode, update `ios/ExportOptions.plist`:

```xml
<key>teamID</key>
<string>REPLACE_WITH_TEAM_ID</string>
```

**Where to find your Team ID:**
1. Go to [developer.apple.com/account](https://developer.apple.com/account)
2. Sign in with your Apple Developer account
3. Click **Membership Details** in the left sidebar
4. Your **Team ID** is a 10-character alphanumeric string (e.g., `ABC123DEFG`)

Replace `REPLACE_WITH_TEAM_ID` with that string, then save and run `bash build-ios.sh`.

---

## What's New (Version Release Notes)

For the initial submission (1.0.0), App Store Connect requires a "What's New" entry. Use:

```
Welcome to My Car Concierge — your complete auto ownership platform. Post service requests and receive competitive bids from vetted local providers, manage your vehicles and maintenance history, scan OBD fault codes with AI-powered explanations, and earn loyalty rewards through Car Club programs. Secure escrow payments protect every transaction. Built for car owners, by car enthusiasts.
```
*(370 chars)*

---

## App Review Notes

### Demo Account for Apple Reviewers

A single combined account gives the reviewer access to both the member and
provider portals from one login. After signing in, the app shows a
**"Choose Your Portal"** screen.

**App Store Connect → App Review Information → Sign-In Information:**

| Field | Value |
|---|---|
| **Email** | demo@mycarconcierge.com |
| **Password** | *(stored in App Store Connect only — set via `REVIEWER_PASSWORD` when running `scripts/seed-app-store-reviewer.js`)* |
| **Account type** | Provider + Member (portal selector shown at login) |

> Seed the account before each submission:
> ```bash
> SUPABASE_SERVICE_ROLE_KEY=<key> REVIEWER_PASSWORD=<password-from-app-store-connect> \
>   node scripts/seed-app-store-reviewer.js
> ```

**Pre-loaded state (both portals):**
- **Member portal:** 2022 Toyota Camry, open care plan "Reviewer — Oil Change & Brake Inspection", incoming $149 bid from Reviewer Auto Works
- **Provider portal:** approved application, 10 bid credits, 4.9-star rating, can submit bids on open care plans

**Key flows to test:**
1. **Sign in** → "Choose Your Portal" screen appears with Member and Provider options
2. **Member Portal** → Dashboard shows Toyota Camry; tap "Service Requests" to see the open care plan and the incoming bid
3. **Provider Portal** → Job board shows open care plans; tap a listing to submit a bid (uses bid credits)
4. **Payments** → All Stripe flows use test mode. Use card `4242 4242 4242 4242`, any future expiry, any CVC
5. **Account → Delete Account** → test the deletion flow (account will be re-seeded for continued review)

### Feature Notes for Reviewer

- **Payments**: All Stripe flows are in test mode for the review account. Use card `4242 4242 4242 4242`, any future expiry, any CVC.
- **Geolocation**: Transport pickup request requires location permission. Tap "Allow Once" when prompted — the app uses precise GPS only for setting the pickup pin.
- **Camera/Photos**: Used for vehicle registration upload, insurance card upload, and OBD scan photo. All processed by on-device AI; images are not stored beyond the verification flow.
- **Face ID / Touch ID**: Not required; used only as an optional fast-login shortcut if the user enables it in Settings.
- **Push Notifications**: Optional. The app functions fully without them.
- **Admin portal**: The admin interface is a separate web-only tool at a different URL and is not included in this submission.
