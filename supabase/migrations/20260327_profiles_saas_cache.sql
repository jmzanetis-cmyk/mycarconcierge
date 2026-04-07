-- Add saas_plans_cache column to profiles for quick plan access without joins
-- Stores {product: plan} map, e.g. {"fleet": "pro", "shop": "starter"}
-- Updated at checkout completion; authoritative source remains saas_subscriptions

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS saas_plans_cache jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS saas_plans_expires_at jsonb DEFAULT '{}';

COMMENT ON COLUMN profiles.saas_plans_cache IS 'Cached SaaS plan per product line. Updated at checkout. Format: {"fleet":"pro","shop":"starter"}';
COMMENT ON COLUMN profiles.saas_plans_expires_at IS 'Cached plan expiry ISO timestamps per product. Format: {"fleet":"2026-04-27T00:00:00Z"}';
