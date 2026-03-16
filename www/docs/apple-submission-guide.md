# My Car Concierge - Apple App Store Submission Guide v1.2 (Build 1)

## Pre-Submission Checklist

### 1. Demo Account for Apple Review

Apple requires a demo account to test your app. Create one at:
https://www.mycarconcierge.com/signup.html

**Recommended Demo Credentials:**
- Email: `applereview@mycarconcierge.com`
- Password: `AppleReview2024!`

After creating, add a test vehicle and ensure the account has full access to features.

---

### 2. Apple Developer Portal Setup

Login at: https://developer.apple.com

#### A. Register Capabilities for Bundle ID
1. Go to **Certificates, Identifiers & Profiles**
2. Select **Identifiers** → Find `com.zanetisholdings.mycarconcierge`
3. Enable these capabilities:
   - [x] Push Notifications
   - [x] Sign In with Apple
   - [x] Apple Pay

#### B. Register Apple Pay Merchant ID
1. Go to **Identifiers** → **Merchant IDs**
2. Create: `merchant.com.zanetisholdings.mycarconcierge`
3. Associate with your App ID

#### C. Create/Update Provisioning Profile
1. Go to **Profiles**
2. Create new **App Store Distribution** profile
3. Select your App ID and distribution certificate
4. Download and install in Xcode

---

### 3. Xcode Setup

#### A. Open Project
```bash
cd ios/App
open App.xcworkspace
```

#### B. Verify Signing & Capabilities
1. Select **App** target
2. Go to **Signing & Capabilities** tab
3. Verify these appear:
   - Push Notifications
   - Sign In with Apple  
   - Apple Pay (with merchant ID)

#### C. Build Settings
- **Version**: 1.2
- **Build**: 1
- **Bundle ID**: com.zanetisholdings.mycarconcierge

#### D. Archive for App Store
1. Select **Any iOS Device (arm64)** as destination
2. **Product** → **Archive**
3. Once complete, **Distribute App** → **App Store Connect**

---

### 4. App Store Connect

Login at: https://appstoreconnect.apple.com

#### A. App Information
- **Version**: 1.2
- **What's New**: (see below)

#### B. App Review Information
- **Demo Account Email**: applereview@mycarconcierge.com
- **Demo Account Password**: AppleReview2024!
- **Notes for Review**: 
  ```
  My Car Concierge is an automotive service marketplace connecting 
  vehicle owners with service providers. This is a streamlined 
  consumer app — admin and marketing tools are available on the 
  website only.

  Key features to test:
  1. Sign up/Login flow (includes Face ID/Touch ID)
  2. Add a vehicle (My Garage)
  3. Browse and request service quotes
  4. View Car Care Academy articles
  5. OBD Diagnostic Scanner
  6. Merch Store
  
  No platform fees — providers keep 100% of job earnings.
  Payment features use Stripe test mode — no real charges will occur.
  Location features work best with location permissions enabled.
  ```

#### C. Privacy Policy URL
https://www.mycarconcierge.com/privacy.html

#### D. Support URL
https://www.mycarconcierge.com/support.html

---

### 5. App Privacy Labels

Declare in App Store Connect under **App Privacy**:

| Data Type | Collection | Usage |
|-----------|------------|-------|
| Email Address | Collected | App Functionality, Account |
| Name | Collected | App Functionality |
| Phone Number | Optional | Account, 2FA |
| Payment Info | Collected | Payments (via Stripe) |
| Precise Location | Collected | App Functionality |
| Photos | Collected | App Functionality |
| Device ID | Collected | Analytics |

---

### 6. Screenshots Required

Prepare screenshots for:
- **iPhone 6.7"** (iPhone 15 Pro Max) - Required
- **iPhone 6.5"** (iPhone 11 Pro Max) - Required  
- **iPhone 5.5"** (iPhone 8 Plus) - Required
- **iPad Pro 12.9"** - If supporting iPad

Key screens to capture:
1. Homepage/Dashboard
2. Add Vehicle flow
3. Service Providers list
4. Car Care Academy
5. Profile/Settings

---

## What's New in v1.2 (Build 1)

```
Version 1.2 brings an improved experience across the board:

- No platform fees — providers keep 100% of job earnings
- Face ID/Touch ID login for faster, secure access
- Car Club loyalty rewards for repeat customers
- OBD Diagnostic Scanner with AI-powered code explanations
- AI Helpdesk Widget for instant car care guidance
- Merch Store with Stripe checkout
- Snow removal and property-based services
- Conversational onboarding for smoother signup
- Performance, stability, and accessibility improvements
- Updated to Capacitor v7 for better native integration
```

---

## Streamlined iOS Build

The iOS app is a focused consumer experience. The following are 
excluded from the iOS build (available on the website only):

- Admin portal and admin management tools
- Admin team management (admin-team.js)
- AI Outreach Engine and marketing automation
- Provider brochures, presentations, and investor documents
- Internal documentation, submission guides, and SQL migration files
- Netlify functions directory
- HubSpot CRM integration
- Analytics tracker (admin-facing)
- Data directory (admin-users.json, admin-invites.json)
- Replit API URL is patched out of mcc-config.js

This keeps the app lightweight and focused on what members and 
providers need: finding services, managing vehicles, and getting work done.

---

## Common Rejection Reasons to Avoid

1. **Broken links** - Test all external URLs
2. **Placeholder content** - Remove any "Lorem ipsum" or test data
3. **Crash on launch** - Test on multiple iOS versions
4. **Missing privacy descriptions** - All added in Info.plist
5. **No demo account** - Create before submission
6. **Guideline 4.2** - App has extensive native features (Face ID, Apple Pay, Camera, Location)

---

## Final Checklist

- [ ] Demo account created and tested
- [ ] Capabilities enabled in Apple Developer Portal
- [ ] Provisioning profile updated and installed
- [ ] Xcode shows all capabilities in Signing tab
- [ ] Run `scripts/ios-build.sh` to sync and strip admin files
- [ ] Clean archive builds successfully
- [ ] Uploaded to App Store Connect
- [ ] What's New text added
- [ ] Demo credentials entered in App Review section
- [ ] Screenshots uploaded for all required sizes
- [ ] App Privacy labels completed
- [ ] Submit for review
