-- Crowd Fund Payments column
ALTER TABLE payments ADD COLUMN IF NOT EXISTS crowd_funded_amount_cents INTEGER DEFAULT 0;
