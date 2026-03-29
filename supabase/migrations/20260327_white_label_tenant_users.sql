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

-- SECURITY DEFINER helper to check admin/owner role WITHOUT triggering recursive policy evaluation.
-- This function runs as the definer (postgres) and bypasses RLS, preventing infinite recursion
-- when used inside a policy on the same table.
CREATE OR REPLACE FUNCTION wl_is_tenant_admin(p_tenant_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM white_label_tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin')
  );
$$;

-- Users can see their own membership row, OR rows in any tenant where they are owner/admin.
-- Uses the SECURITY DEFINER helper to break potential recursive policy evaluation.
DROP POLICY IF EXISTS "Tenant owners can view roster" ON white_label_tenant_users;
CREATE POLICY "Tenant owners can view roster"
  ON white_label_tenant_users FOR SELECT
  USING (
    user_id = auth.uid()
    OR wl_is_tenant_admin(tenant_id, auth.uid())
    OR EXISTS (
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

-- Users can insert their own membership (self-service join — role enforced at API layer)
DROP POLICY IF EXISTS "Users can join tenant" ON white_label_tenant_users;
CREATE POLICY "Users can join tenant"
  ON white_label_tenant_users FOR INSERT
  WITH CHECK (user_id = auth.uid() AND role IN ('member', 'provider'));
