-- ============================================================================
-- Outreach Engine ↔ CRM bridge (Task #134)
--
-- Task #134 closed the gaps between www/outreach-schema.sql (canonical schema
-- file checked into the repo) and the live Supabase database, which had drifted
-- because the schema file was applied piecemeal over time. This migration
-- re-applies every piece that turned out to be missing in production:
--
--   1. check_crm_duplicate(p_email, p_phone)        — RPC used by every import
--                                                     path (manual add-lead,
--                                                     CSV import, Google Places
--                                                     import) to skip rows that
--                                                     already exist in profiles
--                                                     OR in outreach_leads.
--   2. increment_engine_stat(p_field, p_amount)     — RPC used by the engine
--                                                     core to atomically bump
--                                                     engine_state counters
--                                                     without race conditions.
--   3. auto_link_outreach_lead trigger              — fires AFTER INSERT ON
--                                                     profiles, links any
--                                                     matching outreach_lead
--                                                     by email/phone, and
--                                                     stamps the bridge cols
--                                                     (outreach_lead_id,
--                                                     outreach_source,
--                                                     outreach_converted_at).
--   4. provider_applications.outreach_lead_id col   — lets stalled-application
--                                                     re-engagement attribute
--                                                     conversions back to the
--                                                     originating Hunter lead.
--
-- Apply via Supabase SQL Editor (paste the file). Same manual-apply pattern as
-- 20260424_admin_audit_log.sql. The auto_link function is SECURITY DEFINER and
-- exception-swallows so a failure NEVER blocks signup. The function deliberately
-- mirrors the version in www/outreach-schema.sql so the schema file remains the
-- single source of truth — this migration only re-runs the pieces the live DB
-- is missing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. check_crm_duplicate ----------------------------------------------------
-- ---------------------------------------------------------------------------
-- Drop any prior version first: the initial schema (20260420) defined a
-- 3-column return type (exists_in_crm, profile_id, profile_role). This bridge
-- migration adds a 4th column (lead_id), and Postgres requires an explicit
-- DROP when a function's return-column shape changes — CREATE OR REPLACE alone
-- fails with "cannot change return type of existing function".
DROP FUNCTION IF EXISTS public.check_crm_duplicate(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.check_crm_duplicate(p_email TEXT, p_phone TEXT)
RETURNS TABLE (exists_in_crm BOOLEAN, profile_id UUID, profile_role TEXT, lead_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (
    SELECT id, role
    FROM profiles
    WHERE (p_email IS NOT NULL AND lower(email) = lower(p_email))
       OR (p_phone IS NOT NULL AND phone = p_phone)
    LIMIT 1
  ), l AS (
    SELECT id
    FROM outreach_leads
    WHERE (p_email IS NOT NULL AND lower(email) = lower(p_email))
       OR (p_phone IS NOT NULL AND phone = p_phone)
    LIMIT 1
  )
  SELECT
    (p.id IS NOT NULL OR l.id IS NOT NULL) AS exists_in_crm,
    p.id  AS profile_id,
    p.role AS profile_role,
    l.id  AS lead_id
  FROM (SELECT 1) one
  LEFT JOIN p ON true
  LEFT JOIN l ON true;
$$;

-- IMPORTANT: service_role ONLY. This function returns existence-of-profile
-- and profile_id/role for any email/phone — granting it to `authenticated`
-- (or `anon`) would let any logged-in user enumerate the CRM membership of
-- arbitrary email addresses or phone numbers. Every duplicate-check call site
-- (outreach-engine-core.js::checkCrmDuplicate, outreach-admin.js leads POST
-- + import-csv) goes through Netlify functions that already use the
-- service-role Supabase client, so this restriction is safe.
REVOKE ALL ON FUNCTION public.check_crm_duplicate(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_crm_duplicate(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.check_crm_duplicate(TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_crm_duplicate(TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. increment_engine_stat --------------------------------------------------
-- ---------------------------------------------------------------------------
-- Atomic +N bump on engine_state.<field>. Whitelisted columns only — anything
-- else is a no-op so a typo can never corrupt unrelated columns.
CREATE OR REPLACE FUNCTION public.increment_engine_stat(p_field TEXT, p_amount INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field NOT IN (
    'total_leads_discovered',
    'total_messages_drafted',
    'total_messages_sent'
  ) THEN
    RAISE NOTICE 'increment_engine_stat: ignoring non-whitelisted field %', p_field;
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE engine_state SET %I = COALESCE(%I, 0) + $1, updated_at = NOW() WHERE id = 1',
    p_field, p_field
  ) USING p_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_engine_stat(TEXT, INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_engine_stat(TEXT, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. auto_link_outreach_lead trigger ----------------------------------------
-- ---------------------------------------------------------------------------
-- Mirrors www/outreach-schema.sql. Wrapped in a single BEGIN/EXCEPTION block so
-- a failure here NEVER blocks profile creation (signup). The function probes
-- for optional columns/tables via information_schema so it stays safe across
-- partial schema deployments.
CREATE OR REPLACE FUNCTION public.auto_link_outreach_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_lead_id UUID;
  has_outreach_leads BOOLEAN;
  has_opportunity_pipeline BOOLEAN;
  has_col_lead_id BOOLEAN;
  has_col_source BOOLEAN;
  has_col_converted_at BOOLEAN;
  lead_source TEXT;
  update_parts TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'outreach_leads'
  ) INTO has_outreach_leads;

  IF NOT has_outreach_leads THEN
    RETURN NEW;
  END IF;

  SELECT id INTO matched_lead_id
  FROM outreach_leads
  WHERE crm_profile_id IS NULL
    AND crm_sync_status != 'duplicate'
    AND (
      (NEW.email IS NOT NULL AND lower(email) = lower(NEW.email))
      OR (NEW.phone IS NOT NULL AND phone = NEW.phone)
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF matched_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE outreach_leads
  SET status = 'converted',
      crm_profile_id = NEW.id,
      crm_sync_status = 'converted',
      updated_at = NOW()
  WHERE id = matched_lead_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'outreach_lead_id'
  ) INTO has_col_lead_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'outreach_source'
  ) INTO has_col_source;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'outreach_converted_at'
  ) INTO has_col_converted_at;

  IF has_col_lead_id OR has_col_source OR has_col_converted_at THEN
    update_parts := ARRAY[]::TEXT[];

    IF has_col_lead_id THEN
      update_parts := array_append(update_parts, 'outreach_lead_id = ' || quote_literal(matched_lead_id));
    END IF;

    IF has_col_source THEN
      SELECT source INTO lead_source FROM outreach_leads WHERE id = matched_lead_id;
      IF lead_source IS NOT NULL THEN
        update_parts := array_append(update_parts, 'outreach_source = ' || quote_literal(lead_source));
      END IF;
    END IF;

    IF has_col_converted_at THEN
      update_parts := array_append(update_parts, 'outreach_converted_at = NOW()');
    END IF;

    IF array_length(update_parts, 1) > 0 THEN
      EXECUTE 'UPDATE profiles SET ' || array_to_string(update_parts, ', ') || ' WHERE id = ' || quote_literal(NEW.id);
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'opportunity_pipeline'
  ) INTO has_opportunity_pipeline;

  IF has_opportunity_pipeline THEN
    UPDATE opportunity_pipeline
    SET stage = 'converted', last_action_at = NOW()
    WHERE lead_id = matched_lead_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- NEVER block profile insert. Log and return.
  RAISE WARNING 'auto_link_outreach_lead failed for profile %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_outreach_lead ON public.profiles;
CREATE TRIGGER trg_auto_link_outreach_lead
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_link_outreach_lead();

-- ---------------------------------------------------------------------------
-- 4. provider_applications.outreach_lead_id ---------------------------------
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_applications
  ADD COLUMN IF NOT EXISTS outreach_lead_id UUID REFERENCES public.outreach_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_provider_applications_outreach_lead
  ON public.provider_applications(outreach_lead_id)
  WHERE outreach_lead_id IS NOT NULL;
