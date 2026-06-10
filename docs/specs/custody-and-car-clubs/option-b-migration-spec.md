# Option B Migration Spec: `package_id` on `concierge_jobs` + Bid-Acceptance Trigger

**Status:** Awaiting branch validation (Phase 3)  
**Authored:** 2026-05-29  
**Purpose:** Unblock Step 6D (custody chain member UI) — give every maintenance package with an accepted bid a corresponding `concierge_jobs` row that the custody chain's `is_job_party()` can query.

---

## Context: Why This Migration Exists

`custody_handoffs.job_id` is a NOT NULL FK to `concierge_jobs(id)`. The 6D member UI needs to POST a handoff row when the member starts a vehicle handoff. The existing data model has `maintenance_packages` (created when a member posts a job) and `bids` (created when providers respond), but `concierge_jobs` is disconnected — it was built for transport/driver jobs and has no `package_id` column. This migration bridges them.

---

## Schema Changes

### 1. Add `package_id` to `concierge_jobs`

```sql
ALTER TABLE concierge_jobs
  ADD COLUMN package_id uuid
    REFERENCES maintenance_packages(id)
    ON DELETE RESTRICT;
```

**Why RESTRICT (not CASCADE, not SET NULL):**  
`custody_handoffs.job_id` references `concierge_jobs(id)` with `ON DELETE CASCADE`. If we used `ON DELETE CASCADE` on `package_id`, deleting a maintenance_package would silently wipe the concierge_job and then cascade-delete all custody_handoffs — permanently destroying the custody evidence chain. RESTRICT forces an operator to explicitly handle the dependency before deletion, which is the correct behavior for a liability-bearing record.

### 2. Add UNIQUE constraint on `package_id`

```sql
ALTER TABLE concierge_jobs
  ADD CONSTRAINT concierge_jobs_package_id_unique
    UNIQUE (package_id);
```

**Why:** One maintenance package should produce exactly one stub job. The UNIQUE constraint is the enforcement mechanism — the trigger's `ON CONFLICT` clause uses it, and it prevents double-firing bugs from creating duplicate rows.

The constraint is a partial uniqueness guarantee — `NULL` values are excluded from uniqueness checks in Postgres, so transport jobs (where `package_id` is NULL) are unaffected.

### 3. Add `member_to_provider` to the `handoff_leg` enum

```sql
ALTER TYPE handoff_leg ADD VALUE IF NOT EXISTS 'member_to_provider';
```

**Why:** The existing `handoff_leg` enum (`member_to_driver`, `driver_to_shop`, `shop_to_driver`, `driver_to_member`, `driver_to_driver`) has no value for a direct member→provider handoff without a transport driver. Step 6D's first handoff leg is a direct delivery to a shop, not via a driver. Reusing `member_to_driver` for this case is semantically wrong and would pollute analytics. `ADD VALUE IF NOT EXISTS` is idempotent and non-destructive.

---

## Trigger: Auto-create stub job on bid acceptance

### Trigger function

