# Step 6D Smoke Test — Chain of Custody (Member UI)

**Commit under test:** `ad492bd`  
**Pre-requisite:** Netlify deploy of `ad492bd` must show "Published" before running any browser step.  
Check your Netlify dashboard — deploys are listed at the top with their short SHA.

---

## Part A — Pre-Flight

### A1. Get Your UUID

Run in the Supabase SQL editor (production project):

```sql
SELECT id, email
FROM auth.users
WHERE email = 'jm.zanetis@gmail.com';
```

Copy the `id` value. Every query below that says `'YOUR_UUID'` means this value.  
Example format: `a1b2c3d4-0000-0000-0000-e5f6a7b8c9d0`

---

### A2. Check the Feature Flag State

```sql
SELECT setting_value
FROM platform_settings
WHERE setting_key = 'custody_chain_enabled';
```

**Interpret the result:**

| `setting_value` | What it means |
|---|---|
| `{ "enabled": true }` | Flag is globally on — every user sees the panel. Skip A3. |
| `{ "enabled": false, "test_users": ["YOUR_UUID", ...] }` | Flag is per-user. If your UUID is in the array, you're enrolled. |
| `{ "enabled": false, "test_users": [] }` or UUID missing | You are not enrolled. Run A3. |
| Row missing entirely | Flag doesn't exist. Run A3-alt below. |

---

### A3. Enroll Yourself in test_users (if needed)

If the row exists but your UUID is not in `test_users`:

```sql
UPDATE platform_settings
SET setting_value = jsonb_set(
  setting_value,
  '{test_users}',
  COALESCE(setting_value -> 'test_users', '[]'::jsonb)
  || to_jsonb('YOUR_UUID'::text)
)
WHERE setting_key = 'custody_chain_enabled';
```

**A3-alt — if the row doesn't exist at all:**

```sql
INSERT INTO platform_settings (setting_key, setting_value)
VALUES (
  'custody_chain_enabled',
  jsonb_build_object('enabled', false, 'test_users', jsonb_build_array('YOUR_UUID'))
);
```

Verify with the A2 query — your UUID must appear in the array before continuing.

---

### A4. Confirm You Have a Suitable Package + concierge_jobs Row

```sql
SELECT
  mp.id          AS package_id,
  mp.title,
  mp.status      AS pkg_status,
  mp.accepted_bid_id,
  b.provider_id,
  cj.id          AS job_id,
  cj.status      AS job_status
FROM maintenance_packages mp
JOIN bids b
  ON b.id = mp.accepted_bid_id
LEFT JOIN concierge_jobs cj
  ON cj.package_id = mp.id
WHERE mp.member_id = 'YOUR_UUID'
  AND mp.status IN ('accepted', 'in_progress')
ORDER BY mp.created_at DESC
LIMIT 10;
```

**You need at least one row where `job_id` is NOT NULL.**

- If `job_id` is NULL on an otherwise good row: the Option B trigger didn't fire for this package. Run the backfill in `docs/specs/custody-and-car-clubs/option-b-backfill.sql` to create the job row.
- If no rows at all: you have no accepted packages. Go to A5.

Note the `package_id` and `job_id` for the row you'll test with. Also confirm `provider_id` is NOT NULL — it's required for the handoff creation step.

---

### A5. Create Minimal Test Data (only if A4 returns nothing)

Use your own UUID as member, and find Chris's provider UUID:

```sql
-- Find Chris's provider UUID
SELECT id, name
FROM providers
WHERE name ILIKE '%Chris%'
ORDER BY created_at
LIMIT 5;
```

Copy Chris's `id` as `CHRIS_UUID`. Then:

