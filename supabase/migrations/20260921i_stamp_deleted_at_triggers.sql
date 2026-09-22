-- =============================================================================
-- 20260921i_stamp_deleted_at_triggers.sql
--
-- Companion to 20260921h_preserve_job_records_on_account_delete.sql.
--
-- HISTORICAL NOTE
-- ---------------
-- When 20260921h was applied inline to prod on 2026-09-22, the three trigger
-- functions and triggers below were run in the same transaction as the CHECK
-- constraints — they are load-bearing safety nets. Without them, the
-- ON DELETE SET NULL cascade from auth.users performs an UPDATE that violates
-- the CHECK (foreign key nulled but *_deleted_at still null), which would
-- cause account deletion to fail — Apple 5.1.1(v) forbids that.
--
-- The trigger DDL was not written into the 20260921h migration file at the
-- time. This file records it so that a fresh rebuild running h then i
-- reproduces prod exactly. On prod (where h and these triggers already exist
-- as of 2026-09-22), re-running this file is a no-op: CREATE OR REPLACE
-- FUNCTION rewrites the function body byte-identically, and DROP TRIGGER IF
-- EXISTS + CREATE TRIGGER rebinds the same trigger with the same definition.
-- Neither table data nor trigger firing order is affected.
--
-- Do not modify 20260921h to include these — h is already applied to prod
-- and is treated as immutable.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- care_plans: stamp member_deleted_at when member_id is nulled out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.care_plans_stamp_member_deleted_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.member_id IS NOT NULL
     AND NEW.member_id IS NULL
     AND NEW.member_deleted_at IS NULL THEN
    NEW.member_deleted_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_care_plans_stamp_member_deleted_at
  ON public.care_plans;

CREATE TRIGGER trg_care_plans_stamp_member_deleted_at
  BEFORE UPDATE ON public.care_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.care_plans_stamp_member_deleted_at();

-- ---------------------------------------------------------------------------
-- plan_bids: stamp provider_deleted_at when provider_id is nulled out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_bids_stamp_provider_deleted_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.provider_id IS NOT NULL
     AND NEW.provider_id IS NULL
     AND NEW.provider_deleted_at IS NULL THEN
    NEW.provider_deleted_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_plan_bids_stamp_provider_deleted_at
  ON public.plan_bids;

CREATE TRIGGER trg_plan_bids_stamp_provider_deleted_at
  BEFORE UPDATE ON public.plan_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_bids_stamp_provider_deleted_at();

-- ---------------------------------------------------------------------------
-- care_plan_completions: stamp member_deleted_at when member_id is nulled
-- out. Note the completions table has BOTH member_id and provider_id FKs,
-- but this trigger only stamps the member-side timestamp. The CHECK
-- constraint on the provider side is currently satisfied by the JS
-- anonymise pass (which sets provider_deleted_at explicitly). If a future
-- change relies on the DB cascade for provider-side nulling too, add a
-- companion trigger then; today's account-deletion path already handles it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.care_plan_completions_stamp_member_deleted_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.member_id IS NOT NULL
     AND NEW.member_id IS NULL
     AND NEW.member_deleted_at IS NULL THEN
    NEW.member_deleted_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_care_plan_completions_stamp_member_deleted_at
  ON public.care_plan_completions;

CREATE TRIGGER trg_care_plan_completions_stamp_member_deleted_at
  BEFORE UPDATE ON public.care_plan_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.care_plan_completions_stamp_member_deleted_at();

COMMIT;
