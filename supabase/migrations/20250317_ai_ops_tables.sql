-- AI Ops Tables Migration for My Car Concierge
-- Run this in Supabase Dashboard → SQL Editor

-- Step 1: Create exec_sql helper function (used by server's auto-bootstrap)
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
END;
$$;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action_type text,
  target_id text,
  decision jsonb,
  confidence float DEFAULT 0,
  auto_executed boolean DEFAULT false,
  escalated boolean DEFAULT false,
  outcome text DEFAULT 'pending',
  error_details text,
  execution_time_ms int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_action_log_module_idx ON public.ai_action_log(module);
CREATE INDEX IF NOT EXISTS ai_action_log_created_idx ON public.ai_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_action_log_target_idx ON public.ai_action_log(module, action_type, auto_executed, target_id);

CREATE TABLE IF NOT EXISTS public.ai_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  target_id text,
  recommendation jsonb,
  confidence float DEFAULT 0,
  status text DEFAULT 'pending',
  admin_decision text,
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_escalations_status_idx ON public.ai_escalations(status);
CREATE INDEX IF NOT EXISTS ai_escalations_module_idx ON public.ai_escalations(module);

CREATE TABLE IF NOT EXISTS public.ai_daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date UNIQUE NOT NULL,
  narrative text,
  stats jsonb,
  sent_sms boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_ops_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Grant access to authenticated and service_role
ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_ops_settings ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for server-side operations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_action_log' AND policyname='service_role_full_access_ai_action_log') THEN
    CREATE POLICY "service_role_full_access_ai_action_log" ON public.ai_action_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_escalations' AND policyname='service_role_full_access_ai_escalations') THEN
    CREATE POLICY "service_role_full_access_ai_escalations" ON public.ai_escalations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_daily_digests' AND policyname='service_role_full_access_ai_daily_digests') THEN
    CREATE POLICY "service_role_full_access_ai_daily_digests" ON public.ai_daily_digests FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_ops_settings' AND policyname='service_role_full_access_ai_ops_settings') THEN
    CREATE POLICY "service_role_full_access_ai_ops_settings" ON public.ai_ops_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Helper function: merge JSONB into packages.metadata without overwriting existing fields
CREATE OR REPLACE FUNCTION public.merge_package_metadata(p_id uuid, p_metadata jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.packages
  SET metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata
  WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.merge_package_metadata(uuid, jsonb) TO service_role;
