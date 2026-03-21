-- Login Activity Log Migration
-- Tracks member login history for security monitoring

CREATE TABLE IF NOT EXISTS login_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_type VARCHAR(20) CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')),
  browser VARCHAR(100),
  os VARCHAR(100),
  location_city VARCHAR(100),
  location_country VARCHAR(100),
  is_successful BOOLEAN DEFAULT true,
  failure_reason VARCHAR(255),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  reported_suspicious BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_activity_user_id ON login_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_login_at ON login_activity(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_activity_user_login ON login_activity(user_id, login_at DESC);

ALTER TABLE login_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own login activity" ON login_activity;
CREATE POLICY "Users can view their own login activity"
  ON login_activity
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own login activity" ON login_activity;
CREATE POLICY "Users can update their own login activity"
  ON login_activity
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can insert login activity" ON login_activity;
CREATE POLICY "Service role can insert login activity"
  ON login_activity
  FOR INSERT
  WITH CHECK (true);
