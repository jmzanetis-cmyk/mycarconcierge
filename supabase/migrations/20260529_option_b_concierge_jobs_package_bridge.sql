-- =============================================================================
-- Option B: package_id bridge on concierge_jobs + bid-acceptance trigger
-- catch-up migration (2026-09-09)
-- =============================================================================
-- WHY THIS FILE EXISTS:
--   Same situation as 20260528_custody_chain_base_schema.sql: this has been
--   LIVE in production since 2026-05-29 (validated first on Supabase branch
--   bucyrhlodyrxyqbawmmn, Postgres 17.6 — see the original spec doc for the
--   6 named test cases that passed), applied by hand-pasting
--   docs/specs/custody-and-car-clubs/option-b-migration.sql followed by
--   docs/specs/custody-and-car-clubs/option-b-backfill.sql into the Supabase
--   SQL editor, and never committed as a tracked migration. This file
--   combines both of those (the backfill is idempotent — ON CONFLICT
--   (package_id) DO NOTHING — so folding it into the same migration as the
--   schema/trigger change is safe) and adds the idempotency this repo's
--   other migrations use so it can be re-run against production (which
--   already has all of this) without erroring.
--
-- PURPOSE (unchanged from the source docs):
--   Bridge maintenance_packages to concierge_jobs so the custody chain can
--   reference a job_id when a member starts a vehicle handoff. Every
--   accepted maintenance package gets a corresponding concierge_jobs stub
--   row, going forward via the trigger below and retroactively via the
--   backfill INSERT at the bottom of this file.
--
-- MUST RUN AFTER: 20260528_custody_chain_base_schema.sql
--   (the trigger function references custody_handoffs, created there).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ADD package_id COLUMN
-- -----------------------------------------------------------------------------
-- ON DELETE RESTRICT is intentional and critical.
--
-- The cascade chain is: maintenance_packages -> concierge_jobs -> custody_handoffs
-- custody_handoffs.job_id already has ON DELETE CASCADE to concierge_jobs.
-- If we used ON DELETE CASCADE here too, deleting a maintenance_package would
-- silently wipe the concierge_job and then cascade-delete all custody_handoffs
-- — permanently destroying the custody evidence chain.
--
-- RESTRICT forces an operator to explicitly deal with the dependency first.
-- NULL values are allowed (transport jobs have package_id = NULL).
-- -----------------------------------------------------------------------------
ALTER TABLE concierge_jobs
  ADD COLUMN IF NOT EXISTS package_id uuid
    REFERENCES maintenance_packages(id)
    ON DELETE RESTRICT;


-- -----------------------------------------------------------------------------
-- 2. ADD UNIQUE CONSTRAINT
-- -----------------------------------------------------------------------------
-- One maintenance package -> exactly one concierge_jobs stub row.
-- This is the target of the ON CONFLICT clause in the trigger function.
-- NULL values are excluded from UNIQUE checks in Postgres, so transport jobs
-- (package_id IS NULL) are unaffected by this constraint.
--
-- ADD CONSTRAINT has no native IF NOT EXISTS. A duplicate named UNIQUE
-- constraint does NOT raise duplicate_object (SQLSTATE 42710) the way a
-- duplicate policy/type does -- it raises duplicate_table (42P07, "relation
-- already exists"), because a named UNIQUE constraint is backed by an index
-- of the same name. Confirmed by actually re-running this statement twice
-- against a real Postgres 16 instance while validating this migration.
-- An explicit pg_constraint existence check is used instead of relying on
-- exception-catching, to avoid depending on that non-obvious SQLSTATE.
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'concierge_jobs_package_id_unique'
      AND conrelid = 'concierge_jobs'::regclass
  ) THEN
    ALTER TABLE concierge_jobs
      ADD CONSTRAINT concierge_jobs_package_id_unique
        UNIQUE (package_id);
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 3. ADD member_to_provider TO handoff_leg ENUM
-- -----------------------------------------------------------------------------
-- The base enum (member_to_driver, driver_to_shop, shop_to_driver,
-- driver_to_member, driver_to_driver — see 20260528) has no value for a
-- direct member->provider handoff without a transport driver. This is what
-- providers.js's startCustodyReturn()/members-extras.js's startCustodyPickup()
-- actually send for a direct drop-off.
--
-- ADD VALUE IF NOT EXISTS is natively idempotent.
-- -----------------------------------------------------------------------------
ALTER TYPE handoff_leg ADD VALUE IF NOT EXISTS 'member_to_provider';


