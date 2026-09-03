-- ============================================================================
-- 20260903a — admin_team_members / admin_team_invites tables
--
-- Discovered during the admin-portal audit follow-up: netlify/functions/
-- admin-team.js and netlify/functions/admin-invite.js have both queried
-- these two tables since they were written, but no migration ever created
-- them — same class of bug as the registrations/insurance-documents storage
-- buckets found earlier (20260902b). admin-team.js's GET handlers were
-- masking this: they explicitly catch a "does not exist" error and return
-- an empty array, so the Team Management roster just silently showed
-- "no members" instead of erroring. POST /invites had no such guard and
-- would have hard-failed with a 500 the moment anyone tried to send one.
--
-- Auth model: admin-invite.js's invite-accept flow creates a real Supabase
-- Auth user (supabase.auth.admin.createUser) and links it via user_id —
-- NOT the password_hash-in-a-JSON-file scheme server.js's legacy
-- /api/admin/team-login uses. These tables follow the Supabase Auth model,
-- since that's what the one already-written accept flow expects. Fixing
-- team-login itself (Tier 4, separate work) should point it at these
-- tables + Supabase Auth rather than the old JSON file.
--
-- RLS is enabled with no policies — every access path here goes through a
-- Netlify function using the service-role key (utils.createSupabaseClient),
-- which bypasses RLS entirely. No anon/authenticated client should ever
-- reach these tables directly; the empty policy set is a safety net, not
-- the access-control mechanism.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_team_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email        text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role         text NOT NULL CHECK (role IN ('super_admin', 'crm_manager', 'marketing', 'operations', 'finance', 'support')),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'inactive')),
  last_login   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_team_members_user_id_idx ON admin_team_members(user_id);

ALTER TABLE admin_team_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_team_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL UNIQUE,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('super_admin', 'crm_manager', 'marketing', 'operations', 'finance', 'support')),
  invited_by  text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_team_invites_email_idx ON admin_team_invites(email);
CREATE INDEX IF NOT EXISTS admin_team_invites_status_idx ON admin_team_invites(status);

ALTER TABLE admin_team_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- End of 20260903a_admin_team_members_invites.sql
-- ============================================================================
