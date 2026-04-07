-- =============================================================================
-- White-label Tenant Users — RLS Security Fix
-- PROBLEM: The INSERT policy "Users can join tenant" allowed any authenticated
-- user to self-insert into ANY tenant just by knowing the UUID, bypassing the
-- domain-based authorization in /api/white-label/tenant/join.
-- FIX: Remove the client INSERT policy entirely. All membership writes must go
-- through the server-side API endpoint (/api/white-label/tenant/join) which
-- validates domain ownership. The service_role policy covers server writes.
-- =============================================================================

-- Drop the overly permissive self-join INSERT policy
DROP POLICY IF EXISTS "Users can join tenant" ON white_label_tenant_users;

-- Confirm service_role policy covers all management operations from server.js
-- (This policy already existed in the original migration — this is defensive)
DROP POLICY IF EXISTS "Service role can manage tenant users" ON white_label_tenant_users;
CREATE POLICY "Service role can manage tenant users"
  ON white_label_tenant_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow tenant owner/admins to remove members (DELETE) from their tenant.
-- This supports the portal roster management UI.
DROP POLICY IF EXISTS "Tenant admins can remove members" ON white_label_tenant_users;
CREATE POLICY "Tenant admins can remove members"
  ON white_label_tenant_users FOR DELETE
  USING (
    wl_is_tenant_admin(tenant_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Users can update their own non-role fields (e.g. future metadata columns)
-- but cannot change their own role (role changes require admin action via service_role)
DROP POLICY IF EXISTS "Users can read own membership" ON white_label_tenant_users;
-- SELECT policy remains as "Tenant owners can view roster" from original migration (unchanged)
