# Task #425 — iOS Launch Handoff (Steps 7-9)

The six code blockers are fixed (see commit). The remaining three steps must
run on a Mac with Xcode + your Apple Developer account; they cannot run from
the Replit container.

## What you must do on your Mac

### 1. Apply the new Supabase migrations (production)

Open the Supabase SQL Editor against the **production** project and run, in
order:

1. `supabase/migrations/20260516_sms_opt_out.sql` — adds
   `profiles.sms_opt_out` + `sms_opt_out_log` (TCPA STOP keyword storage).
2. `supabase/migrations/20260516b_bid_credit_grants.sql` — adds
   `bid_credit_grants` (idempotency log for the Stripe webhook).

### 2. Set the new Netlify env vars

| Var | Value | Notes |
| --- | --- | --- |
| `TWILIO_INBOUND_PUBLIC_URL` | `https://www.mycarconcierge.com/api/twilio/sms-inbound` | Required so Twilio's signature validation matches the bytes Twilio actually signed. |
| `TWILIO_SIGNATURE_REQUIRED` | `true` | Default. Setting this to `false` disables signature checks (dev only — never set in production). |

### 3. Wire Twilio's "A message comes in" webhook

In the Twilio console, on your messaging number's configuration:

- Webhook URL: `https://www.mycarconcierge.com/api/twilio/sms-inbound`
- Method: `HTTP POST`

Send yourself a real "STOP" from a phone whose number is on a `profiles.phone`
row, then verify in Supabase that `profiles.sms_opt_out` flipped to `true` and
a row appeared in `sms_opt_out_log`. Reply "START" to verify the un-opt-out.

### 4. Set the iOS Team ID

Edit `ios/ExportOptions.plist` and replace `REPLACE_WITH_TEAM_ID` with your
Apple Developer Team ID (10-character string from
developer.apple.com -> Account -> Membership).

### 5. Build, archive, upload (Xcode)

```bash
npm run cap:sync
open ios/App/App.xcworkspace
```

In Xcode:

1. Select the `App` target -> "Signing & Capabilities" -> confirm Team is
   set and "Automatically manage signing" is on.
2. Bump Build number (Targets -> App -> General -> Identity -> Build).
3. Product -> Destination -> "Any iOS Device (arm64)".
4. Product -> Archive. Wait for the archive to appear in Organizer.
5. In Organizer: Distribute App -> App Store Connect -> Upload, accept
   automatic signing, finish.

### 6. App Store Connect

In <https://appstoreconnect.apple.com>:

1. Wait for the build to finish processing (5-30 minutes).
2. App Store -> iOS app -> "+" version -> select the new build.
3. Confirm `docs/appstore-metadata.md` copy (description / keywords /
   screenshots) is current.
4. Submit for Review.

## Verification on your Mac before uploading

```bash
# Bundle slimming + clean checks
npm run cap:sync
bash scripts/verify-mobile-bundle.sh ios/App/App/public

# Function tests (mirrors what's in CI)
npm test
```

`npm test` ships with one pre-existing unrelated failure
(`netlify/functions-tests/plan-bids-self-bid.test.js` — that's tracked
separately, not a launch blocker for #425).
