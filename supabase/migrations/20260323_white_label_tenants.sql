-- White-label Tenants Table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS white_label_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  subdomain TEXT UNIQUE,
  brand_name TEXT NOT NULL,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#C9A227',
  accent_color TEXT DEFAULT '#2CC4B4',
  bg_color TEXT DEFAULT '#12161c',
  support_email TEXT,
  support_phone TEXT,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','pro','business')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','canceled','pending')),
  stripe_subscription_id TEXT,
  owner_user_id UUID REFERENCES auth.users(id),
  max_members INTEGER DEFAULT 500,
  max_providers INTEGER DEFAULT 50,
  features JSONB DEFAULT '{}',
  custom_css TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_white_label_tenants_domain ON white_label_tenants(domain);
CREATE INDEX IF NOT EXISTS idx_white_label_tenants_subdomain ON white_label_tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_white_label_tenants_status ON white_label_tenants(status);

ALTER TABLE white_label_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage white label tenants" ON white_label_tenants;
CREATE POLICY "Admins can manage white label tenants"
  ON white_label_tenants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Tenant owners can view their tenant" ON white_label_tenants;
CREATE POLICY "Tenant owners can view their tenant"
  ON white_label_tenants FOR SELECT
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage white label tenants" ON white_label_tenants;
CREATE POLICY "Service role can manage white label tenants"
  ON white_label_tenants FOR ALL
  TO service_role
  USING (true);
