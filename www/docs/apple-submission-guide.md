# My Car Concierge - Apple App Store Submission Guide v1.1

## Pre-Submission Checklist

### 1. Demo Account for Apple Review

Apple requires a demo account to test your app. Create one at:
https://my-car-concierge.replit.app/signup.html

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
- **Version**: 1.1
- **Build**: 2
- **Bundle ID**: com.zanetisholdings.mycarconcierge

#### D. Archive for App Store
1. Select **Any iOS Device (arm64)** as destination
2. **Product** → **Archive**
3. Once complete, **Distribute App** → **App Store Connect**

---

### 4. App Store Connect

Login at: https://appstoreconnect.apple.com

#### A. App Information
- **Version**: 1.1
- **What's New**: (see below)

#### B. App Review Information
- **Demo Account Email**: applereview@mycarconcierge.com
- **Demo Account Password**: AppleReview2024!
- **Notes for Review**: 
  ```
  This is an automotive service marketplace connecting vehicle owners 
  with service providers. Key features to test:
  1. Sign up/Login flow
  2. Add a vehicle
  3. Browse service providers
  4. View Car Care Academy articles
  
  Payment features require Stripe test mode - no real charges will occur.
  Location features work best with location permissions enabled.
  ```

#### C. Privacy Policy URL
https://my-car-concierge.replit.app/privacy.html

#### D. Support URL
https://my-car-concierge.replit.app/support.html

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

## What's New in v1.1

```
Version 1.1 brings enhanced security and usability improvements:

- Added Face ID/Touch ID login for faster, secure access
- Improved camera permissions for document scanning
- Enhanced location services for finding nearby providers
- Better photo library integration for uploading documents
- Performance and stability improvements
```

---

## Common Rejection Reasons to Avoid

1. **Broken links** - Test all external URLs
2. **Placeholder content** - Remove any "Lorem ipsum" or test data
3. **Crash on launch** - Test on multiple iOS versions
4. **Missing privacy descriptions** - All added in Info.plist ✓
5. **No demo account** - Create before submission
6. **Guideline 4.2** - Ensure app has enough features/utility

---

## Final Checklist

- [ ] Demo account created and tested
- [ ] Capabilities enabled in Apple Developer Portal
- [ ] Provisioning profile updated and installed
- [ ] Xcode shows all capabilities in Signing tab
- [ ] Clean archive builds successfully
- [ ] Uploaded to App Store Connect
- [ ] What's New text added
- [ ] Demo credentials entered in App Review section
- [ ] Screenshots uploaded for all required sizes
- [ ] App Privacy labels completed
- [ ] Submit for review
