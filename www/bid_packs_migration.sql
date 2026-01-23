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

-- Insert bid pack options
INSERT INTO bid_packs (name, bid_count, bonus_bids, price, is_active, is_popular) VALUES
  ('Starter', 5, 0, 9.99, true, false),
  ('Standard', 15, 2, 24.99, true, true),
  ('Professional', 30, 5, 44.99, true, false),
  ('Enterprise', 75, 15, 99.99, true, false);

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
