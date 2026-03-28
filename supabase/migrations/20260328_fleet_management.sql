-- =====================================================
-- FLEET MANAGEMENT SAAS (Task #88)
-- Core tables: fleets, fleet_members, fleet_vehicles, bulk_service_batches
-- Run in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. FLEETS TABLE — The fleet organization
-- =====================================================
CREATE TABLE IF NOT EXISTS fleets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company_name TEXT,
  business_type TEXT DEFAULT 'other',
  billing_email TEXT,
  billing_address TEXT,
  address TEXT,
  tax_id TEXT,
  auto_approve_under NUMERIC(10, 2) DEFAULT 100,
  monthly_budget NUMERIC(10, 2),
  settings JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleets_owner ON fleets(owner_id);

-- =====================================================
-- 2. FLEET MEMBERS TABLE — Drivers/managers in a fleet
-- =====================================================
CREATE TABLE IF NOT EXISTS fleet_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email TEXT,
  role TEXT DEFAULT 'driver',
  department TEXT,
  employee_id TEXT,
  spending_limit NUMERIC(10, 2),
  requires_approval BOOLEAN DEFAULT false,
  permissions JSONB DEFAULT '{}',
  invite_token TEXT,
  invite_sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_members_fleet ON fleet_members(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_members_user ON fleet_members(user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_members_status ON fleet_members(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_fleet_members_token ON fleet_members(invite_token) WHERE invite_token IS NOT NULL;

-- =====================================================
-- 3. FLEET VEHICLES TABLE — Vehicles assigned to a fleet
-- =====================================================
CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  assigned_driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fleet_number TEXT,
  department TEXT,
  cost_center TEXT,
  assignment_type TEXT DEFAULT 'pool',
  start_date DATE,
  end_date DATE,
  maintenance_schedule TEXT DEFAULT 'standard',
  next_service_due DATE,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_fleet ON fleet_vehicles(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_vehicle ON fleet_vehicles(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_driver ON fleet_vehicles(assigned_driver_id);

-- =====================================================
-- 4. BULK SERVICE BATCHES TABLE — Multi-vehicle service requests
-- =====================================================
CREATE TABLE IF NOT EXISTS bulk_service_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  service_category TEXT,
  vehicle_ids UUID[],
  status TEXT DEFAULT 'draft',
  total_estimated_cost NUMERIC(10, 2),
  total_actual_cost NUMERIC(10, 2),
  packages_created INTEGER DEFAULT 0,
  packages_completed INTEGER DEFAULT 0,
  scheduled_date DATE,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_batches_fleet ON bulk_service_batches(fleet_id);
CREATE INDEX IF NOT EXISTS idx_bulk_batches_status ON bulk_service_batches(status);

-- =====================================================
-- 5. ADD fleet_id to maintenance_packages
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'maintenance_packages' AND column_name = 'fleet_id'
  ) THEN
    ALTER TABLE maintenance_packages ADD COLUMN fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL;
    CREATE INDEX idx_maintenance_packages_fleet ON maintenance_packages(fleet_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'maintenance_packages' AND column_name = 'bulk_batch_id'
  ) THEN
    ALTER TABLE maintenance_packages ADD COLUMN bulk_batch_id UUID REFERENCES bulk_service_batches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'maintenance_packages' AND column_name = 'pending_approval_amount'
  ) THEN
    ALTER TABLE maintenance_packages ADD COLUMN pending_approval_amount NUMERIC(10, 2);
  END IF;
END $$;

-- =====================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_service_batches ENABLE ROW LEVEL SECURITY;

-- Fleets: owner can do anything, members can view
DROP POLICY IF EXISTS "Fleet owners can manage their fleets" ON fleets;
CREATE POLICY "Fleet owners can manage their fleets" ON fleets
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Fleet members can view their fleet" ON fleets;
CREATE POLICY "Fleet members can view their fleet" ON fleets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM fleet_members
      WHERE fleet_members.fleet_id = fleets.id
        AND fleet_members.user_id = auth.uid()
        AND fleet_members.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all fleets" ON fleets;
CREATE POLICY "Admins can manage all fleets" ON fleets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- fleet_members: READ for fleet members (owner/manager see all, member sees self).
-- WRITE restricted to service role only to enforce driver seat limits via server API.
DROP POLICY IF EXISTS "Fleet owners can manage members" ON fleet_members;
DROP POLICY IF EXISTS "Fleet members read owner manager" ON fleet_members;
DROP POLICY IF EXISTS "Fleet members can view their own membership" ON fleet_members;
DROP POLICY IF EXISTS "Fleet members write service role only" ON fleet_members;

CREATE POLICY "Fleet members read owner manager" ON fleet_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM fleets WHERE fleets.id = fleet_members.fleet_id AND fleets.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM fleet_members fm2
      WHERE fm2.fleet_id = fleet_members.fleet_id
        AND fm2.user_id = auth.uid()
        AND fm2.status = 'active'
    )
  );

CREATE POLICY "Fleet members can view their own membership" ON fleet_members
  FOR SELECT USING (user_id = auth.uid());

-- Write operations: only service role (server) may INSERT/UPDATE/DELETE fleet_members.
-- Service role bypasses RLS, enforcing plan limits in /api/fleet/invite and /api/fleet/setup.
CREATE POLICY "Fleet members write service role only" ON fleet_members
  FOR INSERT WITH CHECK (false);

CREATE POLICY "Fleet members update service role only" ON fleet_members
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "Fleet members delete service role only" ON fleet_members
  FOR DELETE USING (false);

DROP POLICY IF EXISTS "Admins can manage all fleet members" ON fleet_members;
CREATE POLICY "Admins can manage all fleet members" ON fleet_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Fleet vehicles: READ allowed for fleet members; WRITE restricted to service role only.
-- Mutations (INSERT/UPDATE/DELETE) must go through server API endpoints which enforce plan limits.
DROP POLICY IF EXISTS "Fleet vehicles access" ON fleet_vehicles;
DROP POLICY IF EXISTS "Fleet vehicles read" ON fleet_vehicles;
DROP POLICY IF EXISTS "Fleet vehicles write service role only" ON fleet_vehicles;

CREATE POLICY "Fleet vehicles read" ON fleet_vehicles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM fleets WHERE fleets.id = fleet_vehicles.fleet_id AND fleets.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM fleet_members
      WHERE fleet_members.fleet_id = fleet_vehicles.fleet_id
        AND fleet_members.user_id = auth.uid()
        AND fleet_members.status = 'active'
    )
  );