```sql
-- 1. Create a test package (replace VEHICLE_ID with one of your vehicle UUIDs)
--    Find your vehicles:
SELECT id, year, make, model FROM member_vehicles WHERE member_id = 'YOUR_UUID' LIMIT 5;

-- 2. Insert the package
INSERT INTO maintenance_packages (member_id, vehicle_id, title, status, description)
VALUES ('YOUR_UUID', 'YOUR_VEHICLE_ID', '[SMOKE TEST] Custody 6D', 'pending', 'Temporary smoke test package — delete after test')
RETURNING id;
-- Note the returned package id as TEST_PACKAGE_ID

-- 3. Insert a bid from Chris
INSERT INTO bids (package_id, provider_id, price, status)
VALUES ('TEST_PACKAGE_ID', 'CHRIS_UUID', 150.00, 'pending')
RETURNING id;
-- Note the returned bid id as TEST_BID_ID

-- 4. Accept the bid (this fires the trigger and auto-creates the concierge_jobs row)
UPDATE bids SET status = 'accepted' WHERE id = 'TEST_BID_ID';
UPDATE maintenance_packages
SET status = 'accepted', accepted_bid_id = 'TEST_BID_ID'
WHERE id = 'TEST_PACKAGE_ID';

-- 5. Confirm the trigger created the job row
SELECT id AS job_id, status, provider_id
FROM concierge_jobs
WHERE package_id = 'TEST_PACKAGE_ID';
```

If the job row is missing after step 4, insert it manually:

```sql
INSERT INTO concierge_jobs (member_id, provider_id, package_id, member_vehicle_id, tier, scenario, status, total_price_cents, notes)
SELECT mp.member_id, b.provider_id, mp.id, mp.vehicle_id, 1, 1, 'scheduled', 15000, 'Manual smoke test row'
FROM maintenance_packages mp
JOIN bids b ON b.id = mp.accepted_bid_id
WHERE mp.id = 'TEST_PACKAGE_ID';
```

---

## Part B — Browser Steps

Open Chrome/Safari with DevTools ready (F12 → Network tab, Console tab).  
Clear the Network log before each step so you can isolate calls.  
Use your live Netlify member portal URL throughout.

---

### Step 1 — Load Member Portal: Feature Flag Fetch

**Action:** Navigate to `/members.html` (or your Netlify URL equivalent). Log in if needed. Wait for the dashboard to finish loading (spinner goes away).

**DevTools → Network:**  
Filter by `/api/me/feature-flags`.  
You should see exactly one `GET` request. Click it.

| Check | Expected |
|---|---|
| Status | `200` |
| Response body | `{ "success": true, "flags": { "custody_chain_enabled": true, "car_club_programs_enabled": ... } }` |
| `custody_chain_enabled` | `true` — if `false`, your UUID isn't in test_users; re-run A3 and hard-refresh |

**DevTools → Console:**  
No red errors. No `custody` or `feature-flags` errors.

---

### Step 2 — Navigate to Package Detail: Panel Appears

**Action:** In the member portal, go to the Packages section. Find the accepted package from A4 (or the one you created in A5). Click "Open →" (or click the package card) to open the package detail modal.

**What to see visually:**
1. The package detail modal opens.
2. Scroll down inside the modal to the logistics section (below Appointment, Transfer, Location panels).
3. A card titled **"Chain of Custody"** with a shield icon should appear.
4. Inside that card: `"Loading custody chain..."` briefly, then it resolves.

**DevTools → Network (after modal opens):**  

Expect these calls in order (within ~500ms of the modal opening):

| Request | Expected response |
|---|---|
| `GET /api/custody/jobs/{job_id}` | `200`, body has `{ success: true, job_id: "...", handoffs: [], photos: [], ... }` |

The `handoffs: []` is correct — no handoffs exist yet.

**DevTools → Console:**  
After the custody chain loads, run this in the console to inspect the section element's dataset:

```javascript
// Replace with your actual package UUID from A4
const pkgId = 'YOUR_PACKAGE_ID';
const el = document.getElementById(`custody-chain-section-${pkgId}`);
console.log('job_id:', el?.dataset?.jobId);
console.log('provider_id:', el?.dataset?.providerId);
```

Both values must be non-empty UUID strings. If `job_id` is empty string or undefined: `loadCustodyChain` failed silently — check the Network tab for the `/api/custody/jobs/` call and its response.

**What to see visually (empty state):**  
Inside the "Chain of Custody" card:
> No handoffs recorded yet. Use the button below when handing off your vehicle.

And below it: a **"Start Vehicle Handoff"** button (primary blue, camera icon).

**Failure mode to catch here:**  
- Card doesn't appear at all → feature flag is not returning `true`. Re-check A2/A3.
- Card appears but `job_id` dataset is empty → `concierge_jobs` row is missing for this package. Re-run A4's check query.

---

### Step 3 — Click "Start Vehicle Handoff": Handoff Created + Capture UI Opens

