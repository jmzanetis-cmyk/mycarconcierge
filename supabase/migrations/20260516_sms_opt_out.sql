-- Task #425 (Step 4): Twilio STOP keyword compliance.
--
-- Twilio (and US/Canada carriers) require that any inbound message containing
-- one of the standard STOP keywords (STOP, STOPALL, UNSUBSCRIBE, CANCEL,
-- END, QUIT) immediately opts the sender out of all further outbound SMS
-- from that long code or short code. Failure to honor this is a TCPA
-- violation and gets the sending number filtered/blocked.
--
-- Storage:
--   profiles.sms_opt_out boolean (default false)
--     Set to true by netlify/functions/twilio-sms-inbound.js (and the dev
--     mirror in www/server.js) when a STOP keyword is received from a
--     phone number matching profiles.phone. Cleared back to false when
--     the same phone replies START / UNSTOP / YES.
--
--   sms_opt_out_log table — audit trail for compliance review (TCPA
--     defendants must be able to prove on demand that they honored a STOP
--     within 24h). One row per inbound STOP/START event, regardless of
--     whether a profile was matched.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_out_at timestamptz;

COMMENT ON COLUMN public.profiles.sms_opt_out IS
  'TCPA opt-out flag set by twilio-sms-inbound when the user texts STOP. sendSmsNotification refuses to deliver any further messages while this is true. Cleared when the user texts START.';

CREATE TABLE IF NOT EXISTS public.sms_opt_out_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  keyword text NOT NULL,
  action text NOT NULL CHECK (action IN ('opt_out', 'opt_in')),
  matched_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  twilio_message_sid text,
  raw_body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_opt_out_log_phone ON public.sms_opt_out_log (phone_e164, created_at DESC);

ALTER TABLE public.sms_opt_out_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_sms_opt_out_log" ON public.sms_opt_out_log;
CREATE POLICY "service_role_sms_opt_out_log"
  ON public.sms_opt_out_log FOR ALL TO service_role USING (true) WITH CHECK (true);
