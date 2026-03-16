-- Migration: Milestone Bonus Tracking System
-- Date: 2026-02-04
-- Features: Track platform revenue milestones, bonus reserve, and Chris Agrapidis bonuses

-- 1. Create milestone_thresholds table (defines the milestone levels)
CREATE TABLE IF NOT EXISTS milestone_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_amount NUMERIC NOT NULL,
  bonus_amount NUMERIC NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert the defined milestones from the agreement
INSERT INTO milestone_thresholds (threshold_amount, bonus_amount, description) VALUES
  (25000, 2500, '$25K platform sales milestone'),
  (50000, 5000, '$50K platform sales milestone'),
  (100000, 12500, '$100K platform sales milestone'),
  (250000, 30000, '$250K platform sales milestone'),
  (500000, 60000, '$500K platform sales milestone'),
  (1000000, 125000, '$1M platform sales milestone')
ON CONFLICT DO NOTHING;

-- 2. Create milestone_achievements table (tracks which milestones have been paid)
CREATE TABLE IF NOT EXISTS milestone_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID REFERENCES milestone_thresholds(id),
  founder_id UUID REFERENCES member_founder_profiles(id),
  threshold_amount NUMERIC NOT NULL,
  bonus_amount NUMERIC NOT NULL,
  platform_revenue_at_achievement NUMERIC NOT NULL,
  evaluation_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  paid_by UUID,
  stripe_transfer_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestone_achievements_founder ON milestone_achievements(founder_id);
CREATE INDEX IF NOT EXISTS idx_milestone_achievements_status ON milestone_achievements(status);

-- 3. Create bonus_reserve table (tracks monthly reserve accruals)
CREATE TABLE IF NOT EXISTS bonus_reserve (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year TEXT NOT NULL,
  bid_pack_revenue NUMERIC NOT NULL DEFAULT 0,
  reserve_amount NUMERIC NOT NULL DEFAULT 0,
  reserve_rate NUMERIC NOT NULL DEFAULT 0.15,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month_year)
);

CREATE INDEX IF NOT EXISTS idx_bonus_reserve_month ON bonus_reserve(month_year);

-- 4. Create bonus_reserve_transactions table (tracks deposits and withdrawals)
CREATE TABLE IF NOT EXISTS bonus_reserve_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('accrual', 'payout', 'adjustment')),
  amount NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  created_by UUID,
  stripe_treasury_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add stripe_treasury_id column if table already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bonus_reserve_transactions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bonus_reserve_transactions' AND column_name = 'stripe_treasury_id') THEN
      ALTER TABLE bonus_reserve_transactions ADD COLUMN stripe_treasury_id TEXT;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bonus_reserve_transactions_type ON bonus_reserve_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_bonus_reserve_transactions_created ON bonus_reserve_transactions(created_at DESC);

-- 5. Create platform_revenue_tracking table (cumulative revenue for milestone tracking)
CREATE TABLE IF NOT EXISTS platform_revenue_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_key TEXT NOT NULL DEFAULT 'main',
  total_bid_pack_revenue NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  UNIQUE(tracking_key)
);

-- Insert initial tracking row using upsert
INSERT INTO platform_revenue_tracking (tracking_key, total_bid_pack_revenue, notes)
VALUES ('main', 0, 'Initial tracking record')
ON CONFLICT (tracking_key) DO NOTHING;

-- 5b. Create anniversary_notifications table (tracks which reminders have been sent)
CREATE TABLE IF NOT EXISTS anniversary_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES founding_provider_partners(id),
  partner_name TEXT NOT NULL,
  notification_year INTEGER NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'anniversary_reminder',
  sent_at TIMESTAMPTZ DEFAULT now(),
  emails_sent INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_name, notification_year, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_anniversary_notifications_year ON anniversary_notifications(notification_year);
CREATE INDEX IF NOT EXISTS idx_anniversary_notifications_partner ON anniversary_notifications(partner_name);

-- 6. Create founding_provider_partners table (for special partner agreements like Chris)
CREATE TABLE IF NOT EXISTS founding_provider_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  provider_id UUID,
  full_name TEXT NOT NULL UNIQUE,
  email TEXT,
  agreement_date DATE NOT NULL,
  anniversary_date DATE NOT NULL,
  commission_rate NUMERIC DEFAULT 0.90,
  milestone_bonus_eligible BOOLEAN DEFAULT true,
  zero_fees BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Note: Chris Agrapidis will be inserted when he signs the agreement
