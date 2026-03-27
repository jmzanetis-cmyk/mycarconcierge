-- White-label Tenant User Membership Tracking
-- Tracks which users belong to which white-label tenant instance.
-- Used for seat limit enforcement per plan.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS white_label_tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES white_label_tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'provider', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wl_tenant_users_tenant ON white_label_tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wl_tenant_users_user ON white_label_tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_wl_tenant_users_role ON white_label_tenant_users(role);

ALTER TABLE white_label_tenant_users ENABLE ROW LEVEL SECURITY;

-- Tenant owners and admins can view their roster
DROP POLICY IF EXISTS "Tenant owners can view roster" ON white_label_tenant_users;
CREATE POLICY "Tenant owners can view roster"
  ON white_label_tenant_users FOR SELECT
  USING (
    -- The user is already in the roster
    user_id = auth.uid()
    OR
    -- Or the user is an owner/admin of the tenant
    EXISTS (
      SELECT 1 FROM white_label_tenant_users wtu
      WHERE wtu.tenant_id = white_label_tenant_users.tenant_id
        AND wtu.user_id = auth.uid()
        AND wtu.role IN ('owner', 'admin')
    )
    OR
    -- MCC platform admins
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Service role can manage all (used by server.js with SUPABASE_SERVICE_ROLE_KEY)
DROP POLICY IF EXISTS "Service role can manage tenant users" ON white_label_tenant_users;
CREATE POLICY "Service role can manage tenant users"
  ON white_label_tenant_users FOR ALL
  TO service_role
  USING (true);
