-- AI Ops: Dispute Resolver Webhook Trigger
-- Run this in Supabase SQL Editor to enable automatic dispute resolution via webhook
--
-- SETUP INSTRUCTIONS:
-- 1. Run this SQL in your Supabase project's SQL Editor
-- 2. Generate a random 32-byte hex secret: openssl rand -hex 32
-- 3. Set SUPABASE_WEBHOOK_SECRET in Netlify environment variables (same value)
-- 4. In Supabase Dashboard → Database → Webhooks → Create a new webhook:
--    - Name: notify_dispute_created
--    - Table: disputes
--    - Events: INSERT
--    - Webhook URL: https://mycarconcierge.com/.netlify/functions/dispute-resolver-background
--    - HTTP Method: POST
--    - HTTP Headers: {
--        "x-webhook-signature": "sha256=<HMAC-SHA256 of payload signed with SUPABASE_WEBHOOK_SECRET>"
--      }
-- NOTE: The background function verifies the HMAC-SHA256 signature using SUPABASE_WEBHOOK_SECRET.
-- Without this env var, all requests are rejected. Set it in Netlify before enabling the webhook.

-- Create the pg_notify trigger function (optional - for real-time listening)
CREATE OR REPLACE FUNCTION notify_dispute_created()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'new_dispute',
    json_build_object(
      'id', NEW.id,
      'status', NEW.status,
      'member_id', NEW.member_id,
      'provider_id', NEW.provider_id,
      'package_id', NEW.package_id,
      'reason', NEW.reason,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the disputes table (fires on each new row)
DROP TRIGGER IF EXISTS on_dispute_created ON disputes;
CREATE TRIGGER on_dispute_created
  AFTER INSERT ON disputes
  FOR EACH ROW
  EXECUTE FUNCTION notify_dispute_created();

-- NOTE: The Supabase Webhook (configured in Dashboard → Database → Webhooks)
-- is the primary mechanism for calling the dispute-resolver-background Netlify function.
-- This trigger is supplementary for pg_notify-based real-time subscriptions.

-- Verify trigger was created:
-- SELECT trigger_name, event_manipulation, event_object_table FROM information_schema.triggers WHERE trigger_name = 'on_dispute_created';