**Action:** Click the **"Start Vehicle Handoff"** button.

**DevTools → Network:**

| Request | Expected |
|---|---|
| `POST /api/custody/handoffs` | `200`, body: `{ "success": true, "handoff": { "id": "...", "job_id": "...", "leg": "member_to_provider", "status": "pending", ... } }` |

Note the `handoff.id` value — you'll verify photos reference it in Step 4.

**What to see visually:**  
A fullscreen overlay appears immediately after the POST responds. It shows:

```
Step 1 of 7
Front of Vehicle
[ 📷 Take Photo ]
[ Skip this angle ]
```

The file picker (or camera on mobile) opens automatically. On desktop this is the OS file chooser dialog.

**Failure mode — if POST /api/custody/handoffs returns 403:**  
Body will say `"feature_not_enabled"`. The feature flag check is running again server-side. Your UUID must be in `test_users` — re-run A3. Note: the client-side flag check and server-side check are independent; both must pass.

**Failure mode — if POST returns 400 with `"Not a party to this job"`:**  
The `concierge_jobs` row exists but `member_id` doesn't match your UUID. Run:
```sql
SELECT member_id, provider_id FROM concierge_jobs WHERE id = 'YOUR_JOB_ID';
```
The `member_id` must equal your UUID.

---

### Step 4 — Capture Photos: 7 Angles, Storage Upload + Metadata POST per Photo

For each of the 7 angles (`Front`, `Rear`, `Driver Side`, `Passenger Side`, `Odometer`, `Interior – Front Seats`, `Interior – Rear Seats`):

**Action per angle:**
1. File picker opens — select any image file from your Mac (a screenshot is fine, the test is about the upload flow not photo quality).
2. A preview renders inside the overlay.
3. A quality check runs (brightness + sharpness). If the image is dark or blurry you'll see an orange warning — click **"Use Anyway — Next"** to continue.
4. If the image is clean: click **"✓ Looks Good — Next"**.
5. The overlay immediately advances to the next angle.

**DevTools → Network — per angle:**

You should see exactly TWO requests fire after you click "Looks Good":

| Request | Expected |
|---|---|
| `PUT https://{project-id}.supabase.co/storage/v1/object/custody-evidence/custody/{jobId}/{handoffId}/{photoId}.jpg` | `200` — Supabase storage upload |
| `POST /api/custody/photos` | `200`, body: `{ "success": true, "photo": { "id": "...", "angle": "front", "storage_path": "custody/...", ... } }` |

**Verify the storage path format on any one photo POST:**  
Click the `POST /api/custody/photos` request, look at the Request Payload:
```json
{
  "id": "<uuid>",
  "handoff_id": "<matches the handoff.id from Step 3>",
  "job_id": "<matches job_id from Step 2 dataset>",
  "angle": "front",
  "storage_path": "custody/<job_id>/<handoff_id>/<photo_id>.jpg",
  ...
}
```

All three UUIDs in `storage_path` must match: job_id matches dataset, handoff_id matches Step 3 POST response, photo_id matches the `id` field.

**DevTools → Console:**  
No red errors during photo capture. If you see `Photo metadata POST failed` in red: the custody.js endpoint rejected the metadata. Check the response body in Network tab — common causes are path mismatch or missing `captured_at`.

**Skipping angles:**  
You can click "Skip this angle" for any angle. Skipped angles don't generate a network call. The flow continues to the next angle. You need at least 1 non-skipped photo for the handoff to proceed.

---

### Step 5 — After Last Angle: Release + Panel Update

After you click "Looks Good" on the 7th angle (or skip it):

**What happens in sequence (watch Network tab):**
1. `POST /api/custody/handoffs/{handoff_id}/release` → `200`, body: `{ "success": true, "handoff_id": "...", "status": "awaiting_receiver" }`
2. `GET /api/custody/jobs/{job_id}` → `200`, body now has `handoffs: [{ ..., status: "awaiting_receiver" }]` and `photos: [7 rows]`

**What to see visually:**  
A green success toast: `"Handoff documented — awaiting provider confirmation."`

The "Chain of Custody" card content updates from the empty state to a **timeline entry**:

