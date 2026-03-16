-- =====================================================
-- MY CAR CONCIERGE - PROVIDER AVAILABILITY & BOOKING
-- Run this script in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. PROVIDER WORKING HOURS TABLE
-- Weekly recurring schedule (Sun=0 through Sat=6)
-- =====================================================
CREATE TABLE IF NOT EXISTS provider_working_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  bay_capacity INTEGER DEFAULT 1 CHECK (bay_capacity >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, day_of_week)
);

-- =====================================================
-- 2. PROVIDER BLOCKED TIME TABLE
-- Non-MCC commitments, lunch, personal blocks
-- =====================================================
CREATE TABLE IF NOT EXISTS provider_blocked_time (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reason TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_day_of_week INTEGER CHECK (recurring_day_of_week >= 0 AND recurring_day_of_week <= 6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. SLOT BOOKINGS TABLE
-- Member bookings linked to maintenance packages
-- =====================================================
CREATE TABLE IF NOT EXISTS slot_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  member_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  package_id UUID REFERENCES maintenance_packages(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL,
  service_location TEXT DEFAULT 'on_site' CHECK (service_location IN ('on_site', 'mobile')),
  status TEXT DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled', 'no_show')),
  member_notes TEXT,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  cancelled_by TEXT CHECK (cancelled_by IN ('member', 'provider', 'system')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_provider_working_hours_provider ON provider_working_hours(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_working_hours_day ON provider_working_hours(provider_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_provider_blocked_time_provider ON provider_blocked_time(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_blocked_time_date ON provider_blocked_time(provider_id, block_date);

CREATE INDEX IF NOT EXISTS idx_slot_bookings_provider ON slot_bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_slot_bookings_provider_date ON slot_bookings(provider_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_slot_bookings_member ON slot_bookings(member_id);
CREATE INDEX IF NOT EXISTS idx_slot_bookings_package ON slot_bookings(package_id);
CREATE INDEX IF NOT EXISTS idx_slot_bookings_status ON slot_bookings(status);

-- =====================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- =====================================================

ALTER TABLE provider_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_blocked_time ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_bookings ENABLE ROW LEVEL SECURITY;

-- PROVIDER WORKING HOURS POLICIES
CREATE POLICY "Providers can manage their own working hours" ON provider_working_hours
  FOR ALL USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Anyone can view provider working hours" ON provider_working_hours
  FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage all working hours" ON provider_working_hours
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- PROVIDER BLOCKED TIME POLICIES
CREATE POLICY "Providers can manage their own blocked time" ON provider_blocked_time
  FOR ALL USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Members can view provider blocked time for booking" ON provider_blocked_time
  FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage all blocked time" ON provider_blocked_time
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- SLOT BOOKINGS POLICIES
CREATE POLICY "Users can view their own bookings" ON slot_bookings
  FOR SELECT USING (auth.uid() = member_id OR auth.uid() = provider_id);

CREATE POLICY "Members can create bookings" ON slot_bookings
  FOR INSERT WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Parties can update their bookings" ON slot_bookings
  FOR UPDATE
  USING (auth.uid() = member_id OR auth.uid() = provider_id)
  WITH CHECK (auth.uid() = member_id OR auth.uid() = provider_id);

CREATE POLICY "Admins can manage all bookings" ON slot_bookings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
