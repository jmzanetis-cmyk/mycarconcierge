-- Tenant ID Scoping — White-label Platform (Task #87)
-- Adds tenant_id column to core business tables so white-label tenants
-- can have isolated data views. All columns are nullable to preserve
-- existing rows (NULL = MCC platform, non-NULL = specific white-label tenant).
-- Run in Supabase SQL Editor after 20260323_white_label_tenants.sql and
-- 20260327_white_label_tenant_users.sql.

-- 1. PROFILES — link profiles to a specific white-label tenant
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id) WHERE tenant_id IS NOT NULL;

-- 2. SERVICE REQUESTS — scope service requests to a tenant
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_requests_tenant_id ON service_requests(tenant_id) WHERE tenant_id IS NOT NULL;

-- 3. VEHICLES — scope vehicle records to a tenant
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES white_label_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id) WHERE tenant_id IS NOT NULL;

-- =====================================================================
-- RLS HELPER FUNCTION
-- Returns the tenant_id that the currently authenticated user belongs to.
-- Returns NULL if the user is a native MCC platform user (not white-label).
-- SECURITY DEFINER runs as pg superuser, bypassing circular RLS.
-- =====================================================================
CREATE OR REPLACE FUNCTION get_current_user_tenant_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id FROM white_label_tenant_users
  WHERE user_id = auth.uid()
  ORDER BY role DESC -- 'provider' > 'owner' > 'member' — pick most privileged
  LIMIT 1;
$$;

-- =====================================================================
-- RLS POLICIES — tenant_id isolation for profiles
-- Rules:
--   - MCC platform users (tenant_id IS NULL) see only platform rows
--   - White-label users see only their tenant's rows
--   - MCC admins (role = admin/super_admin) see all rows (bypass)
-- =====================================================================
DROP POLICY IF EXISTS "Tenant scoped profile read" ON profiles;
CREATE POLICY "Tenant scoped profile read"
  ON profiles FOR SELECT
  USING (
    -- Platform admin bypass
    EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = auth.uid() AND p2.role IN ('admin', 'super_admin'))
    OR
    -- Service role bypass (server.js)
    (current_setting('role') = 'service_role')
    OR
    -- Same tenant OR both on platform (tenant_id IS NULL matches NULL)
    (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
     = COALESCE(get_current_user_tenant_id(), '00000000-0000-0000-0000-000000000000'::uuid))
    OR
    -- Own profile always visible
    id = auth.uid()
  );

-- =====================================================================
-- RLS POLICIES — service_requests tenant isolation
-- =====================================================================
DROP POLICY IF EXISTS "Tenant scoped service request read" ON service_requests;
CREATE POLICY "Tenant scoped service request read"
  ON service_requests FOR SELECT
  USING (
    (current_setting('role') = 'service_role')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
    OR (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(get_current_user_tenant_id(), '00000000-0000-0000-0000-000000000000'::uuid))
    OR user_id = auth.uid()
    OR provider_id = auth.uid()
  );

-- =====================================================================
-- SERVER-SIDE TENANT STAMP TRIGGER
-- Automatically stamps tenant_id on INSERT for service_requests and vehicles
-- based on the authenticated user's tenant membership.
-- =====================================================================
CREATE OR REPLACE FUNCTION stamp_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Only stamp if not already set
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

DROP TRIGGER IF EXISTS trg_stamp_tenant_id_service_requests ON service_requests;
CREATE TRIGGER trg_stamp_tenant_id_service_requests
  BEFORE INSERT ON service_requests
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();

DROP TRIGGER IF EXISTS trg_stamp_tenant_id_vehicles ON vehicles;
CREATE TRIGGER trg_stamp_tenant_id_vehicles
  BEFORE INSERT ON vehicles
  FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
