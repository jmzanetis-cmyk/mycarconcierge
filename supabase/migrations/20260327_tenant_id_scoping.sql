-- =============================================================================
-- Tenant ID Scoping — White-label Platform (Task #87)
-- Full data isolation across all core business tables.
-- Run AFTER: 20260323_white_label_tenants.sql, 20260327_white_label_tenant_users.sql
-- =============================================================================
-- Covers: profiles, service_requests, vehicles, packages, bids
-- RLS matrix: SELECT + INSERT (WITH CHECK) + UPDATE (WITH CHECK) + DELETE
-- NULL tenant_id = MCC platform row. Non-null = white-label tenant row.
-- Admin/service_role always bypass.
-- =============================================================================

-- ============================================================
-- SCHEMA: Add tenant_id FK to all core business tables
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_requests_tenant_id ON service_requests(tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_packages_tenant_id ON packages(tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bids_tenant_id ON bids(tenant_id) WHERE tenant_id IS NOT NULL;

-- Analytics tables
ALTER TABLE provider_stats
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_provider_stats_tenant_id ON provider_stats(tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE page_views
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_page_views_tenant_id ON page_views(tenant_id) WHERE tenant_id IS NOT NULL;

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================

-- Returns the tenant_id the current auth.uid() belongs to.
-- Returns NULL if the user is a native MCC platform user.
CREATE OR REPLACE FUNCTION get_current_user_tenant_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id FROM white_label_tenant_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Returns TRUE if the current user is an MCC platform admin/super_admin.
-- Reads profiles directly (SECURITY DEFINER bypasses tenant RLS).
CREATE OR REPLACE FUNCTION is_mcc_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

-- Helper: returns the sentinel UUID used for "platform" rows (tenant_id IS NULL).
-- Avoids repeated casting.
CREATE OR REPLACE FUNCTION platform_sentinel()
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT '00000000-0000-0000-0000-000000000000'::UUID;
$$;

-- Helper: coerce a nullable tenant_id to the sentinel so IS NULL vs IS NULL
-- comparisons work as equality checks in RLS USING clauses.
CREATE OR REPLACE FUNCTION tenant_or_sentinel(t UUID)
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(t, '00000000-0000-0000-0000-000000000000'::UUID);
$$;

-- ============================================================
-- AUTO-STAMP TRIGGER
-- On INSERT, stamps tenant_id from the authenticated user's membership.
-- Applied to all scoped tables.
-- ============================================================
CREATE OR REPLACE FUNCTION stamp_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM white_label_tenant_users
    WHERE user_id = auth.uid()
    LIMIT 1;
    NEW.tenant_id := v_tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Service requests
DROP TRIGGER IF EXISTS trg_stamp_tenant_id_service_requests ON service_requests;
CREATE TRIGGER trg_stamp_tenant_id_service_requests
  BEFORE INSERT ON service_requests
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();

-- Vehicles
DROP TRIGGER IF EXISTS trg_stamp_tenant_id_vehicles ON vehicles;
CREATE TRIGGER trg_stamp_tenant_id_vehicles
  BEFORE INSERT ON vehicles
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();

-- Packages
DROP TRIGGER IF EXISTS trg_stamp_tenant_id_packages ON packages;
CREATE TRIGGER trg_stamp_tenant_id_packages
  BEFORE INSERT ON packages
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();

-- Bids
DROP TRIGGER IF EXISTS trg_stamp_tenant_id_bids ON bids;
CREATE TRIGGER trg_stamp_tenant_id_bids
  BEFORE INSERT ON bids
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();

-- ============================================================
-- RLS — PROFILES (full matrix)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant scoped profile read" ON profiles;
CREATE POLICY "Tenant scoped profile read"
  ON profiles FOR SELECT
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR id = auth.uid()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped profile insert" ON profiles;
CREATE POLICY "Tenant scoped profile insert"
  ON profiles FOR INSERT
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR id = auth.uid()
    -- User may only create their own profile; tenant_id will be stamped by server logic
    OR is_mcc_admin()
  );

DROP POLICY IF EXISTS "Tenant scoped profile update" ON profiles;
CREATE POLICY "Tenant scoped profile update"
  ON profiles FOR UPDATE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR id = auth.uid()
  )
  WITH CHECK (
    -- Cannot cross-assign tenant_id to another tenant
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (id = auth.uid()
        AND tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped profile delete" ON profiles;
CREATE POLICY "Tenant scoped profile delete"
  ON profiles FOR DELETE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR id = auth.uid()
  );

-- ============================================================
-- RLS — SERVICE REQUESTS (full matrix)
-- ============================================================
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant scoped service request read" ON service_requests;
CREATE POLICY "Tenant scoped service request read"
  ON service_requests FOR SELECT
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR user_id = auth.uid()
    OR provider_id = auth.uid()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped service request insert" ON service_requests;
CREATE POLICY "Tenant scoped service request insert"
  ON service_requests FOR INSERT
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (user_id = auth.uid()
        AND tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped service request update" ON service_requests;
CREATE POLICY "Tenant scoped service request update"
  ON service_requests FOR UPDATE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR user_id = auth.uid()
    OR provider_id = auth.uid()
  )
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped service request delete" ON service_requests;
CREATE POLICY "Tenant scoped service request delete"
  ON service_requests FOR DELETE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR user_id = auth.uid()
  );

-- ============================================================
-- RLS — VEHICLES (full matrix)
-- ============================================================
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant scoped vehicle read" ON vehicles;
CREATE POLICY "Tenant scoped vehicle read"
  ON vehicles FOR SELECT
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR user_id = auth.uid()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped vehicle insert" ON vehicles;
CREATE POLICY "Tenant scoped vehicle insert"
  ON vehicles FOR INSERT
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (user_id = auth.uid()
        AND tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped vehicle update" ON vehicles;
CREATE POLICY "Tenant scoped vehicle update"
  ON vehicles FOR UPDATE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped vehicle delete" ON vehicles;
CREATE POLICY "Tenant scoped vehicle delete"
  ON vehicles FOR DELETE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR user_id = auth.uid()
  );

-- ============================================================
-- RLS — PACKAGES (full matrix)
-- Packages belong to providers. Tenant scoping restricts cross-tenant visibility.
-- ============================================================
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant scoped package read" ON packages;
CREATE POLICY "Tenant scoped package read"
  ON packages FOR SELECT
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR provider_id = auth.uid()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped package insert" ON packages;
CREATE POLICY "Tenant scoped package insert"
  ON packages FOR INSERT
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (provider_id = auth.uid()
        AND tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped package update" ON packages;
CREATE POLICY "Tenant scoped package update"
  ON packages FOR UPDATE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR provider_id = auth.uid()
  )
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped package delete" ON packages;
CREATE POLICY "Tenant scoped package delete"
  ON packages FOR DELETE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR provider_id = auth.uid()
  );

-- ============================================================
-- RLS — BIDS (full matrix)
-- Bids link a provider to a service_request. Tenant scoped by the request's tenant.
-- ============================================================
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant scoped bid read" ON bids;
CREATE POLICY "Tenant scoped bid read"
  ON bids FOR SELECT
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR provider_id = auth.uid()
    -- Member bid visibility is served via service_role (server.js); Supabase client reads scoped by tenant.
    -- Tenant members can see all bids within their tenant (for marketplace transparency).
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
    -- Package owner access: member who owns the service package being bid on
    OR EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = bids.package_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant scoped bid insert" ON bids;
CREATE POLICY "Tenant scoped bid insert"
  ON bids FOR INSERT
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (provider_id = auth.uid()
        AND tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped bid update" ON bids;
CREATE POLICY "Tenant scoped bid update"
  ON bids FOR UPDATE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR provider_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = bids.package_id
        AND sr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped bid delete" ON bids;
CREATE POLICY "Tenant scoped bid delete"
  ON bids FOR DELETE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR provider_id = auth.uid()
  );

-- ============================================================
-- RLS — PROVIDER STATS analytics (full matrix)
-- ============================================================
ALTER TABLE provider_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant scoped provider stats read" ON provider_stats;
CREATE POLICY "Tenant scoped provider stats read"
  ON provider_stats FOR SELECT
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR provider_id = auth.uid()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped provider stats insert" ON provider_stats;
CREATE POLICY "Tenant scoped provider stats insert"
  ON provider_stats FOR INSERT
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (provider_id = auth.uid()
        AND tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped provider stats update" ON provider_stats;
CREATE POLICY "Tenant scoped provider stats update"
  ON provider_stats FOR UPDATE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR provider_id = auth.uid()
  )
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped provider stats delete" ON provider_stats;
CREATE POLICY "Tenant scoped provider stats delete"
  ON provider_stats FOR DELETE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
  );

