-- RLS hardening pass — fixes from pre-launch policy audit
--
-- Four categories:
--   A. WITH CHECK integrity: 5 UPDATE/ALL policies that were missing WITH CHECK
--      (a credentialed owner could move a row to a resource they don't own)
--   B. is_admin() consistency: 3 tables using inline profiles subquery
--      (payout_settings, pilot_applications, vehicle_service_history)
--   C. provider_performance: add admin ALL policy (was write-only via service role)
--   D. transport_tasks: add scoped provider INSERT policy
--      (assignDestDriver() in providers.js:7742 was silently failing)
--
-- NOTE on provider_performance: the existing "System manages performance" policy
-- (USING: auth.uid() = provider_id, cmd=ALL) allows providers to write their own
-- performance stats. That is a separate security concern not addressed here —
-- a dedicated fix should replace it with a service-role-only pattern.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. WITH CHECK integrity fixes
-- ─────────────────────────────────────────────────────────────────────────────

-- A1. bulk_service_batches — prevent moving a batch to an unowned fleet
DROP POLICY IF EXISTS bsb_update ON bulk_service_batches;
CREATE POLICY bsb_update ON bulk_service_batches
  FOR UPDATE
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM fleets f
      WHERE f.id = bulk_service_batches.fleet_id
        AND f.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM fleets f
      WHERE f.id = bulk_service_batches.fleet_id
        AND f.owner_id = auth.uid()
    )
  );

-- A2. bulk_service_items — prevent moving an item to an unowned batch
DROP POLICY IF EXISTS bsi_update ON bulk_service_items;
CREATE POLICY bsi_update ON bulk_service_items
  FOR UPDATE
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM bulk_service_batches bsb
      WHERE bsb.id = bulk_service_items.batch_id
        AND (
          bsb.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM fleets f
            WHERE f.id = bsb.fleet_id AND f.owner_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM bulk_service_batches bsb
      WHERE bsb.id = bulk_service_items.batch_id
        AND (
          bsb.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM fleets f
            WHERE f.id = bsb.fleet_id AND f.owner_id = auth.uid()
          )
        )
    )
  );

-- A3. fleet_vehicle_assignments — prevent moving an assignment to an unowned fleet
DROP POLICY IF EXISTS fva_update_fleet ON fleet_vehicle_assignments;
CREATE POLICY fva_update_fleet ON fleet_vehicle_assignments
  FOR UPDATE
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM fleets f
      WHERE f.id = fleet_vehicle_assignments.fleet_id
        AND f.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM fleets f
      WHERE f.id = fleet_vehicle_assignments.fleet_id
        AND f.owner_id = auth.uid()
    )
  );

-- A4. key_exchanges — make implicit WITH CHECK explicit; constrain driver_user_id
--     on provider-managed exchanges to real driver profiles
DROP POLICY IF EXISTS "Providers manage key exchanges" ON key_exchanges;
CREATE POLICY "Providers manage key exchanges" ON key_exchanges
  FOR ALL
  USING (
    (driver_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM bids
      WHERE bids.package_id = key_exchanges.package_id
        AND bids.provider_id = auth.uid()
        AND bids.status = 'accepted'
    )
  )
  WITH CHECK (
    (driver_user_id = auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM bids
        WHERE bids.package_id = key_exchanges.package_id
          AND bids.provider_id = auth.uid()
          AND bids.status = 'accepted'
      )
      AND (
        driver_user_id IS NULL
        OR EXISTS (SELECT 1 FROM drivers d WHERE d.profile_id = driver_user_id)
      )
    )
  );

-- A5. vehicle_service_history — prevent changing member_id on a history row
DROP POLICY IF EXISTS service_history_update_own ON vehicle_service_history;
CREATE POLICY service_history_update_own ON vehicle_service_history
  FOR UPDATE
  USING     (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- B. is_admin() consistency (inline profiles.role → SECURITY DEFINER helper)
--    Scope: Batch 2 tables + vehicle_service_history (explicitly audited).
--    The remaining ~60 older inline checks are a separate sweep.
-- ─────────────────────────────────────────────────────────────────────────────

-- B1. payout_settings
DROP POLICY IF EXISTS "Admins can update payout settings" ON payout_settings;
CREATE POLICY "Admins can update payout settings" ON payout_settings
  FOR UPDATE
  USING (is_admin());

-- B2. pilot_applications
DROP POLICY IF EXISTS admin_view   ON pilot_applications;
DROP POLICY IF EXISTS admin_update ON pilot_applications;
DROP POLICY IF EXISTS admin_delete ON pilot_applications;

CREATE POLICY admin_view ON pilot_applications
  FOR SELECT USING (is_admin());

CREATE POLICY admin_update ON pilot_applications
  FOR UPDATE
  USING     (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY admin_delete ON pilot_applications
  FOR DELETE USING (is_admin());

-- B3. vehicle_service_history
DROP POLICY IF EXISTS service_history_admin_all ON vehicle_service_history;
CREATE POLICY service_history_admin_all ON vehicle_service_history
  FOR ALL
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- C. provider_performance — admin ALL policy
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS pp_all_admin ON provider_performance;
CREATE POLICY pp_all_admin ON provider_performance
  FOR ALL
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- D. transport_tasks — scoped provider INSERT
--    Allows a provider to create a transport task only for a destination_service
--    that belongs to a package on which they have an accepted bid.
--    NOT a loose auth.uid() IS NOT NULL — that would let any provider create
--    tasks for any package.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tt_insert_provider ON transport_tasks;
CREATE POLICY tt_insert_provider ON transport_tasks
  FOR INSERT
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM destination_services ds
      WHERE ds.id = transport_tasks.destination_service_id
        AND provider_has_accepted_bid_on_package(ds.package_id)
    )
  );
