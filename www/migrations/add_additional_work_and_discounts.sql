-- Migration: Add Additional Work Requests and Provider Discounts tables
-- Run this in your Supabase SQL Editor

-- Create additional_work_requests table
CREATE TABLE IF NOT EXISTS additional_work_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES maintenance_packages(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  photos TEXT[],
  estimated_cost DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  member_response_note TEXT,
  payment_intent_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create provider_discounts table
CREATE TABLE IF NOT EXISTS provider_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES maintenance_packages(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  discount_amount DECIMAL(10,2) NOT NULL,
  discount_type VARCHAR(20) DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage')),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'declined', 'applied')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_additional_work_package ON additional_work_requests(package_id);
CREATE INDEX IF NOT EXISTS idx_additional_work_provider ON additional_work_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_additional_work_status ON additional_work_requests(status);
CREATE INDEX IF NOT EXISTS idx_discounts_package ON provider_discounts(package_id);
CREATE INDEX IF NOT EXISTS idx_discounts_provider ON provider_discounts(provider_id);

-- Enable RLS
ALTER TABLE additional_work_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_discounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for additional_work_requests
CREATE POLICY "providers_create_additional_work" ON additional_work_requests
  FOR INSERT TO authenticated
  WITH CHECK (provider_id = auth.uid());

CREATE POLICY "providers_view_own_additional_work" ON additional_work_requests
  FOR SELECT TO authenticated
  USING (provider_id = auth.uid());

CREATE POLICY "members_view_package_additional_work" ON additional_work_requests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM maintenance_packages mp 
    WHERE mp.id = package_id AND mp.member_id = auth.uid()
  ));

CREATE POLICY "members_update_package_additional_work" ON additional_work_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM maintenance_packages mp 
    WHERE mp.id = package_id AND mp.member_id = auth.uid()
  ));

CREATE POLICY "providers_update_own_additional_work" ON additional_work_requests
  FOR UPDATE TO authenticated
  USING (provider_id = auth.uid());

-- RLS policies for provider_discounts
CREATE POLICY "providers_create_discounts" ON provider_discounts
  FOR INSERT TO authenticated
  WITH CHECK (provider_id = auth.uid());

CREATE POLICY "providers_view_own_discounts" ON provider_discounts
  FOR SELECT TO authenticated
  USING (provider_id = auth.uid());

CREATE POLICY "members_view_package_discounts" ON provider_discounts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM maintenance_packages mp 
    WHERE mp.id = package_id AND mp.member_id = auth.uid()
  ));

CREATE POLICY "members_update_package_discounts" ON provider_discounts
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM maintenance_packages mp 
    WHERE mp.id = package_id AND mp.member_id = auth.uid()
  ));

CREATE POLICY "providers_update_own_discounts" ON provider_discounts
  FOR UPDATE TO authenticated
  USING (provider_id = auth.uid());