-- ============================================================
-- RLS — PAGE VIEWS analytics (full matrix)
-- ============================================================
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant scoped page view read" ON page_views;
CREATE POLICY "Tenant scoped page view read"
  ON page_views FOR SELECT
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR user_id = auth.uid()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped page view insert" ON page_views;
CREATE POLICY "Tenant scoped page view insert"
  ON page_views FOR INSERT
  WITH CHECK (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
    OR (tenant_or_sentinel(tenant_id) = tenant_or_sentinel(get_current_user_tenant_id()))
  );

DROP POLICY IF EXISTS "Tenant scoped page view delete" ON page_views;
CREATE POLICY "Tenant scoped page view delete"
  ON page_views FOR DELETE
  USING (
    (current_setting('role', TRUE) = 'service_role')
    OR is_mcc_admin()
  );

-- Analytics stamp triggers
DROP TRIGGER IF EXISTS trg_stamp_tenant_id_provider_stats ON provider_stats;
CREATE TRIGGER trg_stamp_tenant_id_provider_stats
  BEFORE INSERT ON provider_stats
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();

DROP TRIGGER IF EXISTS trg_stamp_tenant_id_page_views ON page_views;
CREATE TRIGGER trg_stamp_tenant_id_page_views
  BEFORE INSERT ON page_views
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();

-- ============================================================
-- PROFILE CREATION LIFECYCLE — stamp tenant_id on profile create
-- When a user signs up from a tenant domain, the server stamps their
-- profile tenant_id via the service_role key (bypasses RLS).
-- This trigger is a safety net: if auth.uid() has a tenant membership
-- (e.g., pre-seeded via invite), stamp it automatically.
-- ============================================================
CREATE OR REPLACE FUNCTION stamp_profile_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM white_label_tenant_users
    WHERE user_id = auth.uid()
    LIMIT 1;
    NEW.tenant_id := v_tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_profile_tenant_id ON profiles;
CREATE TRIGGER trg_stamp_profile_tenant_id
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION stamp_profile_tenant_id();

-- ============================================================
-- GRANT — ensure service_role can call helper functions
-- ============================================================
GRANT EXECUTE ON FUNCTION get_current_user_tenant_id() TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION is_mcc_admin() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION stamp_tenant_id() TO service_role;
GRANT EXECUTE ON FUNCTION stamp_profile_tenant_id() TO service_role;
GRANT EXECUTE ON FUNCTION platform_sentinel() TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION tenant_or_sentinel(UUID) TO service_role, authenticated, anon;