```sql
CREATE OR REPLACE FUNCTION trg_bid_accepted_create_concierge_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pkg  maintenance_packages%ROWTYPE;
BEGIN
  -- Only act when status transitions TO 'accepted'
  IF NEW.status IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'accepted' THEN
    RETURN NEW;  -- already accepted, no-op (re-save)
  END IF;
  IF NEW.package_id IS NULL THEN
    RETURN NEW;  -- not a package bid (shouldn't happen, but guard it)
  END IF;

  BEGIN
    -- Fetch the parent package
    SELECT * INTO v_pkg FROM maintenance_packages WHERE id = NEW.package_id;
    IF NOT FOUND OR v_pkg.member_id IS NULL THEN
      RAISE EXCEPTION 'package_not_found_or_no_member';
    END IF;

    -- Upsert: insert if no job exists, update provider if no handoffs yet
    INSERT INTO concierge_jobs (
      member_id,
      provider_id,
      package_id,
      member_vehicle_id,
      tier,
      scenario,
      status,
      total_price_cents,
      notes
    ) VALUES (
      v_pkg.member_id,
      NEW.provider_id,
      NEW.package_id,
      v_pkg.vehicle_id,
      1,                                         -- tier: 1 = standard stub
      1,                                         -- scenario: 1 = direct maintenance
      'pending',
      ROUND(NEW.price * 100)::integer,
      'Auto-created from bid acceptance: bid ' || NEW.id::text
    )
    ON CONFLICT (package_id) DO UPDATE SET
      provider_id       = EXCLUDED.provider_id,
      total_price_cents = EXCLUDED.total_price_cents,
      updated_at        = now()
    -- Only update provider if no custody handoffs have started yet
    WHERE NOT EXISTS (
      SELECT 1
      FROM custody_handoffs ch
      WHERE ch.job_id = concierge_jobs.id
    );

  EXCEPTION WHEN OTHERS THEN
    -- Never block the bid acceptance. Log and return.
    INSERT INTO admin_audit_log (action, target_id, target_type, reason, metadata, performed_by)
    VALUES (
      'trigger_error',
      NEW.id,
      'bid',
      SQLERRM,
      jsonb_build_object(
        'trigger', 'trg_bid_accepted_create_concierge_job',
        'bid_id',  NEW.id,
        'package_id', NEW.package_id,
        'sqlstate', SQLSTATE
      ),
      'system_trigger'
    );
  END;

  RETURN NEW;
END;
$$;
```

### Trigger binding

```sql
DROP TRIGGER IF EXISTS bid_accepted_create_concierge_job ON bids;

CREATE TRIGGER bid_accepted_create_concierge_job
  AFTER INSERT OR UPDATE OF status ON bids
  FOR EACH ROW
  EXECUTE FUNCTION trg_bid_accepted_create_concierge_job();

-- Why INSERT OR UPDATE (not just UPDATE):
-- A bid inserted directly at status='accepted' (admin import, POS flow, dashboard row)
-- would not fire an UPDATE-only trigger. The function already handles INSERT correctly:
-- OLD is NULL for INSERT triggers; IF OLD.status = 'accepted' evaluates to IF NULL, which
-- is false, so it falls through to the upsert. No function changes needed — trigger
-- binding change only.
```

---

## The 10 Workarounds

### 1 — Backfill for existing accepted packages

Packages already in `status = 'accepted'` or `'in_progress'` or `'completed'` have no `concierge_jobs` row because the trigger didn't exist when they were accepted. A one-time backfill script (Phase 4: `option-b-backfill.sql`) runs a single INSERT...SELECT:

```sql
INSERT INTO concierge_jobs (member_id, provider_id, package_id, member_vehicle_id,
                             tier, scenario, status, total_price_cents, notes)
SELECT
  mp.member_id,
  b.provider_id,
  mp.id,
  mp.vehicle_id,
  1,
  1,
  'pending',
  ROUND(b.price * 100)::integer,
  'Backfill from Option B migration: bid ' || b.id::text
FROM maintenance_packages mp
JOIN bids b ON b.id = mp.accepted_bid_id
WHERE mp.status IN ('accepted', 'in_progress', 'completed')
  AND mp.accepted_bid_id IS NOT NULL
  AND mp.member_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM concierge_jobs cj WHERE cj.package_id = mp.id
  )
ON CONFLICT (package_id) DO NOTHING;
```

The backfill uses `maintenance_packages.accepted_bid_id` (set during `acceptBid` at line 7097–7100 of members.js) as the authoritative bid pointer. Packages without `accepted_bid_id` are skipped — they have no accepted bid to derive provider from.

### 2 — Bid change handling (provider reassignment)

If a member or admin changes which bid is accepted (re-opens package, accepts different bid), the trigger fires again on the new bid's status → 'accepted'. The `ON CONFLICT` clause updates `provider_id` **only if no custody_handoffs exist yet** for that job. If handoffs exist (custody chain has started), the UPDATE is silently skipped — the in-progress chain is not disturbed. An audit log entry is written by the EXCEPTION handler if anything goes wrong.

