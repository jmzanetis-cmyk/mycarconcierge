# iOS App Store Build Guide

This guide explains how to produce a clean, consumer-only iOS build of My Car Concierge and submit it to the App Store.

## Overview

The iOS consumer build strips all admin, outreach, marketing, and server-only code from the `www/` directory before syncing to Capacitor. The result is a member-focused app that includes:

- Member dashboard, bookings, and vehicle management
- OBD diagnostic scanner
- Car Club loyalty program
- Merch store (Printful + Stripe)
- Push notifications (FCM)
- Biometric login
- Mobile wallet payments
- Onboarding flows

**Removed from the consumer build:**
- Admin portal (`admin.html`, `admin.js`, `admin-outreach.js`, `providers.js`, etc.)
- Outreach engine (`outreach-engine-api.js`)
- Server-side code (`server.js`, `simulate.js`, `playwright.config.js`)
- Marketing and investor documents (all MCC-*.html, pitch decks, brochures)
- SQL files, stress-test scripts, and Netlify functions

**Retained in the consumer build** (required for member features):
- `stripeutils.js` — Stripe payment flows used by members
- `mcc-config.js` — API base URL routing; the Replit URL is intentionally kept as it is used by the native app's `isNativeApp` detection path for API calls to the production server
- All member-facing JS (`members*.js`, `biometric-auth.js`, `mobile-pay.js`, etc.)

## Prerequisites

Before building for iOS you need:

- macOS with Xcode 15 or later
- An Apple Developer account with a valid signing certificate and provisioning profile
- CocoaPods installed (`sudo gem install cocoapods`)
- Node.js 18+ and npm
- Capacitor CLI available (`npx cap` works without global install)

## Script Reference

There are two strip scripts — use `scripts/build-ios.sh` for all new work:

| Script | Purpose |
|---|---|
| `scripts/build-ios.sh` | **Canonical consumer build** — copy, strip, patch, validate, cap sync |
| `scripts/ios-build.sh` | Legacy — called by root `build-ios.sh` archive pipeline only |

Use `scripts/build-ios.sh` directly for development iteration. Use root `build-ios.sh` when you are ready to produce a signed IPA for App Store submission.

## Quick Start (Automated Archive)

This runs the full pipeline: strip consumer build → Capacitor sync → Xcode archive → IPA export.

```bash
bash build-ios.sh
```

This calls `scripts/ios-build.sh` (the legacy strip + sync step used by the archive pipeline), then runs `xcodebuild` to produce an IPA at `build/export/`. For day-to-day development use `scripts/build-ios.sh` directly (see Step-by-Step below).

Before running, update your Team ID in `ios/ExportOptions.plist`:

```xml
<key>teamID</key>
<string>YOUR_TEAM_ID_HERE</string>
```

Find your Team ID at [developer.apple.com/account](https://developer.apple.com/account) under Membership Details.

## Step-by-Step (Manual)

### 1. Run the consumer build script

```bash
bash scripts/build-ios.sh
```

This copies `www/` to `www-ios/`, strips all admin/server/marketing files, patches HTML/JS for consumer-only mode, runs the validation check, then syncs to Capacitor (`npx cap copy ios && npx cap sync ios`).

The script temporarily changes `capacitor.config.json` to `webDir: "www-ios"` during the Capacitor sync, then restores it to `www` automatically.

### 2. Validate the build

The build script automatically runs `scripts/build-ios-check.sh`. You can also run it manually at any time:

```bash
bash scripts/build-ios-check.sh
```

This checks that:
- No admin files remain (`admin.html`, `admin.js`, `providers.js`, etc.)
- No server-only files remain (`server.js`, etc.)
- No SQL or stress-test files remain
- No `admin.html` references in consumer HTML/JS
- `login.js` admin redirect has been patched
- All required member-facing files are present

### 3. Open Xcode

Xcode does not open automatically. Open it with either:

```bash
# Option A: via the build script (re-strips and re-syncs, then opens)
bash scripts/build-ios.sh --open

# Option B: directly (after the build script has already run)
npx cap open ios
```

### 4. Configure Signing in Xcode

1. Select the `App` target in the Project navigator
2. Go to **Signing & Capabilities**
3. Select your **Team** from the dropdown
4. Confirm the **Bundle Identifier** is `com.zanetisholdings.mycarconcierge`
5. Ensure the **Provisioning Profile** resolves automatically (or select manually)

### 5. Set Version and Build Number

In **General → Identity**:
- **Version**: e.g., `1.0.0` (user-facing version shown in the App Store)
- **Build**: e.g., `1` (increment for each App Store upload)

### 6. Archive the App

1. Select **Any iOS Device (arm64)** as the build destination (not a simulator)
2. Go to **Product → Archive**
3. Wait for the archive to complete — Xcode Organizer opens automatically

### 7. Distribute to App Store Connect

In Xcode Organizer:

1. Select the archive
2. Click **Distribute App**
3. Choose **App Store Connect**
4. Choose **Upload** (direct to App Store Connect) or **Export** (saves an IPA locally)
5. Follow the wizard — use Automatic signing

### 8. Complete the Submission in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Select **My Car Concierge** under My Apps
3. Under the iOS section, select your new build
4. Fill in all required metadata (description, keywords, screenshots, privacy URL)
5. Submit for Review

## App Configuration

The Capacitor config is at `capacitor.config.json`:

```json
{
  "appId": "com.zanetisholdings.mycarconcierge",
  "appName": "My Car Concierge",
  "webDir": "www",
  "server": {
    "url": "https://www.mycarconcierge.com",
    ...
  }
}
```

The `server.url` points to production. The iOS app loads the bundled `www-ios` assets for its UI but makes API calls to the production server URL defined in `mcc-config.js`. The `scripts/build-ios.sh` temporarily changes `webDir` to `www-ios` during the Capacitor sync, then restores it.

## File Reference

| File | Purpose |
|------|---------|
| `build-ios.sh` | Full pipeline: strip → sync → pod install → xcodebuild archive + export IPA |
| `scripts/build-ios.sh` | Consumer build: copies www → www-ios, strips files, patches HTML/JS, syncs Capacitor |
| `scripts/build-ios-check.sh` | Validates the consumer build — run standalone or as part of build |
| `scripts/ios-build.sh` | Alternative strip script that operates on ios/App/App/public/ directly after cap sync |
| `scripts/ios-run.sh` | Run on a connected device for local testing |
| `ios/ExportOptions.plist` | Xcode export settings — update `teamID` before archiving |
| `capacitor.config.json` | Capacitor app configuration (appId, plugins, etc.) |

## Troubleshooting

**Pod install fails:**
```bash
cd ios/App && pod repo update && pod install
```

**Signing errors in Xcode:**
- Make sure your Apple Developer certificate is in Keychain Access
- Try **Product → Clean Build Folder** then archive again
- Re-download your provisioning profile from the Apple Developer portal

**"No provisioning profiles" error:**
- Sign in to Xcode with your Apple ID: Xcode → Settings → Accounts
- Download your profiles manually: Manage Certificates → Download All Profiles

**Build check fails (admin references found):**
- Re-run `bash scripts/build-ios.sh` — it regenerates `www-ios/` from scratch each time
- If a specific file still contains admin references, add a targeted `sed` patch in `scripts/build-ios.sh`

**App crashes on launch:**
- The `capacitor.config.json` `server.url` points to production — make sure production is live
- For local testing, comment out the `server` block and run `npx cap run ios` with a local server
