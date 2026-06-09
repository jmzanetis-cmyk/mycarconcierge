# App Store Metadata — My Car Concierge

This document contains all required text content for App Store Connect submission.
Copy each field exactly into App Store Connect. Character counts are noted where limits apply.

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

Apple requires screenshots for each device size used in submission. A new build requires at minimum the **6.7" display** and **6.1" display** sizes. The app is iPhone-only (`UIDeviceFamily = [1]`); iPad screenshots are not required or accepted.

### Required Device Sizes

| Size | Pixels (portrait) | Device examples |
|---|---|---|
| **6.7" Super Retina XDR** | 1290 × 2796 | iPhone 15 Pro Max, iPhone 14 Pro Max |
| **6.1" Super Retina XDR** | 1179 × 2556 | iPhone 15, iPhone 14 |
| *(Optional)* 5.5" Retina HD | 1242 × 2208 | iPhone 8 Plus |

### iPhone-only decision

The app is restricted to iPhone (`UIDeviceFamily = [1]` in `ios/App/App/Info.plist`) as of v1.
iPad support can be added in a future release if there is demand.

**App Store Connect manual step required on next submission:**
1. Go to App Store Connect → Your App → App Store → iPhone & iPad screenshots
2. Delete any existing iPad screenshots from the listing (previously submitted stretched iPhone images)
3. Under "App Information" → "Availability" confirm Devices shows iPhone only (this follows automatically from `UIDeviceFamily` once the new build is processed)

### Recommended Screenshots (5–10 per device, minimum 3)

Capture the following screens in order. Use the iOS Simulator on a Mac or a physical device:

1. **Home / Onboarding splash** — "One app. Every auto need. Zero hassle." hero screen or welcome animation
2. **Member Dashboard** — active vehicle summary with service recommendation panel
3. **Post a Service Request** — request creation form showing category selection and description
4. **Bids Received** — list of competitive bids from providers with the AI Smart Bid Analyzer card visible
5. **OBD Diagnostic Scanner** — fault code entry and AI explanation result
6. **Vehicle Management** — multi-vehicle garage view with maintenance history
7. **Car Club Loyalty** — punch card in progress with reward progress bar
8. **Car Academy** — AI chat expert or education article view
9. **Secure Checkout / Escrow** — payment confirmation screen
10. **Provider Profile** — provider card with ratings, reviews, and AI review summary

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