**How to detect this was suppressed:** Query `custody_handoffs` for the job. If rows exist and `concierge_jobs.provider_id` doesn't match the new bid's provider, that's a mid-chain provider change — escalate via admin.

### 3 — No-job until acceptance

The trigger fires on `AFTER UPDATE OF status ON bids`, and the function guards `NEW.status IS DISTINCT FROM 'accepted'`. No `concierge_jobs` row is created for pending, rejected, or draft bids. The job row is the signal that a bid is accepted and the service is committed.

### 4 — UNIQUE prevents multiple stub jobs

`UNIQUE (package_id)` on `concierge_jobs` means:
- Trigger double-fires (e.g. rapid UI re-submission): the second fires into `ON CONFLICT → DO UPDATE`, not a second INSERT.
- Backfill + trigger race (backfill runs while trigger fires on new acceptance): `ON CONFLICT DO NOTHING` in the backfill + `ON CONFLICT DO UPDATE` in the trigger are both safe.
- Admin manually creates a job for a package that already has one: FK UNIQUE violation prevents it at the DB level.

### 4b — `vehicle_id` / `member_vehicle_id` nullability (confirmed safe)

`concierge_jobs.member_vehicle_id` is nullable (no NOT NULL constraint, no default). The trigger inserts `v_pkg.vehicle_id` there — if it is NULL, the INSERT succeeds and the job is created with `member_vehicle_id = NULL`. No failure path exists here.

In production: 0 of 10 accepted packages have a NULL `vehicle_id`. The UI requires a vehicle to be attached before a member can post a package (enforced in the create-package flow), so this is always populated in practice. This is a behavioral constraint, not a schema constraint — it is not enforced by a NOT NULL column on `maintenance_packages.vehicle_id`. If a package somehow reaches acceptance with no vehicle, the stub job is created but `member_vehicle_id` is NULL, which is harmless.

### 5 — `is_job_party()` unchanged

The existing server-side `isJobParty()` in `custody.js` (and the SQL `is_job_party()` function in the custody schema) queries `concierge_jobs` by `member_id` and `provider_id`. The stub job INSERT populates both from the package and accepted bid respectively. No change to `custody.js` or the SQL function is required.

### 6 — Trigger-based, not endpoint-based

`acceptBid` in `members.js` writes directly to the `bids` table via the Supabase JS client (`supabaseClient.from('bids').update({ status: 'accepted' })`). A DB trigger fires on the table regardless of which code path triggered the write — frontend members.js, admin panel, future API, CSV import, Supabase dashboard. This is the correct level of enforcement.

### 7 — Validate-first on branch DB

Before applying to prod, all SQL in this spec is applied to a Supabase branch and tested with five scenarios (see Phase 3 test plan below). Only after a clean validation report is the prod paste authorized.

### 8 — Tie-in with acceptedBid bug (Phase 1)

The `acceptedBid` bug fix (documented in `docs/bugs/accepted-bid-undefined.md`) resolves to:
```javascript
const acceptedBid = bids?.find(b => b.id === pkg.accepted_bid_id) ?? bids?.find(b => b.status === 'accepted') ?? null;
```
This reads the same `provider_id` as the trigger writes to `concierge_jobs`. They are consistent: both derive provider identity from the accepted bid row. The bug fix and the migration are safe to apply independently — neither depends on the other being applied first.

### 9 — Defensive trigger wrapping (FK race conditions)

The outer `BEGIN ... EXCEPTION WHEN OTHERS THEN` block catches:
- FK violation if `v_pkg.member_id` references a deleted `auth.users` row
- UNIQUE violation if a concurrent transaction inserted the same `package_id` (caught before it reaches the error)
- Any transient Postgres error during the INSERT

In all cases: write to `admin_audit_log` and `RETURN NEW`. The `bids` UPDATE is never rolled back due to trigger failure. The `performed_by` value `'system_trigger'` distinguishes these from human admin actions in the audit log.

