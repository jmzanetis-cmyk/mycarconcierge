-- =====================================================
-- MY CAR CONCIERGE - FUEL COST TRACKING SYSTEM
-- Run this script in Supabase SQL Editor after main setup
-- Tracks fuel expenses and calculates MPG statistics
-- =====================================================

-- =====================================================
-- 1. FUEL LOGS TABLE
-- Stores fuel fill-up records for member vehicles
-- =====================================================
CREATE TABLE IF NOT EXISTS fuel_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
  member_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Fill-up Details
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  odometer INTEGER NOT NULL,
  gallons DECIMAL(10, 3) NOT NULL,
  price_per_gallon DECIMAL(10, 3) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  
  -- Fuel Type
  fuel_type TEXT NOT NULL DEFAULT 'regular' CHECK (fuel_type IN ('regular', 'mid-grade', 'premium', 'diesel', 'electric')),
  
  -- Optional Details
  station_name VARCHAR(255),
  notes TEXT,
  
  -- Full tank indicator for accurate MPG calculation
  is_full_tank BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_fuel_logs_vehicle_id ON fuel_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_member_id ON fuel_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_date ON fuel_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_vehicle_date ON fuel_logs(vehicle_id, date DESC);

-- =====================================================
-- 3. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running)
DROP POLICY IF EXISTS "Members can view their fuel logs" ON fuel_logs;
DROP POLICY IF EXISTS "Members can insert their fuel logs" ON fuel_logs;
DROP POLICY IF EXISTS "Members can update their fuel logs" ON fuel_logs;
DROP POLICY IF EXISTS "Members can delete their fuel logs" ON fuel_logs;
DROP POLICY IF EXISTS "Service role can manage all fuel logs" ON fuel_logs;

-- Members can view their own fuel logs
CREATE POLICY "Members can view their fuel logs" ON fuel_logs
  FOR SELECT
  USING (member_id = auth.uid());

-- Members can insert fuel logs for their vehicles
CREATE POLICY "Members can insert their fuel logs" ON fuel_logs
  FOR INSERT
  WITH CHECK (
    member_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM vehicles 
      WHERE vehicles.id = fuel_logs.vehicle_id 
      AND vehicles.owner_id = auth.uid()
    )
  );

-- Members can update their own fuel logs
CREATE POLICY "Members can update their fuel logs" ON fuel_logs
  FOR UPDATE
  USING (member_id = auth.uid());

-- Members can delete their own fuel logs
CREATE POLICY "Members can delete their fuel logs" ON fuel_logs
  FOR DELETE
  USING (member_id = auth.uid());

-- Service role can manage all fuel logs (for admin/background jobs)
CREATE POLICY "Service role can manage all fuel logs" ON fuel_logs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- 4. FUNCTION TO CALCULATE MPG FOR A VEHICLE
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_vehicle_mpg(v_id UUID)
RETURNS TABLE (
  avg_mpg DECIMAL(10, 2),
  total_miles INTEGER,
  total_gallons DECIMAL(10, 3),
  total_spent DECIMAL(10, 2),
  avg_price_per_gallon DECIMAL(10, 3),
  fill_up_count INTEGER
) AS $$
DECLARE
  first_odometer INTEGER;
  last_odometer INTEGER;
  total_gal DECIMAL(10, 3);
  total_cost DECIMAL(10, 2);
  avg_price DECIMAL(10, 3);
  num_fillups INTEGER;
  miles_driven INTEGER;
  calculated_mpg DECIMAL(10, 2);
BEGIN
  -- Get aggregated values
  SELECT 
    MIN(odometer),
    MAX(odometer),
    SUM(gallons),
    SUM(fuel_logs.total_cost),
    AVG(price_per_gallon),
    COUNT(*)
  INTO first_odometer, last_odometer, total_gal, total_cost, avg_price, num_fillups
  FROM fuel_logs
  WHERE vehicle_id = v_id;
  
  -- Calculate miles driven
  miles_driven := COALESCE(last_odometer - first_odometer, 0);
  
  -- Calculate MPG (avoid division by zero)
  IF total_gal > 0 AND num_fillups > 1 THEN
    calculated_mpg := miles_driven::DECIMAL / total_gal;
  ELSE
    calculated_mpg := NULL;
  END IF;
  
  RETURN QUERY SELECT 
    calculated_mpg,
    miles_driven,
    COALESCE(total_gal, 0),
    COALESCE(total_cost, 0),
    COALESCE(avg_price, 0),
    COALESCE(num_fillups, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 5. FUNCTION TO GET MONTHLY FUEL SPENDING
-- =====================================================
CREATE OR REPLACE FUNCTION get_monthly_fuel_spending(m_id UUID, months_back INTEGER DEFAULT 12)
RETURNS TABLE (
  month DATE,
  total_spent DECIMAL(10, 2),
  total_gallons DECIMAL(10, 3),
  fill_up_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE_TRUNC('month', date)::DATE as month,
    SUM(fuel_logs.total_cost)::DECIMAL(10, 2),
    SUM(gallons)::DECIMAL(10, 3),
    COUNT(*)::INTEGER
  FROM fuel_logs
  WHERE member_id = m_id
    AND date >= DATE_TRUNC('month', CURRENT_DATE) - (months_back || ' months')::INTERVAL
  GROUP BY DATE_TRUNC('month', date)
  ORDER BY month DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 6. UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_fuel_logs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fuel_logs_updated_at ON fuel_logs;
CREATE TRIGGER fuel_logs_updated_at
  BEFORE UPDATE ON fuel_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_fuel_logs_timestamp();

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
