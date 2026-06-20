-- ============================================================================
-- 20260621a_capa_system_capture.sql
-- Drift-capture for the CAR (Corrective Action Response / CAPA) system.
--
-- WHAT THIS DOES:
--   Version-controls the EXISTING prod CAR schema + RPCs so the system is
--   recoverable from this repo. Designed as a TRUE NO-OP against current
--   prod EXCEPT for one intentional bug fix (see ⚑ below): IF NOT EXISTS
--   guards on every table/column/index/RLS-enable; DROP POLICY IF EXISTS
--   + CREATE POLICY for the policies (identical expressions are recreated,
--   not modified); CREATE OR REPLACE FUNCTION for both RPCs (preserves
--   existing grants per Postgres semantics — privileges survive
--   CREATE OR REPLACE on the same signature).
--
-- ⚑ THE ONE INTENTIONAL CHANGE:
--   review_corrective_action's approve branch currently clears ONLY
--   provider_stats. The bid gate enforces profiles.suspended_at /
--   profiles.role, so approving a CAR did NOT actually lift the
--   suspension. This migration extends the approve branch to ALSO
--   clear profiles (suspended_at, suspension_reason, role) and
--   populate provider_stats.suspension_lifted_by = p_admin_id.
--   Reject + revision_requested branches: untouched.
--
-- BACKGROUND:
--   - Provider-side CAR submission UI (www/providers.html:1617 +
--     providers.js:897) and admin-side review UI (www/admin.html:3454 +
--     admin.js:9126) were built by Replit alongside the rating/suspension
--     features. The DB objects exist in prod (verified 2026-06-20 via
--     PostgREST probes + pg_proc/pg_class queries) but never landed in
--     a tracked migration.
--
--   - Companion code commit (same task) wires suspendProviders to flip
--     car_required=true + mirror suspension state onto provider_stats,
--     and adds a lenient CAR guard to activateProviders. Together they
--     activate the previously-dark CAR loop end-to-end.
--
-- NOTES / FOLLOW-UPS:
--   1. There is intentionally NO admin SELECT policy on
--      corrective_action_responses — only the three provider policies
--      below. The admin review queue at admin.js:9175 reads via
--      supabaseClient.from('corrective_action_responses').select() under
--      the admin's authenticated JWT, which under these policies returns
--      zero rows. Captured as-is. Separate follow-up: confirm whether
--      the admin queue actually reads via service-role/backend (in which
--      case the silent-empty risk doesn't apply) OR whether the queue
--      has been silently broken in prod (in which case it needs either a
--      4th policy USING is_admin() OR an admin backend endpoint).
--
--   2. Both RPCs are SECURITY DEFINER but do NOT pin search_path.
--      Captured verbatim — adding SET search_path = public, pg_temp is
--      a separate hardening commit (low risk; search_path attacks
--      require attacker control of a temp schema). Tracked.
--
--   3. The "Providers can update their pending CARs" USING expression
--      actually allows status IN ('pending', 'revision_requested') —
--      providers can edit and resubmit a CAR that the admin asked for
--      revisions on. (The policy name says "pending" but the predicate
--      is broader; the name is misleading.) Captured verbatim.
--
-- IDEMPOTENT: every statement uses IF NOT EXISTS / DROP IF EXISTS /
-- CREATE OR REPLACE. Safe to re-run.
-- ============================================================================


-- ─── 1. corrective_action_responses table ───────────────────────────────────
-- Column types are best-effort inferences from consumer code. IF NOT EXISTS
-- makes this a no-op against current prod (which has the canonical types);
-- types only matter if this migration is replayed against an empty database.
CREATE TABLE IF NOT EXISTS public.corrective_action_responses (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id              uuid        NOT NULL
                                       REFERENCES public.profiles(id) ON DELETE CASCADE,
  suspension_id            uuid,
  primary_complaint_reason text,
  complaint_count          integer     DEFAULT 1,
  root_cause_analysis      text        NOT NULL,
  corrective_action_plan   text        NOT NULL,
  preventative_action      text        NOT NULL,
  additional_notes         text,
  status                   text        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending','under_review','approved','rejected','revision_requested')),
  reviewed_by              uuid        REFERENCES auth.users(id),
  reviewed_at              timestamptz,
  admin_notes              text,
  rejection_reason         text,
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_car_provider
  ON public.corrective_action_responses (provider_id, status);

CREATE INDEX IF NOT EXISTS idx_car_status
  ON public.corrective_action_responses (status, submitted_at);


-- ─── 2. provider_stats CAR columns ──────────────────────────────────────────
-- Each ALTER ... ADD COLUMN IF NOT EXISTS is a no-op against current prod.
-- Types are inferred from how consumer code reads them.
ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS car_required              boolean     DEFAULT false;

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS car_id                    uuid
                                                     REFERENCES public.corrective_action_responses(id);

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS car_submitted_at          timestamptz;

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS primary_complaint_reason  text;

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS complaint_counts          jsonb       DEFAULT '{}'::jsonb;

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS suspended                 boolean     DEFAULT false;

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS suspended_reason          text;

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS suspended_at              timestamptz;

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS suspension_lifted_at      timestamptz;

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS suspension_lifted_by      uuid
                                                     REFERENCES auth.users(id);


-- ─── 3. Row-Level Security ──────────────────────────────────────────────────
ALTER TABLE public.corrective_action_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_stats              ENABLE ROW LEVEL SECURITY;


-- ─── 4. corrective_action_responses policies ────────────────────────────────
-- Captured verbatim from prod (2026-06-21). Three provider policies. No admin
-- SELECT policy intentionally — see note 1 in the header.

DROP POLICY IF EXISTS "Providers can insert their own CARs"     ON public.corrective_action_responses;
CREATE POLICY "Providers can insert their own CARs"
  ON public.corrective_action_responses
  FOR INSERT
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS "Providers can update their pending CARs" ON public.corrective_action_responses;
CREATE POLICY "Providers can update their pending CARs"
  ON public.corrective_action_responses
  FOR UPDATE
  USING ((provider_id = auth.uid()) AND (status = ANY (ARRAY['pending'::text, 'revision_requested'::text])));

DROP POLICY IF EXISTS "Providers can view their own CARs"       ON public.corrective_action_responses;
CREATE POLICY "Providers can view their own CARs"
  ON public.corrective_action_responses
  FOR SELECT
  USING (provider_id = auth.uid());


-- ─── 5. provider_stats policies ─────────────────────────────────────────────
-- Captured verbatim from prod (2026-06-21). is_admin() is a SECURITY DEFINER
-- helper used elsewhere in the schema; assumed pre-existing.

DROP POLICY IF EXISTS ps_select_admin ON public.provider_stats;
CREATE POLICY ps_select_admin
  ON public.provider_stats
  FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS ps_select_own   ON public.provider_stats;
CREATE POLICY ps_select_own
  ON public.provider_stats
  FOR SELECT
  USING (provider_id = auth.uid());


-- ─── 6. submit_corrective_action RPC ────────────────────────────────────────
-- Captured VERBATIM from prod (2026-06-21). No behavioral change.
-- CREATE OR REPLACE preserves existing grants.

CREATE OR REPLACE FUNCTION public.submit_corrective_action(
    p_provider_id         uuid,
    p_root_cause          text,
    p_corrective_action   text,
    p_preventative_action text,
    p_additional_notes    text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_car_id UUID;
    v_primary_complaint TEXT;
    v_complaint_count INTEGER;
BEGIN
    SELECT COALESCE(primary_complaint_reason, 'unspecified')
    INTO v_primary_complaint FROM provider_stats WHERE provider_id = p_provider_id;
    IF v_primary_complaint IS NULL THEN v_primary_complaint := 'unspecified'; END IF;
    IF v_primary_complaint = 'unspecified' THEN
        SELECT COUNT(*) INTO v_complaint_count FROM provider_reviews
        WHERE provider_id = p_provider_id AND overall_rating <= 3 AND complaint_reason IS NULL;
    ELSE
        SELECT COUNT(*) INTO v_complaint_count FROM provider_reviews
        WHERE provider_id = p_provider_id AND complaint_reason = v_primary_complaint;
    END IF;
    INSERT INTO corrective_action_responses (
        provider_id, primary_complaint_reason, complaint_count,
        root_cause_analysis, corrective_action_plan, preventative_action, additional_notes, status
    ) VALUES (
        p_provider_id, v_primary_complaint, COALESCE(v_complaint_count, 0),
        p_root_cause, p_corrective_action, p_preventative_action, p_additional_notes, 'pending'
    ) RETURNING id INTO v_car_id;
    UPDATE provider_stats SET car_id = v_car_id, car_submitted_at = NOW()
    WHERE provider_id = p_provider_id;
    RETURN v_car_id;
END;
$function$;


-- ─── 7. review_corrective_action RPC ───────────────────────────────────────
-- Captured from prod (2026-06-21) with the ⚑ FIX applied in the approve branch.
-- The fix: also clear profiles (the bid-gate-enforced source of truth) and
-- populate provider_stats.suspension_lifted_by. Reject + revision_requested
-- branches untouched. CREATE OR REPLACE preserves existing grants.

CREATE OR REPLACE FUNCTION public.review_corrective_action(
    p_car_id           uuid,
    p_admin_id         uuid,
    p_decision         text,
    p_admin_notes      text DEFAULT NULL::text,
    p_rejection_reason text DEFAULT NULL::text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_provider_id UUID;
BEGIN
    IF p_decision NOT IN ('approved', 'rejected', 'revision_requested') THEN
        RAISE EXCEPTION 'Invalid decision';
    END IF;
    SELECT provider_id INTO v_provider_id FROM corrective_action_responses WHERE id = p_car_id;
    UPDATE corrective_action_responses
    SET status = p_decision, reviewed_by = p_admin_id, reviewed_at = NOW(),
        admin_notes = p_admin_notes, rejection_reason = p_rejection_reason, updated_at = NOW()
    WHERE id = p_car_id;
    IF p_decision = 'approved' THEN
        -- 1c-CAPA fix: clear profiles (the bid-gate-enforced source of truth) so
        -- approving a CAR actually lifts the suspension. Previously this RPC cleared
        -- only provider_stats, which the bid gate does not read.
        UPDATE profiles
        SET suspended_at = NULL, suspension_reason = NULL, role = 'provider'
        WHERE id = v_provider_id AND role = 'suspended';
        UPDATE provider_stats
        SET suspended = false, suspended_reason = NULL, suspension_lifted_at = NOW(),
            suspension_lifted_by = p_admin_id, car_required = false
        WHERE provider_id = v_provider_id;
    END IF;
    RETURN true;
END;
$function$;
