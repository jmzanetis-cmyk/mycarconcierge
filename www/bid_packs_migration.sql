-- Bid Packs Migration for Supabase
-- Run this in your Supabase SQL Editor

-- Create bid_packs table
CREATE TABLE IF NOT EXISTS bid_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  bid_count INTEGER NOT NULL,
  bonus_bids INTEGER DEFAULT 0,
  price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_popular BOOLEAN DEFAULT false,
  stripe_price_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create bid_credit_purchases table
CREATE TABLE IF NOT EXISTS bid_credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bid_pack_id UUID REFERENCES bid_packs(id),
  bids_purchased INTEGER NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  stripe_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add bid credit columns to profiles if not exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bid_credits INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_trial_bids INTEGER DEFAULT 3;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_bids_purchased INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_bids_used INTEGER DEFAULT 0;

-- Insert bid pack options (automotive-themed with volume discounts)
INSERT INTO bid_packs (name, bid_count, bonus_bids, price, is_active, is_popular) VALUES
  ('Jumper Cables', 1, 0, 10.00, true, false),
  ('Dipstick', 50, 0, 200.00, true, false),
  ('Spark Plug', 70, 0, 250.00, true, false),
  ('Turbo', 95, 0, 300.00, true, false),
  ('V8', 140, 0, 400.00, true, true),
  ('Muscle Car', 195, 0, 500.00, true, false),
  ('Supercharger', 270, 0, 625.00, true, false),
  ('Racing Team', 385, 0, 800.00, true, true),
  ('Pit Crew', 535, 0, 1000.00, true, false),
  ('Speedway', 745, 0, 1250.00, true, false),
  ('Grand Prix', 990, 0, 1500.00, true, false),
  ('Formula One', 1470, 0, 2000.00, true, true),
  ('Le Mans', 2050, 0, 2500.00, true, false),
  ('Daytona', 2725, 0, 3000.00, true, false),
  ('Indy 500', 4040, 0, 4000.00, true, false),
  ('Monaco', 5620, 0, 5000.00, true, false),
  ('Autobahn', 7800, 0, 6250.00, true, false),
  ('Nürburgring', 10400, 0, 7500.00, true, false),
  ('Championship', 15400, 0, 10000.00, true, false);

-- Enable RLS
ALTER TABLE bid_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_credit_purchases ENABLE ROW LEVEL SECURITY;

-- Bid packs are readable by all authenticated users
CREATE POLICY "Anyone can read active bid packs" ON bid_packs
  FOR SELECT USING (is_active = true);

-- Providers can read their own purchases
CREATE POLICY "Providers can read own purchases" ON bid_credit_purchases
  FOR SELECT USING (auth.uid() = provider_id);

-- Allow insert for authenticated users (through service role)
CREATE POLICY "Allow insert for providers" ON bid_credit_purchases
  FOR INSERT WITH CHECK (auth.uid() = provider_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bid_credit_purchases_provider ON bid_credit_purchases(provider_id);