-- Write operations: only service role (server) may INSERT/UPDATE/DELETE fleet_vehicles.
-- Service role bypasses RLS, so no explicit policy is needed for it.
-- Blocking authenticated-user direct writes enforces plan limits at the data layer.
CREATE POLICY "Fleet vehicles write service role only" ON fleet_vehicles
  FOR INSERT WITH CHECK (false);

CREATE POLICY "Fleet vehicles update service role only" ON fleet_vehicles
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "Fleet vehicles delete service role only" ON fleet_vehicles
  FOR DELETE USING (false);

DROP POLICY IF EXISTS "Admins can manage all fleet vehicles" ON fleet_vehicles;
CREATE POLICY "Admins can manage all fleet vehicles" ON fleet_vehicles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Bulk service batches
DROP POLICY IF EXISTS "Bulk batch access" ON bulk_service_batches;
CREATE POLICY "Bulk batch access" ON bulk_service_batches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM fleets WHERE fleets.id = bulk_service_batches.fleet_id AND fleets.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM fleet_members
      WHERE fleet_members.fleet_id = bulk_service_batches.fleet_id
        AND fleet_members.user_id = auth.uid()
        AND fleet_members.status = 'active'
    )
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM fleets WHERE fleets.id = bulk_service_batches.fleet_id AND fleets.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM fleet_members fm2
      WHERE fm2.fleet_id = bulk_service_batches.fleet_id
        AND fm2.user_id = auth.uid()
        AND fm2.role IN ('manager', 'owner')
        AND fm2.status = 'active'
    )
  );

-- =====================================================
-- 7. FLEET INVITE TOKENS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS fleet_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'driver',
  department TEXT,
  employee_id TEXT,
  spending_limit NUMERIC(10, 2),
  requires_approval BOOLEAN DEFAULT false,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_invites_token ON fleet_invites(token);
CREATE INDEX IF NOT EXISTS idx_fleet_invites_fleet ON fleet_invites(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_invites_email ON fleet_invites(email);

ALTER TABLE fleet_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet invite access" ON fleet_invites;
CREATE POLICY "Fleet invite access" ON fleet_invites
  FOR ALL USING (
    EXISTS (SELECT 1 FROM fleets WHERE fleets.id = fleet_invites.fleet_id AND fleets.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM fleet_members fm
      WHERE fm.fleet_id = fleet_invites.fleet_id
        AND fm.user_id = auth.uid()
        AND fm.role IN ('manager', 'owner')
        AND fm.status = 'active'
    )
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM fleets WHERE fleets.id = fleet_invites.fleet_id AND fleets.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM fleet_members fm
      WHERE fm.fleet_id = fleet_invites.fleet_id
        AND fm.user_id = auth.uid()
        AND fm.role IN ('manager', 'owner')
        AND fm.status = 'active'
    )
  );

-- IMPORTANT: The invite token lookup is handled exclusively by the server-side
-- service role key (in /api/fleet/invite/:token). Direct client-side access to
-- fleet_invites is NOT granted for unauthenticated users. Authenticated invitees
-- can only see their own invite (matched by email) to prevent enumeration.
DROP POLICY IF EXISTS "Public invite lookup by token" ON fleet_invites;
CREATE POLICY "Invitee reads their own invite" ON fleet_invites
  FOR SELECT USING (
    -- fleet owner/manager can read all invites for their fleet
    EXISTS (SELECT 1 FROM fleets WHERE fleets.id = fleet_invites.fleet_id AND fleets.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM fleet_members fm
      WHERE fm.fleet_id = fleet_invites.fleet_id
        AND fm.user_id = auth.uid()
        AND fm.role IN ('manager', 'owner')
        AND fm.status = 'active'
    )
    -- invited user can read their own invite (matched by email)
    OR (
      auth.uid() IS NOT NULL
      AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
