-- =============================================================
-- Task #41: Crowd-Funded Service Packages — Complete Migration
-- =============================================================

-- 1. Add crowd_funded toggle and funding goal to service packages
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS crowd_funded BOOLEAN DEFAULT FALSE;
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS funding_goal_cents INTEGER;

-- 2. Create crowd_fund_contributions table
CREATE TABLE IF NOT EXISTS crowd_fund_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES maintenance_packages(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES profiles(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100),
  status TEXT NOT NULL DEFAULT 'completed',
  payment_intent_id TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crowd_fund_contributions_package_idx ON crowd_fund_contributions(package_id);
CREATE INDEX IF NOT EXISTS crowd_fund_contributions_contributor_idx ON crowd_fund_contributions(contributor_id);

-- 3. Row Level Security
ALTER TABLE crowd_fund_contributions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crowd_fund_contributions' AND policyname='members can view contributions') THEN
    CREATE POLICY "members can view contributions" ON crowd_fund_contributions
      FOR SELECT USING (
        auth.uid() = contributor_id OR
        auth.uid() = (SELECT member_id FROM maintenance_packages WHERE id = package_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crowd_fund_contributions' AND policyname='members can contribute') THEN
    CREATE POLICY "members can contribute" ON crowd_fund_contributions
      FOR INSERT WITH CHECK (auth.uid() = contributor_id);
  END IF;
END $$;

-- 4. Track community-contributed amount on payment records
ALTER TABLE payments ADD COLUMN IF NOT EXISTS crowd_funded_amount_cents INTEGER DEFAULT 0;
