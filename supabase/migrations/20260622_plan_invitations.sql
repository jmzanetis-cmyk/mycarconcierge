-- ============================================================================
-- 20260622_plan_invitations.sql
-- plan_invitations — record-only table for curated provider invitations
-- (Step 1d-1).
--
-- PURPOSE:
--   The hybrid curated bidding model has the matchmaker invite 2-3 vetted
--   providers per open care_plan. In Step 1d-1 the table is RECORD-ONLY:
--   invitations are stored + queryable, but the bid gate does NOT require
--   an invitation row to bid (the board stays open to all service-matched
--   verified providers). Invitations are the premium/notify layer — they
--   feed 1d-2 (notifications + invitation UX) and 1d-3 (matchmaker pass
--   that populates this table).
--
--   So this commit creates the table + RLS for OTHERS to start writing
--   into it. No JS path inserts here yet; service-role / future
--   matchmaker code will. Providers can READ their own invitations and
--   members can READ invitations on their own care_plans, so the next
--   commits can light up UI against this table immediately.
--
-- CONVENTIONS MIRRORED FROM plan_bids
-- (supabase/migrations/20260328_job_board.sql:94-138 +
--  20260619a_unify_verification_status.sql:75-127):
--   - uuid PK with gen_random_uuid() default
--   - FK care_plan_id → care_plans(id) ON DELETE CASCADE
--   - FK provider_id → auth.users(id) ON DELETE CASCADE
--     (NOT profiles — matches plan_bids convention; provider rows are
--     1:1 with auth.users via profiles.id)
--   - UNIQUE(care_plan_id, provider_id) — one invitation per provider
--     per plan; matchmaker idempotency relies on this
--   - Status CHECK with the lifecycle enum
--   - timestamptz audit columns (created_at / updated_at / invited_at +
--     responded_at)
--   - Per-FK + per-status indexes
--   - BEFORE UPDATE trigger to maintain updated_at
--   - RLS: provider-self verified policy + member-of-plan policy. NO
--     provider INSERT/UPDATE policy — matchmaker writes via service_role
--     (which bypasses RLS); admin via the role='admin' branch in the
--     EXISTS subquery on the SELECT policy.
--
-- LIFECYCLE STATES (status column):
--   'invited'       — matchmaker created the invitation (initial state)
--   'bid_submitted' — provider responded by placing a plan_bids row
--                     (1d-2 will set this; today no transition fires)
--   'declined'      — provider explicitly declined (1d-2 UX)
--   'expired'       — invitation aged out (1d-2 scheduled job)
--   'revoked'       — admin or matchmaker cancelled it
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS + CREATE POLICY, CREATE OR REPLACE FUNCTION for
-- the trigger function. Safe to re-run.
-- ============================================================================


-- ─── 1. plan_invitations table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_invitations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id  uuid        NOT NULL REFERENCES public.care_plans(id) ON DELETE CASCADE,
  provider_id   uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'invited'
                            CHECK (status IN ('invited', 'bid_submitted', 'declined', 'expired', 'revoked')),
  invited_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (care_plan_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_invitations_plan
  ON public.plan_invitations (care_plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_invitations_provider
  ON public.plan_invitations (provider_id);

CREATE INDEX IF NOT EXISTS idx_plan_invitations_status
  ON public.plan_invitations (status);


-- ─── 2. updated_at trigger ─────────────────────────────────────────────────
-- Mirrors update_plan_bid_updated_at (20260328_job_board.sql:130-138).
CREATE OR REPLACE FUNCTION public.update_plan_invitation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_invitation_updated_at ON public.plan_invitations;
CREATE TRIGGER trg_plan_invitation_updated_at
  BEFORE UPDATE ON public.plan_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_plan_invitation_updated_at();


-- ─── 3. Row-Level Security ─────────────────────────────────────────────────
ALTER TABLE public.plan_invitations ENABLE ROW LEVEL SECURITY;

-- Verified providers can READ their own invitations. Mirrors the plan_bids
-- "Verified providers can view own bids" policy (20260619a:115-127): the
-- same EXISTS subquery against profiles for role/verification/suspension,
-- with the admin bypass branch.
DROP POLICY IF EXISTS "Verified providers can view own invitations" ON public.plan_invitations;
CREATE POLICY "Verified providers can view own invitations" ON public.plan_invitations
  FOR SELECT
  USING (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'provider'
              AND verification_status = 'verified'
              AND suspended_at IS NULL)
        )
    )
  );

-- Members can READ invitations on their own care plans (so the member UI
-- can show "we invited N providers to your plan"). Mirrors the plan_bids
-- "Members can view bids on their care plans" policy from the 20260328
-- migration.
DROP POLICY IF EXISTS "Members can view invitations on their care plans" ON public.plan_invitations;
CREATE POLICY "Members can view invitations on their care plans" ON public.plan_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.care_plans
      WHERE id = plan_invitations.care_plan_id
        AND member_id = auth.uid()
    )
  );

-- No provider INSERT/UPDATE/DELETE policies — matchmaker writes via
-- service_role (which bypasses RLS). Admin writes also flow through
-- service_role admin endpoints, not direct table writes from a client JWT.
