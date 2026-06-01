-- Custody schema hardening for provider-liability posture
--
-- Three changes:
--
--   1. custody_handoffs.on_behalf_of_provider_id (new column)
--      When a driver leg executes, the provider who dispatched that driver
--      must be snapshotted here. Without it, the driver→provider employment
--      link is only in the live `drivers` table — deletable after an incident.
--      Populated by custody.js when creating a driver handoff leg.
--      NULL for non-driver legs (member↔provider direct).
--
--   2. concierge_jobs.provider_id NOT NULL
--      A job with no provider_id has no one to hold liable. The trigger
--      always writes a provider_id; this enforces it at the schema level.
--      One test stub row with NULL is deleted first (all 12 rows are
--      test stubs, regeneratable from bid acceptance).
--
--   3. Comments on concierge_jobs.tier and concierge_jobs.scenario
--      Opaque smallints — document their meaning so dispute resolution
--      doesn't depend on institutional memory.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Snapshot driver's employer in the handoff record
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE custody_handoffs
  ADD COLUMN on_behalf_of_provider_id uuid REFERENCES profiles(id);

COMMENT ON COLUMN custody_handoffs.on_behalf_of_provider_id IS
  'Provider who dispatched the driver for this leg. Snapshotted at handoff '
  'creation so the driver→provider employment link survives driver record '
  'deletion. NULL for member↔provider direct legs (no intermediary driver).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Enforce provider_id NOT NULL on concierge_jobs
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove the one test stub that has no provider (all 12 rows are test data,
-- regeneratable via bid acceptance on any package).
DELETE FROM concierge_jobs WHERE provider_id IS NULL;

ALTER TABLE concierge_jobs
  ALTER COLUMN provider_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Document tier and scenario
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN concierge_jobs.tier IS
  'Service tier: 1 = standard concierge pickup/dropoff. Reserved for future '
  'expansion (2 = white-glove, etc.). Auto-populated as 1 by the bid-accepted '
  'trigger; update manually for premium bookings.';

COMMENT ON COLUMN concierge_jobs.scenario IS
  'Job scenario: 1 = provider-dispatched driver moves member vehicle to shop '
  'and back. Reserved for future expansion (2 = member drop-off, etc.). '
  'Auto-populated as 1 by the bid-accepted trigger.';
