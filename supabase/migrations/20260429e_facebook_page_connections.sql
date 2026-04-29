-- Task #243 — Facebook Page connection (admin OAuth picker)
--
-- Records which Facebook Page an MCC admin has selected as the official
-- publishing destination via the admin "Connect Facebook Page" flow.
--
-- The flow itself only requests Facebook's `pages_show_list` scope so we
-- can pass App Review for it. Persisting only the chosen Page ID + name
-- (no access token) is intentional: actually posting *to* the Page
-- requires the separate `pages_manage_posts` scope, which is a follow-up
-- App Review submission. For now this row is a record of intent + a
-- machine-readable destination that future tasks can plug into.

CREATE TABLE IF NOT EXISTS facebook_page_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  -- Nullable so an admin authenticated via the env-password fallback
  -- (no auth.users row) can still record a selection. When the admin is
  -- a real team-session user, this is their auth.users UUID.
  connected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_by_email TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Singleton: only one active connection at a time. The "select a new
-- Page" flow deletes any existing row before inserting, but a unique
-- partial index over a constant TRUE catches any race or accidental
-- double-insert at the database layer.
CREATE UNIQUE INDEX IF NOT EXISTS facebook_page_connections_singleton
  ON facebook_page_connections ((TRUE));

CREATE INDEX IF NOT EXISTS facebook_page_connections_user_idx
  ON facebook_page_connections (connected_by_user_id);

ALTER TABLE facebook_page_connections ENABLE ROW LEVEL SECURITY;

-- No public/auth-user policies — only the service role (used by the
-- /api/admin/facebook/* endpoints in www/server.js) reads/writes this
-- table. Service role bypasses RLS.
