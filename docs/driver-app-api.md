# MCC Driver App — Server API Contract

**Version:** v1
**Status:** Stable for the separate "MCC Driver" Replit project to build against.

This document is the source-of-truth contract between the main MCC repo
(server) and the separate **MCC Driver** Replit project (client). The
Driver app **never** receives the Supabase service-role key — every
privileged read/write goes through the endpoints below.

- Base URL (production): `https://mycarconcierge.com/api/driver/v1`
- Base URL (Replit dev): `http://<your-repl>.replit.dev/api/driver/v1`
- Direct Netlify path:   `/.netlify/functions/driver-api/<route>`
- Auth: `Authorization: Bearer <access_token>` (native Supabase JWT)
- All requests/responses are JSON. All timestamps are ISO 8601 UTC.

---

## Table of contents

1. [Concepts: tiers, scenarios, legs](#concepts-tiers-scenarios-legs)
2. [Authentication (Twilio Verify OTP)](#authentication-twilio-verify-otp)
3. [Endpoints](#endpoints)
4. [Error codes](#error-codes)
5. [Scenario → leg expansion table](#scenario--leg-expansion-table)
6. [Minimum viable Driver app shift flow](#minimum-viable-driver-app-shift-flow)
7. [curl examples](#curl-examples)

---

## Concepts: tiers, scenarios, legs

Every concierge job has a **tier** (1–4) and a **scenario** (1–11). The
scenario is the single source of truth for the **legs** — the ordered
units of driving work a driver executes. The server expands the leg list
from the scenario number on job creation. Clients do not invent legs.

**Tiers**

| Tier | Name                     | Drivers | Vehicles                 |
|------|--------------------------|---------|--------------------------|
| 1    | Passenger Rides          | 1       | 1 (MCC's)                |
| 2    | Vehicle Shuttle Solo     | 1       | 0 partner                |
| 3    | Vehicle Shuttle Paired   | 2       | 1 partner chase vehicle  |
| 4    | Full Concierge           | 2       | 1 partner vehicle        |

**Leg types**

- `passenger_ride` — driver carries the member (passenger).
- `vehicle_shuttle` — driver drives the **member's** vehicle.
- `chase_follow`  — driver follows in the **partner/chase** vehicle.

**Driver roles**

- `primary` — every job has exactly one primary driver.
- `secondary` — only Tier 3 and 4 jobs have a secondary driver.

The full table mapping each scenario to its legs is at the end of this
document.

---

## Authentication (Twilio Verify OTP)

Driver login is phone-OTP only. The server uses **Twilio Verify** to send
and check codes. The phone number must already exist in the `drivers`
table with `status='active'` — unknown phones are rejected.

On a successful `verify-code`, the server returns a **native Supabase
session**: an `access_token` (default 1h) and a `refresh_token`. The
flow internally is:

1. Driver POSTs phone + code → server calls Twilio Verify to confirm.
2. Server calls `supabase.auth.admin.generateLink({type:'magiclink', email})`
   for the matching driver row to mint a one-time `hashed_token`.
3. Server immediately exchanges that token via the anon Supabase client's
   `auth.verifyOtp({token_hash, type:'magiclink'})` and returns the real
   Supabase `access_token` + `refresh_token` to the Driver app.

Because the tokens are real Supabase JWTs, the Driver app can also use
them directly with a Supabase client (anon key) and the RLS policies on
`drivers`, `concierge_jobs`, `concierge_job_drivers`, etc. that gate on
`auth.uid() = drivers.profile_id` will Just Work. Token expiry, refresh,
and revocation are managed by Supabase Auth.

**Prerequisite:** every driver row must have `email` set and
`profile_id` linked to an `auth.users` row whose email matches.

Send `Authorization: Bearer <access_token>` on every authenticated
request.

### `POST /auth/send-code`

Send a verification code to the driver's phone.

**Request**
```json
{ "phone": "+12015550100" }
```

**Response 200**
```json
{ "sent": true, "status": "pending" }
```

**Errors**
- `400 BAD_REQUEST` — `phone` not in E.164 format.
- `404 DRIVER_NOT_FOUND` — phone is not a registered driver.
- `403 DRIVER_NOT_ACTIVE` — driver is suspended or offboarded.
- `429 RATE_LIMITED` — more than 3 sends per phone in 15 min. Body
  includes `retry_after` (seconds).
- `503 OTP_SEND_FAILED` — Twilio Verify not configured (server env).

### `POST /auth/verify-code`

Exchange the OTP for a session token pair.

**Request**
```json
{ "phone": "+12015550100", "code": "123456" }
```

**Response 200**
```json
{
  "access_token":  "eyJhbGciOi...",
  "refresh_token": "v1.MNJ...",
  "token_type":    "Bearer",
  "expires_in":    3600,
  "expires_at":    1763000000,
  "driver": { "id": "uuid", "full_name": "Jane Doe", "phone": "+12015550100" }
}
```

**Errors**
- `401 OTP_INVALID` — wrong code or expired pending verification.
- `404 DRIVER_NOT_FOUND` / `403 DRIVER_NOT_ACTIVE`.
- `409 DRIVER_NO_EMAIL` — driver row has no email; admin must link an auth user.
- `500 AUTH_LINK_FAILED` / `AUTH_VERIFY_FAILED` — Supabase auth refused.
- `503 AUTH_UNAVAILABLE` — server `SUPABASE_ANON_KEY` not configured.

### `POST /auth/refresh`

```json
{ "refresh_token": "v1.MNJ..." }
```

Returns `{ access_token, refresh_token, token_type, expires_in, expires_at }`.
Server-side this calls `supabase.auth.refreshSession({refresh_token})`
on the anon client, so refresh-token rotation behaves exactly like a
direct Supabase client. Use this when an access token is about to expire
(or you got a 401 with `AUTH_REQUIRED`).

---

## Endpoints

All endpoints below require `Authorization: Bearer <access_token>`.

### `GET /me`

Returns the authenticated driver's profile.

```json
{
  "driver": {
    "id": "uuid", "full_name": "Jane Doe", "phone": "+12015550100",
    "email": "jane@example.com", "status": "active",
    "vehicle_class": ["sedan","suv"],
    "hourly_rate_cents": 4500, "per_job_rate_cents": 0,
    "onboarded_at": "2026-04-01T12:00:00Z"
  }
}
```

### `GET /jobs?status=&from=&to=`

Returns jobs the driver is assigned to (200 most recent), with embedded
legs sorted by `sequence`. Optional filters:

- `status` — `draft|scheduled|in_progress|completed|cancelled`.
- `from`, `to` — ISO timestamps; filters on `scheduled_start_at`.

```json
{
  "jobs": [
    {
      "id": "job-uuid", "tier": 4, "scenario": 9, "status": "scheduled",
      "scheduled_start_at": "2026-05-15T13:00:00Z",
      "pickup_address": "123 Main St", "pickup_lat": 40.71, "pickup_lng": -74.0,
      "dropoff_address": "Joe's Auto", "dropoff_lat": 40.74, "dropoff_lng": -74.01,
      "my_role": "primary",
      "accepted_at": null, "declined_at": null,
      "legs": [
        { "id": "leg-uuid", "sequence": 1, "leg_type": "vehicle_shuttle",
          "driver_role": "primary",
          "from_address": "123 Main St", "to_address": "Joe's Auto",
          "carries_passenger": false, "carries_member_vehicle": true,
          "carries_partner_vehicle": false, "status": "pending" },
        { "id": "leg-uuid-2", "sequence": 2, "leg_type": "passenger_ride",
          "driver_role": "secondary",
          "from_address": "123 Main St", "to_address": "Joe's Auto",
          "carries_passenger": true, "carries_member_vehicle": false,
          "carries_partner_vehicle": true, "status": "pending" }
      ]
    }
  ]
}
```

### `GET /jobs/:id`

Single job, same shape as above (single object under `job`).

### `POST /jobs/:id/accept`

Accept the assigned role on this job. Idempotent (200 if already
accepted). Returns 409 `ROLE_TAKEN` if another driver beat you to the
same role, or `ALREADY_DECLINED` if you already declined.

### `POST /jobs/:id/decline`

```json
{ "reason": "Vehicle is in the shop" }
```

Returns 409 `ALREADY_ACCEPTED` if you already accepted.

### `POST /jobs/:id/legs/:leg_id/start`

Marks the leg `in_progress` and (if first leg started on the job) flips
the job to `in_progress`. Requires you to have accepted the job.

Returns:
- `403 LEG_NOT_YOURS` — leg is for the other role.
- `409 NOT_ACCEPTED` — must accept the job first.
- `409 LEG_ALREADY_COMPLETE`.
- `422 LEG_OUT_OF_ORDER` — earlier leg with the same role isn't done.

### `POST /jobs/:id/legs/:leg_id/complete`

Marks the leg `completed`. When the job has no more pending legs the
job flips to `completed` and emits a `concierge.job_completed` event.

### `POST /jobs/:id/legs/:leg_id/location`

Batched live location pings (max 50 per request).

```json
{
  "pings": [
    { "lat": 40.7, "lng": -74.0, "accuracy_m": 8, "heading": 92.5,
      "speed_mps": 12.3, "recorded_at": "2026-05-15T13:05:01Z" },
    { "lat": 40.701, "lng": -74.001, "recorded_at": "2026-05-15T13:05:11Z" }
  ]
}
```

`recorded_at` is optional (server time used if omitted). Pings are
**privacy-sensitive** — only the driver who created them and admins
(via service-role) can read them back. There is no member-facing read
endpoint in v1.

### `GET /earnings?range=today|week|month|all`

```json
{
  "range": "week", "total_cents": 18250,
  "entries": [
    { "id": "uuid", "job_id": "uuid", "leg_id": "uuid",
      "amount_cents": 4500, "kind": "base",
      "recorded_at": "2026-05-13T18:00:00Z", "notes": null }
  ]
}
```

`kind` is one of `base|tip|bonus|adjustment`. v1 only records earnings;
actual payout disbursement (Stripe Connect) is a follow-up.

---

## Error codes

Errors return:
```json
{ "error": { "code": "AUTH_REQUIRED", "message": "Bearer token required" } }
```

| Code                  | HTTP | Meaning                                                 |
|-----------------------|------|---------------------------------------------------------|
| `AUTH_REQUIRED`       | 401  | Missing/expired/invalid bearer token. Refresh or re-OTP. |
| `DRIVER_NOT_FOUND`    | 404  | Phone not in drivers table.                              |
| `DRIVER_NOT_ACTIVE`   | 403  | Driver suspended/offboarded.                             |
| `OTP_INVALID`         | 401  | Wrong/expired Verify code.                               |
| `OTP_SEND_FAILED`     | 502  | Twilio Verify upstream failure.                          |
| `OTP_VERIFY_UNAVAILABLE` | 503 | Twilio Verify env not configured.                       |
| `RATE_LIMITED`        | 429  | Too many send-code requests for this phone.              |
| `BAD_REQUEST`         | 400  | Validation failure. `error.message` describes the field. |
| `JOB_NOT_ASSIGNED`    | 403  | Driver is not on this job.                               |
| `JOB_NOT_FOUND`       | 404  | Bad job id.                                              |
| `LEG_NOT_FOUND`       | 404  | Bad leg id.                                              |
| `LEG_NOT_YOURS`       | 403  | Leg belongs to the other role on this job.               |
| `LEG_OUT_OF_ORDER`    | 422  | Earlier same-role leg not yet completed.                 |
| `LEG_NOT_STARTED`     | 409  | Cannot complete before starting.                         |
| `LEG_ALREADY_COMPLETE`| 409  | Leg was already completed.                               |
| `NOT_ACCEPTED`        | 409  | Must accept the job before starting a leg.               |
| `ROLE_TAKEN`          | 409  | Another driver already accepted this role on this job.   |
| `ALREADY_ACCEPTED`    | 409  | Cannot decline an already-accepted job — call dispatch.  |
| `ALREADY_DECLINED`    | 409  | Cannot accept a job you already declined.                |
| `STATE_CHANGED`       | 409  | Concurrent accept vs decline — re-fetch the job.         |
| `DRIVER_NO_EMAIL`     | 409  | Driver row has no email — admin must link an auth user.  |
| `AUTH_LINK_FAILED`    | 500  | Supabase admin generateLink failed.                      |
| `AUTH_VERIFY_FAILED`  | 500  | Supabase verifyOtp exchange failed.                      |
| `AUTH_UNAVAILABLE`    | 503  | `SUPABASE_ANON_KEY` not configured on the server.        |
| `DB_ERROR`            | 500  | Database error. Server logs have details.                |
| `INTERNAL`            | 500  | Unexpected error.                                        |

---

## Scenario → leg expansion table

Legs are 1-indexed by `sequence`. `direction` shows whether the leg
goes from the job's pickup (member's home/origin) to its dropoff
(provider) or back. The address fields on each leg are populated from
the job's pickup_*/dropoff_* coordinates accordingly.

| Scenario | Tier | Legs (sequence: type, role, direction, carries) |
|----------|------|--------------------------------------------------|
| **S1**   | 1 | 1: passenger_ride, primary, →provider, passenger |
| **S2**   | 1 | 1: passenger_ride, primary, →home, passenger |
| **S3**   | 1 | 1: passenger_ride, primary, →provider, passenger<br>2: passenger_ride, primary, →home, passenger |
| **S4**   | 2 | 1: vehicle_shuttle, primary, →provider, member car |
| **S5**   | 2 | 1: vehicle_shuttle, primary, →home, member car |
| **S6**   | 2 | 1: vehicle_shuttle, primary, →provider, member car<br>2: vehicle_shuttle, primary, →home, member car |
| **S7**   | 3 | 1: vehicle_shuttle, primary, →provider, member car<br>2: chase_follow, secondary, →provider, partner car<br>3: chase_follow, primary, →home, partner car |
| **S8**   | 3 | 1: chase_follow, secondary, →provider, partner car<br>2: vehicle_shuttle, primary, →home, member car<br>3: chase_follow, secondary, →home, partner car |
| **S9**   | 4 | 1: vehicle_shuttle, primary, →provider, member car<br>2: passenger_ride, secondary, →provider, passenger + partner car |
| **S10**  | 4 | 1: vehicle_shuttle, primary, →home, member car<br>2: passenger_ride, secondary, →home, passenger + partner car |
| **S11**  | 4 | S9 legs 1-2 then S10 legs 1-2 (4 legs total) |

The canonical machine-readable version of this table lives at
`netlify/functions/concierge-jobs-admin.js → EXPAND_SCENARIO`. The SQL
migration `supabase/migrations/20260514c_driver_concierge_jobs.sql`
header is kept in sync.

---

## Minimum viable Driver app shift flow

1. **Login.** `POST /auth/send-code` → user enters code → `POST /auth/verify-code` → store the token pair securely (Keychain/Keystore).
2. **Pull jobs.** `GET /jobs?status=scheduled` on app open and every 60s while foregrounded.
3. **Job card.** Driver taps job → `GET /jobs/:id` → show legs.
4. **Accept.** `POST /jobs/:id/accept`. Refresh job. (Or `POST /decline` with a reason.)
5. **Start first leg.** `POST /jobs/:id/legs/:leg_id/start`.
6. **Stream pings.** Every ~10s while a leg is in progress, batch up to 50 pings into `POST .../location`.
7. **Complete leg.** `POST /jobs/:id/legs/:leg_id/complete`. If more legs remain → repeat from step 5.
8. **Earnings.** `GET /earnings?range=today` after the shift.
9. **Token refresh.** On any 401 with `AUTH_REQUIRED`, call `POST /auth/refresh` with the stored refresh token. If that 401s, force re-login.

---

## curl examples

```bash
# 1. Send OTP
curl -X POST https://mycarconcierge.com/api/driver/v1/auth/send-code \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+12015550100"}'

# 2. Verify
curl -X POST https://mycarconcierge.com/api/driver/v1/auth/verify-code \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+12015550100","code":"123456"}'
# → { "access_token": "...", "refresh_token": "...", ... }

# 3. List today's jobs
TOKEN=eyJhbGciOi...
curl https://mycarconcierge.com/api/driver/v1/jobs?status=scheduled \
  -H "Authorization: Bearer $TOKEN"

# 4. Accept
curl -X POST https://mycarconcierge.com/api/driver/v1/jobs/<JOB>/accept \
  -H "Authorization: Bearer $TOKEN"

# 5. Start a leg
curl -X POST "https://mycarconcierge.com/api/driver/v1/jobs/<JOB>/legs/<LEG>/start" \
  -H "Authorization: Bearer $TOKEN"

# 6. Batched location pings
curl -X POST "https://mycarconcierge.com/api/driver/v1/jobs/<JOB>/legs/<LEG>/location" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"pings":[{"lat":40.71,"lng":-74.0,"accuracy_m":8}]}'

# 7. Complete
curl -X POST "https://mycarconcierge.com/api/driver/v1/jobs/<JOB>/legs/<LEG>/complete" \
  -H "Authorization: Bearer $TOKEN"

# 8. Earnings
curl "https://mycarconcierge.com/api/driver/v1/earnings?range=week" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Out of scope for v1

Documented here so the Driver app team plans for the gaps:

- Native push notifications (FCM/APNs) — server emits `concierge.*`
  events into `agent_events`; a follow-up will wire push delivery.
- Realtime/WebSocket updates — v1 is poll-based.
- Stripe Connect payouts — earnings are recorded but not yet disbursed.
- Auto-dispatch / surge pricing — admin manually assigns drivers.
- Driver onboarding/background-check workflow — drivers are seeded as
  pre-vetted MCC employees/contractors for v1.
- Member-facing live tracking — pings are not exposed to members.

---

## Member & provider concierge endpoints (Task #369)

Members and providers can now create concierge jobs themselves. These hit a
separate Netlify function (`netlify/functions/concierge-jobs-public.js`,
proxied at `/api/concierge/*`) that uses **Supabase JWT bearer tokens** —
the same `auth.users` session the user already has — and authoritatively
re-reads `appointments.member_id` / `appointments.provider_id` to gate
ownership. Leg expansion is delegated to the shared
`netlify/functions/_concierge-scenarios.js` so members and providers
**cannot** invent leg sequences.

| Method & Path                       | Caller     | Body / Query                                         | Notes |
|-------------------------------------|------------|------------------------------------------------------|-------|
| `GET  /api/concierge?role=member`   | member     | —                                                    | Lists jobs where `member_id = auth.uid()`. |
| `GET  /api/concierge?role=provider` | provider   | —                                                    | Caller must have `profiles.role='provider'` (or secondary). Lists `provider_id = auth.uid()`. |
| `GET  /api/concierge/:job_id`       | either     | —                                                    | 403 unless caller is the named member or provider. |
| `POST /api/concierge`               | member     | `{tier,scenario,appointment_id?,pickup_address,dropoff_address,notes?}` | `member_id` is forced to `auth.uid()`. If `appointment_id` is supplied, `appointments.member_id` must equal the caller. |
| `POST /api/concierge`               | provider   | `{tier,scenario,appointment_id,...,created_by_kind:"provider"}` | `appointment_id` is REQUIRED. `appointments.provider_id` must equal caller. `member_id` is read from the appointment, never the body. |
| `POST /api/concierge/:job_id/cancel`| either     | `{reason}` (3–500 chars)                             | Allowed for the named member, the named provider, or the original creator. Sets `status='cancelled'`. |

Source-tracking columns added by `supabase/migrations/20260515d_concierge_created_by_kind.sql`:

- `created_by_kind` — `'admin' | 'member' | 'provider' | 'system'` (default `'admin'`)
- `created_by_id`   — `auth.users.id` of the requesting user (NULL for admin / system)

Audit / events:
- `admin_audit_log` writes `create_concierge_job` / `cancel_concierge_job`
  with `metadata.source` and `performed_by = auth.uid()`.
- `agent_events` emits `concierge.job_requested` and
  `concierge.job_cancelled` (`source='concierge-jobs-public'`) so the
  Concierge / Director agents can fan out notifications.

Smoke tests: `node netlify/functions-tests/concierge-public.test.js`
(8 tests covering auth, member ownership, provider role gating, scenario
parity with the admin function, and cancel ownership rules).

### Status transitions

`POST /api/concierge/:job_id/transition` body `{to_status, note?}` lets the
named member or provider push the job through its lifecycle. The server
enforces a per-role allow-list (mirrored in
`netlify/functions/concierge-jobs-public.js` `TRANSITIONS`):

| Caller role | From status         | Allowed `to_status`                 |
|-------------|---------------------|-------------------------------------|
| provider    | `scheduled`         | `vehicle_received`, `problem_flagged` |
| provider    | `in_progress`       | `vehicle_received`, `problem_flagged` |
| provider    | `vehicle_received`  | `vehicle_released`, `problem_flagged` |
| provider    | `vehicle_released`  | `completed`, `problem_flagged`      |
| provider    | `requested`         | `problem_flagged`                   |
| member      | any active          | `problem_flagged` only              |

Disallowed hops return `409` with the `allowed` list. Each successful
transition writes an `admin_audit_log` row (`transition_concierge_job`)
and emits an `agent_events` row (`concierge.status_changed`) so the
notification fan-out can pick it up.

### New job lifecycle states (migration 20260515d)

The `concierge_jobs.status` CHECK constraint has been widened to include:

- `requested` — member or provider initiated, no driver assigned yet
- `vehicle_received` — provider confirmed the vehicle is at the shop
- `vehicle_released` — provider released it for return
- `problem_flagged` — needs admin attention

### Provider shop-address adjustment

`POST /api/concierge/:job_id/update-address` body
`{field: "pickup"|"dropoff", address, lat?, lng?}` lets the named provider
correct the shop address for their concierge job. Server-side guards:

- Caller must be the job's `provider_id` AND have provider role.
- Job must not be `completed` or `cancelled`.
- **Refused with 409 once any `concierge_job_drivers.accepted_at` is set**,
  so a driver never sees a different address than the one they accepted.
- Mirrors the change onto unstarted (`pending`) legs whose origin /
  destination still matches the old job address.

Audit: `admin_audit_log` action `update_concierge_job_address`. Event:
`concierge.address_updated`.

### Vehicle ownership enforcement on create

When `POST /api/concierge` includes a `member_vehicle_id`, the server
verifies that `vehicles.owner_id === resolvedMemberId` (the caller for
member-created jobs, the appointment's `member_id` for provider-created
jobs). Cross-member attachment is rejected with 403.

### Auto status hop on first driver assignment

Admin `POST /api/admin/concierge-jobs/:id/assign-driver` automatically
flips the job's status from `requested` (or legacy `draft`) to
`scheduled` so the existing driver-api lifecycle (`scheduled →
in_progress` on first leg start) keeps working for jobs created by
members or providers via the public API.