```
Member → Provider                    Awaiting Review
🕐 May 29, 2026, 10:30 AM

[photo thumbnail] [photo thumbnail] [photo thumbnail] ...
```

If fewer than 7 photos appear (because you skipped some), that's correct — only captured angles show.

**Failure mode — if release POST returns 409 `"Handoff must be in pending status to release"`:**  
A prior release was already submitted (e.g., double-click). Check the Network tab — if a second identical POST fired, ignore it. The first one succeeded.

**Failure mode — photos uploaded but don't appear in panel:**  
Means storage thumbnails are broken. Open any thumbnail `<img>` element in DevTools → Elements and check the `src` attribute. It should be a `supabase.co/storage/v1/object/public/custody-evidence/custody/...` URL. Load that URL directly in a new tab — if it returns 403, the `custody-evidence` bucket is not set to public or the RLS policy on storage is blocking reads. This is a bucket config issue, not a code issue.

---

### Step 6 — Realtime: Two-Tab Verification

**Setup:**
1. Keep the member portal open in **Tab A** with the package detail modal open.
2. Open **Tab B** — same Netlify URL, same account, navigate to the same package and open its detail modal. Both tabs should show the same "awaiting_receiver" handoff from Step 5.

**Action — simulate a provider accepting the handoff:**  
Run this SQL in the Supabase dashboard (simulates what the provider UI would do):

```sql
UPDATE custody_handoffs
SET status = 'accepted', received_at = now()
WHERE job_id = 'YOUR_JOB_ID'
  AND status = 'awaiting_receiver';
```

**What to expect in Tab A within ~2 seconds:**  
The "Chain of Custody" panel refreshes automatically (no page reload). The handoff entry changes from `Awaiting Review` (orange) to `accepted` (green).

**What to expect in Tab B:**  
Same automatic refresh — same status change visible without any user interaction.

**DevTools → Network (in either tab after the SQL):**  
You should see a new `GET /api/custody/jobs/{job_id}` fire automatically — triggered by the `custody-updates` realtime channel subscription.

