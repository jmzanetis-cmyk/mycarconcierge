-- Developer API Keys table
--
-- Stores API keys issued to members with an active ai_api SaaS subscription.
-- All writes go through netlify/functions/developer-api.js (service-role).
-- Raw keys are never stored — only a SHA-256 hash.  The prefix (first 12 chars)
-- is stored for display.  RLS allows owners to read and soft-delete their own
-- rows; INSERT is service-role only.

CREATE TABLE developer_api_keys (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  key_hash      text        NOT NULL UNIQUE,
  key_prefix    text        NOT NULL,
  plan          text        NOT NULL DEFAULT 'starter',
  calls_made    integer     NOT NULL DEFAULT 0,
  calls_limit   integer     NOT NULL DEFAULT 1000,
  last_used_at  timestamptz,
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'revoked')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE developer_api_keys ENABLE ROW LEVEL SECURITY;

-- Owners can read their own keys (hashes excluded — not in SELECT anyway)
CREATE POLICY dak_owner_select ON developer_api_keys
  FOR SELECT USING (user_id = auth.uid());

-- Owners can soft-delete via the function (function uses service role,
-- so this policy is defence-in-depth for any future client-side path)
CREATE POLICY dak_owner_delete ON developer_api_keys
  FOR DELETE USING (user_id = auth.uid());

-- No INSERT or UPDATE policy — all writes go through service-role function.

CREATE INDEX dak_user_id_idx ON developer_api_keys (user_id, status);