-- -----------------------------------------------------------------------------
-- 4. TRIGGER FUNCTION
-- -----------------------------------------------------------------------------
-- Fires AFTER INSERT OR UPDATE OF status ON bids (FOR EACH ROW).
--
-- Why INSERT OR UPDATE (not just UPDATE):
--   The normal app path (acceptBid in members.js) inserts bids as 'pending'
--   then UPDATEs to 'accepted' — UPDATE covers that. But admin imports, POS
--   flows, or dashboard rows might INSERT directly at 'accepted'. The
--   function body already handles INSERT correctly: OLD is NULL for INSERT
--   triggers, so "IF OLD.status = 'accepted'" evaluates to "IF NULL" (false)
--   and falls through to the upsert.
--
-- SECURITY DEFINER is required so the trigger can INSERT into
-- admin_audit_log, which has RLS enabled. auth.uid() is NULL in trigger
-- context (no session). The function is owned by the postgres role.
--
-- The EXCEPTION block catches ALL errors and logs them to admin_audit_log,
-- then returns NEW. This means the trigger NEVER blocks a bid acceptance,
-- even if the job creation fails (FK race, missing package, etc.). SQLERRM
-- captures the human-readable error; SQLSTATE captures the pg error code
-- (e.g. '23503' for FK violation, '23505' for UNIQUE violation).
--
-- CREATE OR REPLACE FUNCTION is natively idempotent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bid_accepted_create_concierge_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pkg  maintenance_packages%ROWTYPE;
BEGIN
  -- Guard 1: only act when status transitions TO 'accepted'
  IF NEW.status IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Guard 2: for UPDATE triggers — skip if status was already 'accepted' (re-save)
  --          for INSERT triggers — OLD is NULL so OLD.status is NULL;
  --          NULL = 'accepted' is NULL (false in IF), correctly falls through
  IF OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Guard 3: skip transport/non-package bids (package_id IS NULL)
  IF NEW.package_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Fetch the parent package to get member_id and vehicle_id
    SELECT * INTO v_pkg FROM maintenance_packages WHERE id = NEW.package_id;
    IF NOT FOUND OR v_pkg.member_id IS NULL THEN
      RAISE EXCEPTION 'package_not_found_or_no_member';
    END IF;

    -- Upsert concierge_jobs:
    --   - INSERT if no row exists for this package_id
    --   - UPDATE provider_id/total_price_cents if row exists AND no handoffs yet
    --   - Silent no-op if row exists AND handoffs exist (custody chain in progress)
    --
    -- tier=1, scenario=1 match the only existing concierge_jobs pattern in prod.
    -- total_price_cents converts from bids.price (numeric dollars) to integer cents.
    -- member_vehicle_id: nullable in concierge_jobs — NULL is safe if vehicle_id
    --   is missing, but in practice all accepted packages have a vehicle attached.
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
      1,                                            -- tier: 1 = standard stub
      1,                                            -- scenario: 1 = direct maintenance
      'scheduled',                                  -- allowed: draft|scheduled|in_progress|completed|cancelled
      ROUND(NEW.price * 100)::integer,
      'Auto-created from bid acceptance: bid ' || NEW.id::text
    )
    ON CONFLICT (package_id) DO UPDATE SET
      provider_id       = EXCLUDED.provider_id,
      total_price_cents = EXCLUDED.total_price_cents,
      updated_at        = now()
    -- Only update provider if the custody chain has not started yet.
    -- Once handoffs exist for this job, the provider on record is authoritative
    -- and should not be changed by a mid-flight bid acceptance.
    WHERE NOT EXISTS (
      SELECT 1
      FROM custody_handoffs ch
      WHERE ch.job_id = concierge_jobs.id
    );

  EXCEPTION WHEN OTHERS THEN
    -- Log the error but NEVER block the bid acceptance.
    -- Check admin_audit_log WHERE action='trigger_error' AND target_type='bid'
    -- to find any failures. SQLERRM = human message; SQLSTATE = pg error code.
    INSERT INTO admin_audit_log (action, target_id, target_type, reason, metadata, performed_by)
    VALUES (
      'trigger_error',
      NEW.id,
      'bid',
      SQLERRM,
      jsonb_build_object(
        'trigger',    'trg_bid_accepted_create_concierge_job',
        'bid_id',     NEW.id,
        'package_id', NEW.package_id,
        'sqlstate',   SQLSTATE
      ),
      'system_trigger'
    );
  END;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 5. TRIGGER BINDING
-- -----------------------------------------------------------------------------
-- DROP IF EXISTS makes this idempotent — safe to re-run.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS bid_accepted_create_concierge_job ON bids;

CREATE TRIGGER bid_accepted_create_concierge_job
  AFTER INSERT OR UPDATE OF status ON bids
  FOR EACH ROW
  EXECUTE FUNCTION trg_bid_accepted_create_concierge_job();


-- =============================================================================
-- 6. BACKFILL — create concierge_jobs for packages that were already accepted
--    before this trigger existed.
-- =============================================================================
-- The trigger above only fires on future bid inserts/updates. This backfills
-- every maintenance_package that was already in status
-- 'accepted'/'in_progress'/'completed' as of whenever this migration first
-- runs in a given environment.
--
-- SAFE TO RE-RUN: ON CONFLICT (package_id) DO NOTHING makes this idempotent.
-- Running it again (here, or against production where it already ran on
-- 2026-05-29) creates no duplicates and touches no existing rows.
--
-- WHAT IT SKIPS:
--   - Packages with no accepted_bid_id (bid acceptance never recorded)
--   - Packages with no member_id (should not exist in practice)
--   - Packages that already have a concierge_jobs row (idempotent guard)
-- =============================================================================
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
)
SELECT
  mp.member_id,
  b.provider_id,
  mp.id,               -- package_id (the new column)
  mp.vehicle_id,       -- member_vehicle_id (nullable — safe if NULL)
  1,                   -- tier: 1 = standard stub (matches existing prod pattern)
  1,                   -- scenario: 1 = direct maintenance
  'scheduled',         -- allowed: draft|scheduled|in_progress|completed|cancelled
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


-- =============================================================================
-- VERIFICATION (run after applying, optional — same queries as the source docs)
-- =============================================================================
-- SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgname = 'bid_accepted_create_concierge_job';
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'concierge_jobs' AND column_name = 'package_id';
--
-- SELECT constraint_name FROM information_schema.table_constraints
--   WHERE table_name = 'concierge_jobs'
--     AND constraint_name = 'concierge_jobs_package_id_unique';
--
-- SELECT enumlabel, enumsortorder FROM pg_enum e
--   JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname = 'handoff_leg' ORDER BY enumsortorder;
--
-- SELECT count(*) AS packages_still_missing_job
-- FROM maintenance_packages mp
-- WHERE mp.status IN ('accepted', 'in_progress', 'completed')
--   AND mp.accepted_bid_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM concierge_jobs cj WHERE cj.package_id = mp.id
--   );
-- Expected: 0
-- =============================================================================