-- The anniversary_date will be set to his actual signing date

-- 7. Enable RLS on new tables
ALTER TABLE milestone_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_reserve ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_reserve_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_revenue_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE founding_provider_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE anniversary_notifications ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies - Admins can manage everything
DROP POLICY IF EXISTS "Admins full access milestone_thresholds" ON milestone_thresholds;
CREATE POLICY "Admins full access milestone_thresholds" ON milestone_thresholds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access milestone_thresholds" ON milestone_thresholds;
CREATE POLICY "Service role full access milestone_thresholds" ON milestone_thresholds
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access milestone_achievements" ON milestone_achievements;
CREATE POLICY "Admins full access milestone_achievements" ON milestone_achievements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access milestone_achievements" ON milestone_achievements;
CREATE POLICY "Service role full access milestone_achievements" ON milestone_achievements
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access bonus_reserve" ON bonus_reserve;
CREATE POLICY "Admins full access bonus_reserve" ON bonus_reserve
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access bonus_reserve" ON bonus_reserve;
CREATE POLICY "Service role full access bonus_reserve" ON bonus_reserve
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access bonus_reserve_transactions" ON bonus_reserve_transactions;
CREATE POLICY "Admins full access bonus_reserve_transactions" ON bonus_reserve_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access bonus_reserve_transactions" ON bonus_reserve_transactions;
CREATE POLICY "Service role full access bonus_reserve_transactions" ON bonus_reserve_transactions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access platform_revenue_tracking" ON platform_revenue_tracking;
CREATE POLICY "Admins full access platform_revenue_tracking" ON platform_revenue_tracking
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access platform_revenue_tracking" ON platform_revenue_tracking;
CREATE POLICY "Service role full access platform_revenue_tracking" ON platform_revenue_tracking
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access founding_provider_partners" ON founding_provider_partners;
CREATE POLICY "Admins full access founding_provider_partners" ON founding_provider_partners
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access founding_provider_partners" ON founding_provider_partners;
CREATE POLICY "Service role full access founding_provider_partners" ON founding_provider_partners
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins full access anniversary_notifications" ON anniversary_notifications;
CREATE POLICY "Admins full access anniversary_notifications" ON anniversary_notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role full access anniversary_notifications" ON anniversary_notifications;
CREATE POLICY "Service role full access anniversary_notifications" ON anniversary_notifications
  FOR ALL USING (true) WITH CHECK (true);

-- 9. Create atomic upsert functions for race-condition-free updates

-- Function to atomically increment platform revenue tracking
CREATE OR REPLACE FUNCTION upsert_platform_revenue(
  p_amount NUMERIC
)
RETURNS TABLE (new_total NUMERIC) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO platform_revenue_tracking (tracking_key, total_bid_pack_revenue, last_updated, notes)
  VALUES ('main', p_amount, now(), 'Updated via bid pack purchase')
  ON CONFLICT (tracking_key) 
  DO UPDATE SET 
    total_bid_pack_revenue = platform_revenue_tracking.total_bid_pack_revenue + EXCLUDED.total_bid_pack_revenue,
    last_updated = now()
  RETURNING total_bid_pack_revenue AS new_total;
END;
$$ LANGUAGE plpgsql;

-- Function to atomically upsert bonus reserve
CREATE OR REPLACE FUNCTION upsert_bonus_reserve(
  p_month_year TEXT,
  p_bid_pack_amount NUMERIC,
  p_reserve_amount NUMERIC
)
RETURNS TABLE (new_bid_pack_revenue NUMERIC, new_reserve_amount NUMERIC) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO bonus_reserve (month_year, bid_pack_revenue, reserve_amount, reserve_rate, notes, updated_at)
  VALUES (p_month_year, p_bid_pack_amount, p_reserve_amount, 0.15, 'Auto-created from bid pack purchase', now())
  ON CONFLICT (month_year) 
  DO UPDATE SET 
    bid_pack_revenue = bonus_reserve.bid_pack_revenue + EXCLUDED.bid_pack_revenue,
    reserve_amount = bonus_reserve.reserve_amount + EXCLUDED.reserve_amount,
    updated_at = now()
  RETURNING bid_pack_revenue AS new_bid_pack_revenue, reserve_amount AS new_reserve_amount;
END;
$$ LANGUAGE plpgsql;

-- Done!
