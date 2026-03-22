CREATE TABLE IF NOT EXISTS public.sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone_masked text NOT NULL,
  message_type text NOT NULL DEFAULT 'general',
  message_sid text,
  status text NOT NULL DEFAULT 'unknown',
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_log_created_idx ON public.sms_log(created_at DESC);
CREATE INDEX IF NOT EXISTS sms_log_status_idx ON public.sms_log(status);
CREATE INDEX IF NOT EXISTS sms_log_type_idx ON public.sms_log(message_type);

ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sms_log'
      AND policyname = 'service_role_sms_log'
  ) THEN
    CREATE POLICY service_role_sms_log ON public.sms_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
