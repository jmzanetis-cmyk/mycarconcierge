-- =====================================================
-- MY CAR CONCIERGE - SERVICE SCHEDULING & COORDINATION
-- Run this script in Supabase SQL Editor after main setup
-- =====================================================

-- =====================================================
-- 1. SERVICE APPOINTMENTS TABLE
-- Tracks scheduled service dates between members and providers
-- =====================================================
CREATE TABLE IF NOT EXISTS service_appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES maintenance_packages(id) ON DELETE CASCADE,
  member_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Scheduling
  proposed_date DATE NOT NULL,
  proposed_time_start TIME,
  proposed_time_end TIME,
  confirmed_date DATE,
  confirmed_time_start TIME,
  confirmed_time_end TIME,
  
  -- Estimated completion
  estimated_completion_date DATE,
  estimated_days INTEGER,
  
  -- Who proposed and status
  proposed_by TEXT NOT NULL, -- 'member' or 'provider'
  status TEXT DEFAULT 'proposed', -- 'proposed', 'confirmed', 'rescheduled', 'cancelled'
  
  -- Counter-proposal tracking
  counter_proposed_date DATE,
  counter_proposed_time_start TIME,
  counter_proposed_time_end TIME,
  counter_proposed_by TEXT,
  counter_notes TEXT,
  
  -- Notes
  member_notes TEXT,
  provider_notes TEXT,
  
  -- Timestamps
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. VEHICLE TRANSFERS TABLE
-- Tracks vehicle handoff between member and provider
-- =====================================================
CREATE TABLE IF NOT EXISTS vehicle_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES maintenance_packages(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES service_appointments(id) ON DELETE SET NULL,
  member_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Transfer method
  transfer_type TEXT NOT NULL, -- 'member_dropoff', 'provider_pickup', 'mobile_service', 'towing'
  
  -- Pickup details (car goes to provider)
  pickup_address TEXT,
  pickup_city TEXT,
  pickup_state TEXT,
  pickup_zip TEXT,
  pickup_notes TEXT,
  pickup_scheduled_at TIMESTAMPTZ,
  pickup_completed_at TIMESTAMPTZ,
  pickup_confirmed_by TEXT, -- 'member' or 'provider'
  
  -- Return details (car goes back to member)
  return_address TEXT,
  return_city TEXT,
  return_state TEXT,
  return_zip TEXT,
  return_notes TEXT,
  return_scheduled_at TIMESTAMPTZ,
  return_completed_at TIMESTAMPTZ,
  return_confirmed_by TEXT,
  
  -- Vehicle status tracking
  vehicle_status TEXT DEFAULT 'with_member', 
  -- 'with_member', 'in_transit_to_provider', 'at_provider', 'work_in_progress', 
  -- 'work_complete', 'ready_for_return', 'in_transit_to_member', 'returned'
  
  -- Status timestamps
  arrived_at_provider_at TIMESTAMPTZ,
  work_started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,
  ready_for_return_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  
  -- Special instructions
  special_instructions TEXT,
  
  -- Signatures/confirmations (optional)
  member_pickup_signature TEXT,
  provider_pickup_signature TEXT,
  member_return_signature TEXT,
  provider_return_signature TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. LOCATION SHARES TABLE
-- Temporary location sharing between parties
-- =====================================================
CREATE TABLE IF NOT EXISTS location_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID REFERENCES maintenance_packages(id) ON DELETE CASCADE,
  transfer_id UUID REFERENCES vehicle_transfers(id) ON DELETE SET NULL,
  shared_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Location data
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(10, 2), -- meters
  address_text TEXT,
  
  -- Google Maps link
  maps_link TEXT,
  
  -- Context
  context TEXT, -- 'pickup', 'dropoff', 'in_transit', 'arrived'
  message TEXT,
  
  -- Expiry
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours'),
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  shared_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. ADD LOGISTICS STATUS TO MAINTENANCE_PACKAGES
-- =====================================================
DO $$
BEGIN
  -- Add logistics_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'maintenance_packages' AND column_name = 'logistics_status'
  ) THEN
    ALTER TABLE maintenance_packages ADD COLUMN logistics_status TEXT DEFAULT 'pending';
  END IF;
  
  -- Add current_appointment_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'maintenance_packages' AND column_name = 'current_appointment_id'
  ) THEN
    ALTER TABLE maintenance_packages ADD COLUMN current_appointment_id UUID;
  END IF;
  
  -- Add current_transfer_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'maintenance_packages' AND column_name = 'current_transfer_id'
  ) THEN
    ALTER TABLE maintenance_packages ADD COLUMN current_transfer_id UUID;
  END IF;
END $$;

