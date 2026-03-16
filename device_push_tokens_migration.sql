-- Migration: device_push_tokens
-- Stores FCM device tokens for native iOS/Android push notifications via Capacitor

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS device_push_tokens_member_id_idx ON device_push_tokens (member_id);
CREATE INDEX IF NOT EXISTS device_push_tokens_active_idx ON device_push_tokens (member_id, active) WHERE active = true;

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage their own device tokens"
  ON device_push_tokens
  FOR ALL
  USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Service role can read all device tokens"
  ON device_push_tokens
  FOR SELECT
  USING (auth.role() = 'service_role');
