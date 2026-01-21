-- =====================================================
-- MY CAR CONCIERGE - VEHICLE RECALLS SYSTEM
-- Run this script in Supabase SQL Editor after main setup
-- Integrates with NHTSA Recalls API for safety alerts
-- =====================================================

-- =====================================================
-- 1. VEHICLE RECALLS TABLE
-- Stores recall information from NHTSA for member vehicles
-- =====================================================
CREATE TABLE IF NOT EXISTS vehicle_recalls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
  
  -- NHTSA Recall Information
  nhtsa_campaign_number TEXT NOT NULL,
  component TEXT,
  summary TEXT,
  consequence TEXT,
  remedy TEXT,
  manufacturer TEXT,
  report_received_date DATE,
  
  -- Acknowledgment tracking
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate recalls per vehicle
  UNIQUE(vehicle_id, nhtsa_campaign_number)
);

-- =====================================================
-- 2. INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_vehicle_recalls_vehicle_id ON vehicle_recalls(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_recalls_campaign ON vehicle_recalls(nhtsa_campaign_number);
CREATE INDEX IF NOT EXISTS idx_vehicle_recalls_acknowledged ON vehicle_recalls(is_acknowledged);
CREATE INDEX IF NOT EXISTS idx_vehicle_recalls_created ON vehicle_recalls(created_at DESC);

-- =====================================================
-- 3. RECALL CHECK LOG TABLE
-- Tracks when recall checks were performed
-- =====================================================
CREATE TABLE IF NOT EXISTS recall_check_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_type TEXT NOT NULL, -- 'single', 'batch', 'scheduled'
  vehicles_checked INTEGER DEFAULT 0,
  recalls_found INTEGER DEFAULT 0,
  new_recalls_added INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE vehicle_recalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_check_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running)
DROP POLICY IF EXISTS "Members can view recalls for their vehicles" ON vehicle_recalls;
DROP POLICY IF EXISTS "Members can update recalls for their vehicles" ON vehicle_recalls;
DROP POLICY IF EXISTS "Service role can manage all recalls" ON vehicle_recalls;
DROP POLICY IF EXISTS "Service role can manage recall logs" ON recall_check_log;

-- Members can view recalls for vehicles they own
CREATE POLICY "Members can view recalls for their vehicles" ON vehicle_recalls
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vehicles 
      WHERE vehicles.id = vehicle_recalls.vehicle_id 
      AND vehicles.owner_id = auth.uid()
    )
  );

-- Members can update (acknowledge) recalls for their vehicles
CREATE POLICY "Members can update recalls for their vehicles" ON vehicle_recalls
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vehicles 
      WHERE vehicles.id = vehicle_recalls.vehicle_id 
      AND vehicles.owner_id = auth.uid()
    )
  );

-- Service role can manage all recalls (for background jobs)
CREATE POLICY "Service role can manage all recalls" ON vehicle_recalls
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Only service role can manage recall check logs
CREATE POLICY "Service role can manage recall logs" ON recall_check_log
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- 5. FUNCTION TO GET ACTIVE RECALL COUNT
-- =====================================================
CREATE OR REPLACE FUNCTION get_vehicle_active_recall_count(v_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER 
  FROM vehicle_recalls 
  WHERE vehicle_id = v_id 
  AND is_acknowledged = FALSE;
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- 6. FUNCTION TO GET ALL RECALLS FOR A VEHICLE
-- =====================================================
CREATE OR REPLACE FUNCTION get_vehicle_recalls(v_id UUID)
RETURNS TABLE (
  id UUID,
  nhtsa_campaign_number TEXT,
  component TEXT,
  summary TEXT,
  consequence TEXT,
  remedy TEXT,
  manufacturer TEXT,
  report_received_date DATE,
  is_acknowledged BOOLEAN,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
  SELECT 
    id,
    nhtsa_campaign_number,
    component,
    summary,
    consequence,
    remedy,
    manufacturer,
    report_received_date,
    is_acknowledged,
    acknowledged_at,
    created_at
  FROM vehicle_recalls 
  WHERE vehicle_id = v_id
  ORDER BY is_acknowledged ASC, created_at DESC;
$$ LANGUAGE SQL STABLE;

-- =====================================================
-- 7. UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_vehicle_recalls_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vehicle_recalls_updated_at ON vehicle_recalls;
CREATE TRIGGER vehicle_recalls_updated_at
  BEFORE UPDATE ON vehicle_recalls
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_recalls_timestamp();

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