-- =====================================================
-- 5. CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_service_appointments_package ON service_appointments(package_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_member ON service_appointments(member_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_provider ON service_appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_status ON service_appointments(status);

CREATE INDEX IF NOT EXISTS idx_vehicle_transfers_package ON vehicle_transfers(package_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_transfers_status ON vehicle_transfers(vehicle_status);

CREATE INDEX IF NOT EXISTS idx_location_shares_package ON location_shares(package_id);
CREATE INDEX IF NOT EXISTS idx_location_shares_active ON location_shares(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_location_shares_shared_with ON location_shares(shared_with);

-- =====================================================
-- 6. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE service_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_shares ENABLE ROW LEVEL SECURITY;

-- SERVICE APPOINTMENTS POLICIES
CREATE POLICY "Users can view their own appointments" ON service_appointments
  FOR SELECT USING (auth.uid() = member_id OR auth.uid() = provider_id);

CREATE POLICY "Members can create appointments" ON service_appointments
  FOR INSERT WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Providers can create appointments" ON service_appointments
  FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Parties can update their appointments" ON service_appointments
  FOR UPDATE 
  USING (auth.uid() = member_id OR auth.uid() = provider_id)
  WITH CHECK (auth.uid() = member_id OR auth.uid() = provider_id);

CREATE POLICY "Admins can manage all appointments" ON service_appointments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- VEHICLE TRANSFERS POLICIES
CREATE POLICY "Users can view their own transfers" ON vehicle_transfers
  FOR SELECT USING (auth.uid() = member_id OR auth.uid() = provider_id);

CREATE POLICY "Parties can create transfers" ON vehicle_transfers
  FOR INSERT WITH CHECK (auth.uid() = member_id OR auth.uid() = provider_id);

CREATE POLICY "Parties can update their transfers" ON vehicle_transfers
  FOR UPDATE 
  USING (auth.uid() = member_id OR auth.uid() = provider_id)
  WITH CHECK (auth.uid() = member_id OR auth.uid() = provider_id);

CREATE POLICY "Admins can manage all transfers" ON vehicle_transfers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- LOCATION SHARES POLICIES
CREATE POLICY "Users can view locations shared with them" ON location_shares
  FOR SELECT USING (auth.uid() = shared_with OR auth.uid() = shared_by);

CREATE POLICY "Users can share their location" ON location_shares
  FOR INSERT WITH CHECK (auth.uid() = shared_by);

CREATE POLICY "Users can update their own shares" ON location_shares
  FOR UPDATE 
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

CREATE POLICY "Users can delete their own shares" ON location_shares
  FOR DELETE USING (auth.uid() = shared_by);

-- =====================================================
-- 7. HELPER FUNCTIONS
-- =====================================================

-- Function to get active location share for a package
CREATE OR REPLACE FUNCTION get_active_location_share(p_package_id UUID, p_user_id UUID)
RETURNS TABLE (
  id UUID,
  latitude DECIMAL,
  longitude DECIMAL,
  address_text TEXT,
  maps_link TEXT,
  context TEXT,
  message TEXT,
  shared_at TIMESTAMPTZ,
  shared_by_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ls.id,
    ls.latitude,
    ls.longitude,
    ls.address_text,
    ls.maps_link,
    ls.context,
    ls.message,
    ls.shared_at,
    p.full_name as shared_by_name
  FROM location_shares ls
  JOIN profiles p ON p.id = ls.shared_by
  WHERE ls.package_id = p_package_id
    AND ls.shared_with = p_user_id
    AND ls.is_active = TRUE
    AND ls.expires_at > NOW()
  ORDER BY ls.shared_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create/update location share
CREATE OR REPLACE FUNCTION share_location(
  p_package_id UUID,
  p_shared_with UUID,
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_address_text TEXT DEFAULT NULL,
  p_context TEXT DEFAULT 'general',
  p_message TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_share_id UUID;
  v_maps_link TEXT;
  v_transfer_id UUID;
BEGIN
  -- Generate Google Maps link
  v_maps_link := 'https://www.google.com/maps?q=' || p_latitude || ',' || p_longitude;
  
  -- Get current transfer if exists
  SELECT id INTO v_transfer_id FROM vehicle_transfers 
  WHERE package_id = p_package_id 
  ORDER BY created_at DESC LIMIT 1;
  
  -- Deactivate any existing active shares for this package/user combo
  UPDATE location_shares 
  SET is_active = FALSE 
  WHERE package_id = p_package_id 
    AND shared_by = auth.uid() 
    AND shared_with = p_shared_with;
  
  -- Create new share
  INSERT INTO location_shares (
    package_id, transfer_id, shared_by, shared_with,
    latitude, longitude, address_text, maps_link,
    context, message
  ) VALUES (
    p_package_id, v_transfer_id, auth.uid(), p_shared_with,
    p_latitude, p_longitude, p_address_text, v_maps_link,
    p_context, p_message
  ) RETURNING id INTO v_share_id;
  
  RETURN v_share_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- LOGISTICS STATUS VALUES:
-- 'pending' - Bid accepted, awaiting scheduling
-- 'scheduled' - Appointment confirmed
-- 'vehicle_in_transit' - Car being picked up or dropped off
-- 'at_provider' - Vehicle at provider location
-- 'work_in_progress' - Service being performed
-- 'work_complete' - Service done, awaiting return
-- 'ready_for_return' - Provider ready to return vehicle
-- 'returning' - Vehicle in transit back to member
-- 'completed' - Vehicle returned, service complete
-- =====================================================

-- =====================================================
-- VEHICLE STATUS VALUES:
-- 'with_member' - Vehicle is with the member
-- 'in_transit_to_provider' - Being picked up or dropped off
-- 'at_provider' - Arrived at provider location
-- 'work_in_progress' - Service being performed
-- 'work_complete' - Work done, still at provider
-- 'ready_for_return' - Ready to go back
-- 'in_transit_to_member' - On the way back
-- 'returned' - Back with member
-- =====================================================
