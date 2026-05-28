-- B3 Milestone Bonuses: seed missing thresholds + idempotency constraint
--
-- Contract §1.3 thresholds — $1K, $5K, $10K were missing from the table.
-- The $25K–$1M rows already exist.

INSERT INTO milestone_thresholds (threshold_amount, bonus_amount, description, is_active)
SELECT 1000, 100, 'MCC reaches $1,000 in cumulative platform revenue', true
WHERE NOT EXISTS (SELECT 1 FROM milestone_thresholds WHERE threshold_amount = 1000);

INSERT INTO milestone_thresholds (threshold_amount, bonus_amount, description, is_active)
SELECT 5000, 500, 'MCC reaches $5,000 in cumulative platform revenue', true
WHERE NOT EXISTS (SELECT 1 FROM milestone_thresholds WHERE threshold_amount = 5000);

INSERT INTO milestone_thresholds (threshold_amount, bonus_amount, description, is_active)
SELECT 10000, 1000, 'MCC reaches $10,000 in cumulative platform revenue', true
WHERE NOT EXISTS (SELECT 1 FROM milestone_thresholds WHERE threshold_amount = 10000);

-- Idempotency guard: each (founder, threshold) pair can only be recorded once.
-- The B3 check function uses INSERT ... ON CONFLICT (founder_id, threshold_amount) DO NOTHING
-- to guarantee each bonus fires exactly once regardless of how many times the check runs.
ALTER TABLE milestone_achievements
  ADD CONSTRAINT milestone_achievements_founder_threshold_unique
  UNIQUE (founder_id, threshold_amount);
