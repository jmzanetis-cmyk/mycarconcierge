-- SaaS Subscriptions Table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID,
  product TEXT NOT NULL CHECK (product IN ('fleet','shop','ai_api','outreach','white_label')),
  plan TEXT NOT NULL CHECK (plan IN ('starter','pro','business')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('active','canceled','past_due','trialing','incomplete','incomplete_expired')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_user_id ON saas_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_product ON saas_subscriptions(product);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status ON saas_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_stripe_customer ON saas_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_stripe_sub ON saas_subscriptions(stripe_subscription_id);

ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own saas subscriptions" ON saas_subscriptions;
CREATE POLICY "Users can view their own saas subscriptions"
  ON saas_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all saas subscriptions" ON saas_subscriptions;
CREATE POLICY "Admins can view all saas subscriptions"
  ON saas_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Service role can manage saas subscriptions" ON saas_subscriptions;
CREATE POLICY "Service role can manage saas subscriptions"
  ON saas_subscriptions FOR ALL
  TO service_role
  USING (true);
