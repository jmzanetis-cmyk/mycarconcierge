-- Developer API Keys Table (for Automotive AI API Product)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','pro','business')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','suspended')),
  calls_made BIGINT NOT NULL DEFAULT 0,
  calls_limit INTEGER NOT NULL DEFAULT 5000,
  last_used_at TIMESTAMPTZ,
  allowed_origins TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON developer_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON developer_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON developer_api_keys(status);

-- Monthly usage tracking for billing
CREATE TABLE IF NOT EXISTS api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES developer_api_keys(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(api_key_id, month_year, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_month ON api_key_usage(api_key_id, month_year);

ALTER TABLE developer_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own API keys" ON developer_api_keys;
CREATE POLICY "Users can manage their own API keys"
  ON developer_api_keys FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own usage" ON api_key_usage;
CREATE POLICY "Users can view their own usage"
  ON api_key_usage FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM developer_api_keys WHERE id = api_key_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role can manage api keys" ON developer_api_keys;
CREATE POLICY "Service role can manage api keys"
  ON developer_api_keys FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role can manage api usage" ON api_key_usage;
CREATE POLICY "Service role can manage api usage"
  ON api_key_usage FOR ALL
  TO service_role
  USING (true);
