-- saas_plans: stores SaaS plan metadata for all 5 product lines
-- Mirrors the SAAS_PLANS config in server.js; allows admin overrides without redeployment

CREATE TABLE IF NOT EXISTS saas_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product         text NOT NULL,
  plan            text NOT NULL,
  display_name    text NOT NULL,
  price_monthly   integer NOT NULL DEFAULT 0,
  price_annual    integer NOT NULL DEFAULT 0,
  stripe_price_id text,
  stripe_price_id_annual text,
  features        jsonb DEFAULT '[]',
  limits          jsonb DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product, plan)
);

-- Seed with the 5 product lines x 3 tiers (pricing in cents)

-- Fleet Management
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('fleet', 'starter', 'Fleet Starter', 4900, 49900, '{"vehicles": 10, "drivers": 5}', '["Vehicle tracking", "Basic maintenance alerts", "Driver management (5 drivers)"]'),
  ('fleet', 'pro', 'Fleet Pro', 14900, 149900, '{"vehicles": 50, "drivers": 25}', '["50 vehicles", "25 drivers", "Advanced analytics", "Custom alerts", "Priority support"]'),
  ('fleet', 'business', 'Fleet Business', 39900, 399900, '{"vehicles": -1, "drivers": -1}', '["Unlimited vehicles & drivers", "White-glove onboarding", "API access", "Dedicated account manager"]')
ON CONFLICT (product, plan) DO NOTHING;

-- Provider Shop
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('shop', 'starter', 'Shop Starter', 2900, 29900, '{}', '["SMS Reminders", "Car Club Loyalty"]'),
  ('shop', 'pro', 'Shop Pro', 7900, 79900, '{}', '["SMS Reminders", "Advanced Analytics", "Car Club Loyalty", "Priority listing"]'),
  ('shop', 'business', 'Shop Business', 19900, 199900, '{}', '["All Pro features", "Dedicated support", "Custom branding"]')
ON CONFLICT (product, plan) DO NOTHING;

-- White-label Platform
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('white_label', 'starter', 'White-label Starter', 19900, 199900, '{"members": 500, "providers": 50}', '["Custom domain", "Custom branding", "500 members", "50 providers"]'),
  ('white_label', 'pro', 'White-label Pro', 49900, 499900, '{"members": 5000, "providers": 500}', '["5,000 members", "500 providers", "Custom email templates", "Analytics dashboard"]'),
  ('white_label', 'business', 'White-label Business', 149900, 1499900, '{"members": -1, "providers": -1}', '["Unlimited members & providers", "SLA guarantee", "Dedicated infrastructure"]')
ON CONFLICT (product, plan) DO NOTHING;

-- AI API
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('ai_api', 'starter', 'AI API Starter', 4900, 49900, '{"requests_per_month": 5000}', '["5,000 requests/month", "VIN lookup", "Recall data", "Price estimates"]'),
  ('ai_api', 'pro', 'AI API Pro', 14900, 149900, '{"requests_per_month": 50000}', '["50,000 requests/month", "OBD code analysis", "Batch processing", "Webhooks"]'),
  ('ai_api', 'business', 'AI API Business', 49900, 499900, '{"requests_per_month": -1}', '["Unlimited requests", "SLA 99.9%", "Dedicated rate limits", "Priority support"]')
ON CONFLICT (product, plan) DO NOTHING;

-- Outreach Engine
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('outreach', 'starter', 'Outreach Starter', 2900, 29900, '{"leads_per_month": 500}', '["500 leads/month", "AI message drafting", "Lead scoring", "Email campaigns"]'),
  ('outreach', 'pro', 'Outreach Pro', 9900, 99900, '{"leads_per_month": 5000}', '["5,000 leads/month", "Auto-send with compliance", "CRM deduplication", "Re-engagement flows"]'),
  ('outreach', 'business', 'Outreach Business', 29900, 299900, '{"leads_per_month": -1}', '["Unlimited leads", "Multi-channel outreach", "Custom AI personas", "Dedicated pipeline"]')
ON CONFLICT (product, plan) DO NOTHING;

-- RLS: only admin roles can modify; all authenticated users can read
ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_plans_read" ON saas_plans
  FOR SELECT USING (true);

CREATE POLICY "saas_plans_admin_write" ON saas_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );
