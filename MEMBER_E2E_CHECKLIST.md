# Member App — Manual E2E Checklist
**Platform:** iOS Simulator (iPhone 15 Pro, iOS 17+)  
**Build:** Capacitor 7 native bundle (`npx cap sync ios` → Xcode → Run)  
**Account:** demo@mycarconcierge.com  
**Purpose:** Pre-App Store submission sign-off. Run top-to-bottom in one session.

---

## 0. Pre-flight

- [ ] Xcode simulator is clean (App deleted or fresh install — no cached session).
- [ ] Network: simulator has internet access.
- [ ] Note the build commit SHA from Xcode (Product → Scheme → Edit Scheme → Run): ___________

---

## 1. Login

| Step | Action | Expected result |
|------|--------|-----------------|
| 1.1 | Launch app. | Splash → Login screen appears. Marketing footer, cookie banner, and "Need help? Contact us" link are **not visible** (native chrome stripped). |
| 1.2 | Observe top of screen. | Status bar area is filled with a solid dark (`#12161c`) strip — no scrolling content bleeds behind it. |
| 1.3 | Enter `demo@mycarconcierge.com` + password. Tap **Sign In**. | Spinner, then Dashboard loads. No error toast. |
| 1.4 | Observe status bar strip after login. | Still opaque. Scroll the dashboard list — content disappears behind the strip, never shows through. |

- [ ] 1.1 PASS / FAIL: ___
- [ ] 1.2 PASS / FAIL: ___
- [ ] 1.3 PASS / FAIL: ___
- [ ] 1.4 PASS / FAIL: ___

---

## 2. Dashboard

| Step | Action | Expected result |
|------|--------|-----------------|
| 2.1 | View the dashboard. | **Exactly one** "Become a Member Founder" gold banner visible (not two stacked). |
| 2.2 | View the "Get Started" checklist (if visible). | Step 1 "Create your account" is checked. Progress bar and text reflect real completion count (not hardcoded "0% / 1 of 5"). |
| 2.3 | View the Rideshare Profit Calculator card. | Copy reads "Are you really making money driving for **rideshare or delivery apps**?" — no "Uber", "Lyft", or "DoorDash" anywhere on this card. |
| 2.4 | Check tab bar at bottom. | All tabs fit without overflow; tabs are scrollable/swipeable if many are present. |

- [ ] 2.1 PASS / FAIL: ___
- [ ] 2.2 PASS / FAIL: ___
- [ ] 2.3 PASS / FAIL: ___
- [ ] 2.4 PASS / FAIL: ___

---

## 3. Add a Vehicle

| Step | Action | Expected result |
|------|--------|-----------------|
| 3.1 | Tap **Vehicles** tab (or "Add your first vehicle" checklist step). | Vehicle list screen opens. |
| 3.2 | Tap **+ Add Vehicle**. Fill in: Year=2020, Make=Honda, Model=Accord, Nickname=Test Car. Tap **Save**. | Vehicle appears in the list with the nickname. No error. |
| 3.3 | Return to Dashboard. | Stats tile shows ≥ 1 vehicle. If checklist visible, "Add your first vehicle" step now shows as complete. |

- [ ] 3.1 PASS / FAIL: ___
- [ ] 3.2 PASS / FAIL: ___
- [ ] 3.3 PASS / FAIL: ___

---

## 4. Create a Maintenance Request

| Step | Action | Expected result |
|------|--------|-----------------|
| 4.1 | Tap **Requests** tab or **+ New Request** button. | Service request / package modal opens. |
| 4.2 | Fill in: Title = "Oil Change", select the Honda Accord added in step 3.2, pick any service category. Tap **Submit**. | Request created. Confirmation shown (toast or modal close). |
| 4.3 | Navigate to the Requests list. | "Oil Change" package appears in the list with correct vehicle name. |
| 4.4 | Check the "Pickup" dropdown within the request form (if visible). | Option reads "I'll drive there, need ride home **(rideshare)**" — not "(Uber/Lyft)". |

- [ ] 4.1 PASS / FAIL: ___
- [ ] 4.2 PASS / FAIL: ___
- [ ] 4.3 PASS / FAIL: ___
- [ ] 4.4 PASS / FAIL: ___

---

## 5. Request-a-Driver Modal (Dispatch OFF state)