**Failure mode — panel doesn't refresh automatically:**  
Check the Console in that tab. Look for:
- `[REALTIME]` log lines (the custody channel doesn't log by default — absence is normal)
- Any WebSocket errors
- Run in Console: `console.log(typeof custodyRealtimeChannel)` — should NOT be `undefined`. If it is, `setupCustodyRealtimeSubscription` was not called, meaning `memberFeatureFlags.custody_chain_enabled` was false at init time even though the panel shows. Indicates a race condition or stale session.

Also check: the Supabase realtime subscription requires the tables to have realtime enabled in the Supabase dashboard (Table Editor → select table → "Realtime" toggle). Verify `custody_handoffs` and `custody_photos` both have realtime enabled.

---

## Part C — Full Failure Mode Checklist

Run through this list before reporting the test as passing.

| Symptom | Likely cause | Where to check |
|---|---|---|
| Chain of Custody card doesn't appear at all | `custody_chain_enabled` flag returning `false` | `GET /api/me/feature-flags` response in Network tab |
| Card appears but "Start Handoff" button doesn't | Template rendered without the button | Inspect DOM: `#custody-chain-section-{pkgId}` |
| POST /handoffs returns 403 `feature_not_enabled` | Server-side flag check failed (independent of client) | Re-run A3; check `platform_settings` row |
| POST /handoffs returns 403 `Not a party to this job` | `member_id` in `concierge_jobs` doesn't match your UUID | SQL check in A4 section above |
| POST /handoffs returns 400 `invalid leg value` | `member_to_provider` missing from VALID_LEG in `custody.js` | Read `custody.js` line 32 — should have `member_to_provider` in the Set |
| Photo picker opens but POST /api/custody/photos returns 400 | Path format mismatch or missing field | Read request payload in Network tab, compare to expected format in Step 4 |
| Photos uploaded (storage 200) but POST /custody/photos 403 | `is_job_party` check failing | Member not listed in `concierge_jobs.member_id` for this job |
| Thumbnails show broken image icon | `custody-evidence` bucket not public or wrong URL | Load `src` URL of `<img>` directly — expect 200 with image |
| Release POST returns 409 | Handoff not in `pending` status | Check `custody_handoffs.status` in Supabase dashboard |
| Panel doesn't refresh after release | `loadCustodyChain` not called after release, or failed | Check for console errors after the release POST |
| Realtime doesn't fire | Tables don't have realtime enabled in Supabase dashboard | Dashboard → Table Editor → `custody_handoffs` → Realtime toggle |
| Console: `supabaseClient not available` in CustodyCapture | `window.supabaseClient` not set when CustodyCapture runs | Check `members-core.js` sets it before `custody-capture.js` loads |
| Console: `TypeError: Cannot read properties of undefined (reading 'captureHandoffPhotos')` | `window.CustodyCapture` is undefined — script didn't load | Check `members.html` has `<script src="/custody-capture.js"></script>` in the right order |

---

## Part D — Cleanup

Run this after the test (safe to run even if the test failed partway through — all statements are conditional).

### D1. Delete test custody chain rows

```sql
-- Get the job_id for your test package
-- (substitute your package_id from A4/A5)
DO $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT id INTO v_job_id
  FROM concierge_jobs
  WHERE package_id = 'YOUR_PACKAGE_ID';

  IF v_job_id IS NOT NULL THEN
    DELETE FROM custody_disputes     WHERE job_id = v_job_id;
    DELETE FROM custody_attestations WHERE job_id = v_job_id;
    DELETE FROM custody_photos       WHERE job_id = v_job_id;
    DELETE FROM custody_handoffs     WHERE job_id = v_job_id;
    RAISE NOTICE 'Deleted custody rows for job %', v_job_id;
  ELSE
    RAISE NOTICE 'No concierge_jobs row found for package — nothing to delete';
  END IF;
END $$;
```

### D2. Delete test package + job (only if you created them in A5)

Skip this if you used a real existing package from A4.

```sql
DELETE FROM concierge_jobs       WHERE package_id = 'TEST_PACKAGE_ID';
DELETE FROM bids                 WHERE package_id = 'TEST_PACKAGE_ID';
DELETE FROM maintenance_packages WHERE id          = 'TEST_PACKAGE_ID';
```

### D3. Delete storage objects

The DB rows are gone after D1, but the JPG files still exist in the `custody-evidence` bucket. Delete them from the Supabase dashboard:

1. Supabase dashboard → Storage → `custody-evidence` bucket
2. Navigate into the `custody/` folder
3. Find the folder named with your `job_id` UUID
4. Select all files inside → Delete

Or, if you want to do it programmatically from a local script (requires supabase-js and service role key):

```javascript
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
// List then delete
const { data } = await sb.storage.from('custody-evidence').list('custody/YOUR_JOB_ID');
const paths = data.map(f => `custody/YOUR_JOB_ID/${f.name}`);
await sb.storage.from('custody-evidence').remove(paths);
```

### D4. Remove yourself from test_users (if you only enrolled for this test)

Skip if you want to stay enrolled.

```sql
UPDATE platform_settings
SET setting_value = jsonb_set(
  setting_value,
  '{test_users}',
  (
    SELECT jsonb_agg(u)
    FROM jsonb_array_elements_text(setting_value -> 'test_users') AS u
    WHERE u != 'YOUR_UUID'
  )
)
WHERE setting_key = 'custody_chain_enabled';
```

---

## Passing Criteria

The test passes when all of the following are true:

- [ ] `GET /api/me/feature-flags` returns `custody_chain_enabled: true`
- [ ] "Chain of Custody" card renders inside the package detail modal for an accepted package
- [ ] `custody-chain-section-${pkgId}` dataset has non-empty `jobId` and `providerId`
- [ ] `POST /api/custody/handoffs` returns `200` with `leg: "member_to_provider"`, `status: "pending"`
- [ ] Photo capture overlay opens automatically for each angle
- [ ] Per captured angle: storage PUT returns `200` and `POST /api/custody/photos` returns `200`
- [ ] `storage_path` in each photo POST matches `custody/{jobId}/{handoffId}/{photoId}.jpg`
- [ ] `POST /api/custody/handoffs/:id/release` returns `200` with `status: "awaiting_receiver"`
- [ ] Custody chain panel refreshes showing the handoff timeline with photo thumbnails
- [ ] SQL UPDATE to `custody_handoffs.status = 'accepted'` triggers panel refresh in both tabs within ~2 seconds

---

*Part 2 (automated unit tests) will be written after you confirm the above passing criteria.*
