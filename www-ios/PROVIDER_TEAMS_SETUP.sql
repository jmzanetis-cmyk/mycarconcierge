-- Provider Teams Migration
-- Run this in Supabase SQL Editor to enable multi-user provider accounts

-- =====================================================
-- 0. Create helper function is_admin() if it doesn't exist
-- =====================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 1. Create provider_team_members table
-- =====================================================
CREATE TABLE IF NOT EXISTS provider_team_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')) DEFAULT 'staff',
    status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'disabled')) DEFAULT 'active',
    permissions JSONB DEFAULT '{}',
    invited_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, user_id)
);

CREATE INDEX idx_provider_team_provider ON provider_team_members(provider_id);
CREATE INDEX idx_provider_team_user ON provider_team_members(user_id);
CREATE INDEX idx_provider_team_status ON provider_team_members(status);

-- =====================================================
-- 2. Create provider_invitations table
-- =====================================================
CREATE TABLE IF NOT EXISTS provider_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')) DEFAULT 'staff',
    token TEXT NOT NULL UNIQUE,
    invited_by UUID NOT NULL REFERENCES profiles(id),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_provider_invitations_token ON provider_invitations(token);
CREATE INDEX idx_provider_invitations_email ON provider_invitations(email);
CREATE INDEX idx_provider_invitations_provider ON provider_invitations(provider_id);

-- =====================================================
-- 3. Enable RLS on both tables
-- =====================================================
ALTER TABLE provider_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. RLS Policies for provider_team_members
-- =====================================================

-- Helper function to check if user is team admin/owner for a provider
CREATE OR REPLACE FUNCTION is_team_admin(p_provider_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM provider_team_members
        WHERE provider_id = p_provider_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is team member
CREATE OR REPLACE FUNCTION is_team_member(p_provider_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM provider_team_members
        WHERE provider_id = p_provider_id
        AND user_id = auth.uid()
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SELECT: Team members can view their team
CREATE POLICY "Team members can view their team"
ON provider_team_members FOR SELECT
USING (
    is_team_member(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
);

-- INSERT: Only admins/owners can add team members
CREATE POLICY "Admins can add team members"
ON provider_team_members FOR INSERT
WITH CHECK (
    is_team_admin(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
);

-- UPDATE: Only admins/owners can update team members
CREATE POLICY "Admins can update team members"
ON provider_team_members FOR UPDATE
USING (
    is_team_admin(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
)
WITH CHECK (
    is_team_admin(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
);

-- DELETE: Only admins/owners can remove team members
CREATE POLICY "Admins can remove team members"
ON provider_team_members FOR DELETE
USING (
    is_team_admin(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
);

-- =====================================================
-- 5. RLS Policies for provider_invitations
-- =====================================================

-- SELECT: Team admins can view invitations, anyone with valid token can view their invite
CREATE POLICY "Team admins can view invitations"
ON provider_invitations FOR SELECT
USING (
    is_team_admin(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
);

-- INSERT: Only admins/owners can create invitations
CREATE POLICY "Admins can create invitations"
ON provider_invitations FOR INSERT
WITH CHECK (
    is_team_admin(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
);

-- UPDATE: For accepting invitations (via server with service role)
CREATE POLICY "Admins can update invitations"
ON provider_invitations FOR UPDATE
USING (
    is_team_admin(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
);

-- DELETE: Only admins/owners can cancel invitations
CREATE POLICY "Admins can cancel invitations"
ON provider_invitations FOR DELETE
USING (
    is_team_admin(provider_id)
    OR provider_id = auth.uid()
    OR is_admin()
);

-- =====================================================
-- 6. Function to initialize owner as team member
-- =====================================================
CREATE OR REPLACE FUNCTION initialize_provider_team_owner(p_provider_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO provider_team_members (provider_id, user_id, role, status)
    VALUES (p_provider_id, p_provider_id, 'owner', 'active')
    ON CONFLICT (provider_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 7. Function to accept invitation
-- =====================================================
CREATE OR REPLACE FUNCTION accept_team_invitation(
    p_token TEXT,
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_invitation provider_invitations%ROWTYPE;
    v_team_member_id UUID;
BEGIN
    -- Get the invitation
    SELECT * INTO v_invitation
    FROM provider_invitations
    WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
    END IF;
    
    -- Create team member
    INSERT INTO provider_team_members (provider_id, user_id, role, status, invited_by)
    VALUES (v_invitation.provider_id, p_user_id, v_invitation.role, 'active', v_invitation.invited_by)
    ON CONFLICT (provider_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = 'active',
        updated_at = NOW()
    RETURNING id INTO v_team_member_id;
    
    -- Mark invitation as accepted
    UPDATE provider_invitations
    SET accepted_at = NOW()
    WHERE id = v_invitation.id;
    
    RETURN jsonb_build_object(
        'success', true,
        'team_member_id', v_team_member_id,
        'provider_id', v_invitation.provider_id,
        'role', v_invitation.role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 8. Function to get team for a provider
-- =====================================================
CREATE OR REPLACE FUNCTION get_provider_team(p_provider_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    role TEXT,
    status TEXT,
    full_name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ptm.id,
        ptm.user_id,
        ptm.role,
        ptm.status,
        p.full_name,
        p.email,
        ptm.created_at
    FROM provider_team_members ptm
    JOIN profiles p ON p.id = ptm.user_id
    WHERE ptm.provider_id = p_provider_id
    ORDER BY 
        CASE ptm.role 
            WHEN 'owner' THEN 1 
            WHEN 'admin' THEN 2 
            ELSE 3 
        END,
        ptm.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 9. Function to get pending invitations
-- =====================================================
CREATE OR REPLACE FUNCTION get_pending_invitations(p_provider_id UUID)
RETURNS TABLE (
    id UUID,
    email TEXT,
    role TEXT,
    invited_by_name TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pi.id,
        pi.email,
        pi.role,
        p.full_name as invited_by_name,
        pi.expires_at,
        pi.created_at
    FROM provider_invitations pi
    JOIN profiles p ON p.id = pi.invited_by
    WHERE pi.provider_id = p_provider_id
    AND pi.accepted_at IS NULL
    AND pi.expires_at > NOW()
    ORDER BY pi.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 10. Add provider_id column to profiles for team access
-- =====================================================
-- This allows team members to access provider data
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_provider_id UUID REFERENCES profiles(id);

COMMENT ON TABLE provider_team_members IS 'Links multiple users to a provider account with role-based access';
COMMENT ON TABLE provider_invitations IS 'Pending invitations for team members';
COMMENT ON COLUMN profiles.team_provider_id IS 'If set, this user is a team member of the specified provider';
