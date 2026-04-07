-- saas_plans: stores SaaS plan metadata for all 5 product lines
-- Prices (in cents) mirror the SAAS_PLANS config in server.js exactly

CREATE TABLE IF NOT EXISTS saas_plans (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product                text NOT NULL,
  plan                   text NOT NULL,
  display_name           text NOT NULL,
  price_monthly          integer NOT NULL DEFAULT 0,
  price_annual           integer NOT NULL DEFAULT 0,
  stripe_price_id        text,
  stripe_price_id_annual text,
  features               jsonb DEFAULT '[]',
  limits                 jsonb DEFAULT '{}',
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product, plan)
);

-- Fleet Management (prices match server.js SAAS_PLANS)
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('fleet', 'starter',  'Fleet Starter',   4900,   39900, '{"vehicles":10,"drivers":5}',    '["Vehicle tracking","Maintenance scheduling","Driver management","Service approvals","Basic reporting"]'),
  ('fleet', 'pro',      'Fleet Pro',        9900,   89900, '{"vehicles":50,"drivers":25}',   '["Everything in Starter","Bulk service requests","Advanced analytics","API access","Priority support","Custom workflows"]'),
  ('fleet', 'business', 'Fleet Business',  24900,  229900, '{"vehicles":-1,"drivers":-1}',  '["Everything in Pro","Unlimited vehicles & drivers","White-label options","Dedicated account manager","SLA guarantee","Custom integrations"]')
ON CONFLICT (product, plan) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_annual  = EXCLUDED.price_annual,
  features      = EXCLUDED.features,
  limits        = EXCLUDED.limits,
  updated_at    = now();

-- Provider Shop
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('shop', 'starter',  'Shop Starter',   2900,   24900, '{}', '["Online booking","Customer management","Invoice generation","Service history","Email notifications"]'),
  ('shop', 'pro',      'Shop Pro',       5900,   54900, '{}', '["Everything in Starter","Multi-tech scheduling","SMS reminders","Reviews management","Analytics dashboard","Loyalty program"]'),
  ('shop', 'business', 'Shop Business', 12900,  119900, '{}', '["Everything in Pro","Multi-location support","Custom branding","API access","Inventory management","Priority support"]')
ON CONFLICT (product, plan) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_annual  = EXCLUDED.price_annual,
  features      = EXCLUDED.features,
  updated_at    = now();

-- Automotive AI API
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('ai_api', 'starter',  'AI Starter',    4900,   44900, '{"calls_per_month":5000}',   '["5,000 API calls/month","VIN decoder","Recall lookup","Maintenance scheduler","Basic rate limiting"]'),
  ('ai_api', 'pro',      'AI Pro',       14900,  139900, '{"calls_per_month":50000}',  '["50,000 API calls/month","All Starter endpoints","Fair price estimator","OBD code analyzer","Dream car finder","Webhook support"]'),
  ('ai_api', 'business', 'AI Business',  49900,  479900, '{"calls_per_month":-1}',     '["Unlimited API calls","All Pro endpoints","Custom model fine-tuning","Dedicated infrastructure","SLA 99.9%","White-glove onboarding"]')
ON CONFLICT (product, plan) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_annual  = EXCLUDED.price_annual,
  features      = EXCLUDED.features,
  limits        = EXCLUDED.limits,
  updated_at    = now();

-- Outreach Engine
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('outreach', 'starter',  'Outreach Starter',   9900,   89900, '{"leads_per_month":500}',   '["500 leads/month","Email campaigns","Lead scoring","CRM sync","Campaign analytics"]'),
  ('outreach', 'pro',      'Outreach Pro',       24900,  229900, '{"leads_per_month":5000}',  '["5,000 leads/month","Everything in Starter","AI message drafting","Multi-channel outreach","A/B testing","Auto-send with guardrails"]'),
  ('outreach', 'business', 'Outreach Business',  79900,  749900, '{"leads_per_month":-1}',    '["Unlimited leads","Everything in Pro","Custom AI training","Dedicated discovery cycles","White-label option","API access"]')
ON CONFLICT (product, plan) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_annual  = EXCLUDED.price_annual,
  features      = EXCLUDED.features,
  limits        = EXCLUDED.limits,
  updated_at    = now();

-- White-label Platform
INSERT INTO saas_plans (product, plan, display_name, price_monthly, price_annual, limits, features) VALUES
  ('white_label', 'starter',  'White-label Starter',    49900,   479900, '{"members":500,"providers":50}',    '["Custom domain","Logo & colors","Up to 500 members","Up to 50 providers","Standard support"]'),
  ('white_label', 'pro',      'White-label Pro',        149900, 1399900, '{"members":5000,"providers":500}', '["Everything in Starter","Up to 5,000 members","Up to 500 providers","Custom email templates","Analytics dashboard","API access"]'),
  ('white_label', 'business', 'White-label Business',   399900, 3799900, '{"members":-1,"providers":-1}',   '["Everything in Pro","Unlimited members & providers","Custom feature development","Dedicated infrastructure","SLA 99.9%","Executive support"]')
ON CONFLICT (product, plan) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_annual  = EXCLUDED.price_annual,
  features      = EXCLUDED.features,
  limits        = EXCLUDED.limits,
  updated_at    = now();

-- RLS: all authenticated users can read; only admins can write
ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas_plans_read" ON saas_plans;
DROP POLICY IF EXISTS "saas_plans_admin_write" ON saas_plans;

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