**Note:** `SECURITY DEFINER` is required so the trigger can INSERT into `admin_audit_log` (which has RLS enabled and wouldn't allow `auth.uid() = NULL` under normal user context). The function is owned by the `postgres` role.

### 10 — Future transport jobs + leg enum

**Current leg enum values:** `member_to_driver`, `driver_to_shop`, `shop_to_driver`, `driver_to_member`, `driver_to_driver`  
**Gap:** No `member_to_provider` for direct drop-off without a transport driver.

This migration adds `member_to_provider` to the enum. Future transport jobs (which already have a `concierge_jobs` row from their own creation flow) will add additional `custody_handoffs` rows using `member_to_driver`, `driver_to_shop`, etc. — the sequence number on `custody_handoffs` ensures they don't conflict with the stub job's handoffs. The stub job created by this trigger is simply the "base job" that all handoffs, regardless of leg type, reference.

**Confirmed:** `ALTER TYPE handoff_leg ADD VALUE IF NOT EXISTS` is safe in Postgres 14+ and can run in a transaction (with the caveat that the new value is not visible to other open transactions until they commit). The custody schema uses `LANGUAGE plpgsql` (confirmed), so the enum value is resolved at runtime, not parse time.

---

## Verification Queries (post-apply, on both branch and prod)

```sql
-- 1. Trigger exists and is enabled
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgname = 'bid_accepted_create_concierge_job';

-- 2. Column and constraint exist
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'concierge_jobs' AND column_name = 'package_id';

SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'concierge_jobs' AND constraint_name = 'concierge_jobs_package_id_unique';

-- 3. New enum value exists
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'handoff_leg' ORDER BY enumsortorder;

-- 4. Backfill coverage (after backfill runs): 0 rows means clean
SELECT count(*) AS unbacked_packages
FROM maintenance_packages mp
WHERE mp.status IN ('accepted', 'in_progress', 'completed')
  AND mp.accepted_bid_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM concierge_jobs cj WHERE cj.package_id = mp.id);

-- 5. No orphan jobs (package_id points to valid package or is null)
SELECT count(*) AS orphan_jobs
FROM concierge_jobs cj
WHERE cj.package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM maintenance_packages mp WHERE mp.id = cj.package_id);

-- 6. is_job_party sanity: member can reach their job via custody path
-- (Replace UUIDs with real test values on branch)
SELECT is_job_party(<job_id>, <member_id>);
```

---

## Phase 3 Test Plan (branch DB)

| Test | Setup | Expected Result |
|------|-------|-----------------|
| a | INSERT package, INSERT bid, UPDATE bid SET status='accepted' | `concierge_jobs` row appears with correct member_id, provider_id, package_id |
| b | (After a) INSERT second bid, UPDATE second bid SET status='accepted' | Existing job row's `provider_id` updates; row count still 1 |
| c | (After a, with a custody_handoff inserted) UPDATE bid to different provider | Job row's `provider_id` is NOT updated (handoff exists guard); row count still 1 |
| d | (After a) Attempt DELETE on the maintenance_package | Fails with FK RESTRICT violation |
| e | As member user (non-service-role): SELECT custody_handoffs for a job tied to their package | RLS allows it; other members' handoffs not visible |

---

## Rollback Plan

If the migration causes problems in prod before the backfill runs:

```sql
-- Remove trigger first (stops new jobs from being created)
DROP TRIGGER IF EXISTS bid_accepted_create_concierge_job ON bids;
DROP FUNCTION IF EXISTS trg_bid_accepted_create_concierge_job();

-- Remove constraint and column (safe only if no package_id values were written)
-- Check first:
SELECT count(*) FROM concierge_jobs WHERE package_id IS NOT NULL;
-- If 0, safe to drop:
ALTER TABLE concierge_jobs DROP CONSTRAINT IF EXISTS concierge_jobs_package_id_unique;
ALTER TABLE concierge_jobs DROP COLUMN IF EXISTS package_id;

-- Enum value cannot be removed in Postgres — but it's additive and harmless if unused.
-- The member_to_provider enum value stays; it causes no problems.
```

If the backfill has already run (jobs created), do NOT drop the column — coordinate manually. The handoff FK chain makes unwind complex; escalate to a coordinated admin migration.
