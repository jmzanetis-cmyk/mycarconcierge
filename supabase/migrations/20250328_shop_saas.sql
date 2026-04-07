-- Task #89: Provider Shop SaaS - migration
-- Run this in the Supabase SQL editor

-- 1. Add marketplace_visible flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shop_only_mode BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shop_onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shop_onboarding_steps JSONB DEFAULT '{}';

-- 5. Business hours on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT NULL;

-- 2. Walk-in customer lookup table (per-shop phone-based history)
CREATE TABLE IF NOT EXISTS walkin_customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  vehicles JSONB DEFAULT '[]',
  visit_count INT DEFAULT 1,
  last_visit_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_walkin_provider_phone ON walkin_customers (provider_id, phone);

-- RLS for walkin_customers
ALTER TABLE walkin_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can manage own walkin customers" ON walkin_customers
  FOR ALL USING (provider_id = auth.uid());

-- 3. Shop booking requests from public profile / widget
CREATE TABLE IF NOT EXISTS shop_booking_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  provider_slug TEXT,
  requester_name TEXT NOT NULL,
  requester_phone TEXT NOT NULL,
  requester_email TEXT,
  vehicle_description TEXT,
  service_type TEXT,
  details TEXT,
  source TEXT DEFAULT 'profile',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_booking_requests_provider ON shop_booking_requests (provider_id);
CREATE INDEX IF NOT EXISTS idx_shop_booking_requests_slug ON shop_booking_requests (provider_slug);

ALTER TABLE shop_booking_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can view own booking requests" ON shop_booking_requests
  FOR SELECT USING (provider_id = auth.uid());

CREATE POLICY "Provider can update own booking requests" ON shop_booking_requests
  FOR UPDATE USING (provider_id = auth.uid());

CREATE POLICY "Public can insert booking requests" ON shop_booking_requests
  FOR INSERT WITH CHECK (true);

-- 4. Shop onboarding checklist tracking (extend shop_onboarding_steps in profiles)
-- No separate table needed - stored as JSONB on profiles

-- Grant usage on new tables
GRANT ALL ON walkin_customers TO authenticated;
GRANT INSERT ON shop_booking_requests TO anon;
GRANT ALL ON shop_booking_requests TO authenticated;
