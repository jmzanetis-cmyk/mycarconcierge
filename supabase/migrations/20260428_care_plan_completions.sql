-- Task #150 Light fix: care_plan_completions
-- Backs the rewritten Dispute Resolver and Payment Tracker after the
-- mythical `packages` table was removed in Task #149. Tracks the lifecycle
-- of a care plan AFTER a bid has been accepted: pending -> completed ->
-- (optional) disputed -> resolved.
--
-- Run this in Supabase Dashboard -> SQL Editor.

-- ============================================================
-- 1. TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.care_plan_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id UUID NOT NULL REFERENCES public.care_plans(id) ON DELETE CASCADE,
  accepted_bid_id UUID REFERENCES public.plan_bids(id) ON DELETE SET NULL,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'disputed', 'resolved', 'cancelled')),
  -- Money — informational only in Light fix (no Stripe integration).
  bid_amount NUMERIC(10,2),
  actual_paid_amount NUMERIC(10,2),
  payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'check', 'transfer', 'other')),
  -- Notes
  completion_notes TEXT,
  dispute_reason TEXT
    CHECK (dispute_reason IS NULL OR dispute_reason IN ('quality', 'incomplete', 'overcharged', 'no_show', 'damaged', 'other')),
  dispute_description TEXT,
  ai_resolution JSONB,
  admin_notes TEXT,
  -- Lifecycle timestamps
  completed_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A single care plan can only have one completion record (avoid duplicates).
  UNIQUE (care_plan_id)
);

-- ============================================================
-- 2. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cpc_member ON public.care_plan_completions(member_id);
CREATE INDEX IF NOT EXISTS idx_cpc_provider ON public.care_plan_completions(provider_id);
CREATE INDEX IF NOT EXISTS idx_cpc_status ON public.care_plan_completions(status);
CREATE INDEX IF NOT EXISTS idx_cpc_status_created ON public.care_plan_completions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpc_disputed ON public.care_plan_completions(status, disputed_at DESC) WHERE status = 'disputed';

-- ============================================================
-- 3. updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_care_plan_completion_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cpc_updated_at ON public.care_plan_completions;
CREATE TRIGGER trg_cpc_updated_at
  BEFORE UPDATE ON public.care_plan_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_care_plan_completion_updated_at();

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public.care_plan_completions ENABLE ROW LEVEL SECURITY;

-- Members can read their own completions.
DROP POLICY IF EXISTS "members_select_own_completions" ON public.care_plan_completions;
CREATE POLICY "members_select_own_completions"
  ON public.care_plan_completions
  FOR SELECT
  TO authenticated
  USING (member_id = auth.uid());

-- Providers can read completions where they were the assigned provider.
DROP POLICY IF EXISTS "providers_select_assigned_completions" ON public.care_plan_completions;
CREATE POLICY "providers_select_assigned_completions"
  ON public.care_plan_completions
  FOR SELECT
  TO authenticated
  USING (provider_id = auth.uid());

-- Members can insert a completion for their own care plan.
DROP POLICY IF EXISTS "members_insert_own_completions" ON public.care_plan_completions;
CREATE POLICY "members_insert_own_completions"
  ON public.care_plan_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    member_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.care_plans cp
      WHERE cp.id = care_plan_id
        AND cp.member_id = auth.uid()
    )
  );

-- Members do NOT get direct UPDATE access. All lifecycle transitions
-- (complete / dispute / resolve) flow through server endpoints in www/server.js
-- and netlify/functions/ai-ops-admin.js using the service-role key, which
-- bypasses RLS. Granting authenticated UPDATE here would let a member bypass
-- the server's field/state validation by calling Supabase directly with their
-- JWT and overwriting status, ai_resolution, admin_notes, timestamps, etc.
DROP POLICY IF EXISTS "members_update_own_completions" ON public.care_plan_completions;

-- Service role: full access (server-side admin code).
DROP POLICY IF EXISTS "service_role_full_access_cpc" ON public.care_plan_completions;
CREATE POLICY "service_role_full_access_cpc"
  ON public.care_plan_completions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.care_plan_completions TO authenticated;
GRANT ALL ON public.care_plan_completions TO service_role;
