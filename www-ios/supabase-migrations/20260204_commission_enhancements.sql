-- Migration: Commission Payment Enhancements
-- Date: 2026-02-04
-- Features: Rate history tracking, payout settings, payout fees

-- 1. Add commission_rate column to member_founder_profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'member_founder_profiles' AND column_name = 'commission_rate') THEN
    ALTER TABLE member_founder_profiles ADD COLUMN commission_rate NUMERIC DEFAULT 0.50;
  END IF;
END $$;

-- 2. Create commission rate history table
CREATE TABLE IF NOT EXISTS commission_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id UUID NOT NULL REFERENCES member_founder_profiles(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  admin_email TEXT,
  old_rate NUMERIC NOT NULL,
  new_rate NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_rate_history_founder ON commission_rate_history(founder_id);
CREATE INDEX IF NOT EXISTS idx_commission_rate_history_created ON commission_rate_history(created_at DESC);

-- 3. Create payout_settings table for configurable thresholds and fees
CREATE TABLE IF NOT EXISTS payout_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value NUMERIC NOT NULL,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default payout settings
INSERT INTO payout_settings (setting_key, setting_value, description) VALUES
  ('min_payout_threshold', 10.00, 'Minimum balance required for payout'),
  ('instant_payout_fee_percent', 1.00, 'Instant payout fee percentage'),
  ('instant_payout_fee_min', 0.50, 'Minimum instant payout fee'),
  ('instant_payout_fee_max', 10.00, 'Maximum instant payout fee'),
  ('weekly_payout_fee', 0.00, 'Weekly payout fee (free)')
ON CONFLICT (setting_key) DO NOTHING;

-- 4. Add fee_amount and net_amount columns to founder_payouts if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'founder_payouts' AND column_name = 'fee_amount') THEN
    ALTER TABLE founder_payouts ADD COLUMN fee_amount NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'founder_payouts' AND column_name = 'net_amount') THEN
    ALTER TABLE founder_payouts ADD COLUMN net_amount NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'founder_payouts' AND column_name = 'payout_type') THEN
    ALTER TABLE founder_payouts ADD COLUMN payout_type TEXT DEFAULT 'weekly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'founder_payouts' AND column_name = 'receipt_url') THEN
    ALTER TABLE founder_payouts ADD COLUMN receipt_url TEXT;
  END IF;
END $$;

-- 5. Enable RLS on new tables
ALTER TABLE commission_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_settings ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for commission_rate_history
DROP POLICY IF EXISTS "Admins can view commission rate history" ON commission_rate_history;
CREATE POLICY "Admins can view commission rate history" ON commission_rate_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert commission rate history" ON commission_rate_history;
CREATE POLICY "Admins can insert commission rate history" ON commission_rate_history
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access to commission rate history" ON commission_rate_history;
CREATE POLICY "Service role full access to commission rate history" ON commission_rate_history
  FOR ALL USING (true) WITH CHECK (true);

-- 7. RLS Policies for payout_settings
DROP POLICY IF EXISTS "Anyone can view payout settings" ON payout_settings;
CREATE POLICY "Anyone can view payout settings" ON payout_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can update payout settings" ON payout_settings;
CREATE POLICY "Admins can update payout settings" ON payout_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access to payout settings" ON payout_settings;
CREATE POLICY "Service role full access to payout settings" ON payout_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Done!