| Step | Action | Expected result |
|------|--------|-----------------|
| 5.1 | From the dashboard or Requests tab, find and tap **Request Vehicle Pickup** (or **Schedule Driver**). | Driver/concierge request modal opens. |
| 5.2 | Read the intro copy. | Copy reads something like: "Pick a service tier and submit your request — our team will match you with available MCC drivers." **No** "we'll dispatch one or two MCC drivers" wording. |
| 5.3 | Confirm pickup address field. | Field shows placeholder text (e.g., "123 Home St") — field is **empty**, not pre-filled with a hardcoded value. |
| 5.4 | Tap **Use my location** (if visible). | App requests location permission (first time). After granting, field populates with a real street address. |
| 5.5 | Dismiss modal without submitting. | Modal closes cleanly. |

- [ ] 5.1 PASS / FAIL: ___
- [ ] 5.2 PASS / FAIL: ___
- [ ] 5.3 PASS / FAIL: ___
- [ ] 5.4 PASS / FAIL: ___
- [ ] 5.5 PASS / FAIL: ___

---

## 6. Settings — Face ID / Biometric Login

| Step | Action | Expected result |
|------|--------|-----------------|
| 6.1 | Tap **Settings** (gear icon or Settings tab). | Settings screen opens. |
| 6.2 | Scroll to the **Biometric Login** card (between 2FA and Login Activity). | Card is visible. Toggle shows **OFF** (first-time state). |
| 6.3 | Tap the toggle to enable biometric login. | System Face ID prompt appears (or Touch ID on compatible device). Authenticate. | 
| 6.4 | After auth succeeds, check the toggle. | Toggle is now **ON**. No error toast. |

- [ ] 6.1 PASS / FAIL: ___
- [ ] 6.2 PASS / FAIL: ___
- [ ] 6.3 PASS / FAIL: ___
- [ ] 6.4 PASS / FAIL: ___

---

## 7. Quit and Relaunch — Face ID Unlock

| Step | Action | Expected result |
|------|--------|-----------------|
| 7.1 | Swipe the app away from the app switcher (force-quit). | App is fully terminated. |
| 7.2 | Relaunch the app. | Login screen appears briefly, then Face ID prompt appears automatically. |
| 7.3 | Authenticate with Face ID (or tap "Use Passcode" if Face ID unavailable in simulator). | Dashboard loads — **no password entry required**. |
| 7.4 | Confirm session state. | Previously added vehicle (Honda Accord) and Oil Change request still present. |

- [ ] 7.1 PASS / FAIL: ___
- [ ] 7.2 PASS / FAIL: ___
- [ ] 7.3 PASS / FAIL: ___
- [ ] 7.4 PASS / FAIL: ___

> **Simulator note:** Face ID must be enrolled in the simulator: *Features → Face ID → Enrolled*, then use *Features → Face ID → Matching Face* to simulate a successful scan.

---

## 8. Logout and Re-login — State Persistence

| Step | Action | Expected result |
|------|--------|-----------------|
| 8.1 | Go to Settings → scroll to bottom → tap **Log Out**. | Confirm dialog (if any) → Login screen appears. |
| 8.2 | Log back in as `demo@mycarconcierge.com`. | Dashboard loads cleanly. |
| 8.3 | Check Vehicles tab. | Honda Accord added in step 3.2 is still present. |
| 8.4 | Check Requests tab. | "Oil Change" package from step 4.2 is still present. |
| 8.5 | Go to Settings → Biometric Login card. | Toggle is still **ON** (pref persisted across logout/login). |

- [ ] 8.1 PASS / FAIL: ___
- [ ] 8.2 PASS / FAIL: ___
- [ ] 8.3 PASS / FAIL: ___
- [ ] 8.4 PASS / FAIL: ___
- [ ] 8.5 PASS / FAIL: ___

---

## 9. Post-run Cleanup

| Step | Action |
|------|--------|
| 9.1 | Delete the "Test Car" Honda Accord added in step 3.2. |
| 9.2 | Delete or archive the "Oil Change" request added in step 4.2. |
| 9.3 | (Optional) Disable biometric login in Settings before finishing. |

---

## Sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Build commit | |
| iOS Simulator version | |
| All steps passed? | YES / NO |
| Blocking issues found | |
| Notes | |
