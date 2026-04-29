-- Task #186 — Wire up Facebook's account-deletion callback
--
-- 1. Add facebook_user_id column to profiles so we can map a Facebook
--    app-scoped user_id (from Facebook's signed_request webhook) back to
--    the matching MCC user in O(1) instead of scanning auth.identities
--    every time a deletion ping arrives.
-- 2. Create fb_data_deletion_requests so we have an audit trail of every
--    deletion request Facebook pings us with, including the short opaque
--    confirmation_code we hand back in the response. Members (or Facebook
--    review staff) can plug that code into /data-deletion-status.html to
--    see whether the deletion is pending, completed, or never happened.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS facebook_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_facebook_user_id_key
  ON profiles (facebook_user_id)
  WHERE facebook_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fb_data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_code TEXT NOT NULL UNIQUE,
  facebook_user_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'not_found', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS fb_data_deletion_requests_facebook_user_id_idx
  ON fb_data_deletion_requests (facebook_user_id);

CREATE INDEX IF NOT EXISTS fb_data_deletion_requests_status_idx
  ON fb_data_deletion_requests (status);

ALTER TABLE fb_data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- No public/auth-user policies — only the service role (used by the
-- /api/auth/facebook/data-deletion endpoint and the matching Netlify
-- function) reads/writes this table. Service role bypasses RLS.
