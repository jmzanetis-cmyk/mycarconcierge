-- ============================================================
-- My Car Concierge: Create refunds, split_payments, and split_participants tables
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. REFUNDS TABLE
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID,
  payment_intent_id TEXT,
  stripe_refund_id TEXT,
  amount_cents INTEGER NOT NULL,
  refund_type TEXT NOT NULL DEFAULT 'full',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_by UUID,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_package_id ON public.refunds(package_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_requested_by ON public.refunds(requested_by);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on refunds"
  ON public.refunds FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view their own refund requests"
  ON public.refunds FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());

-- 2. SPLIT PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.split_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL,
  created_by UUID NOT NULL,
  total_amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_payments_package_id ON public.split_payments(package_id);
CREATE INDEX IF NOT EXISTS idx_split_payments_status ON public.split_payments(status);
CREATE INDEX IF NOT EXISTS idx_split_payments_created_by ON public.split_payments(created_by);

ALTER TABLE public.split_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on split_payments"
  ON public.split_payments FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view split payments they created"
  ON public.split_payments FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- 3. SPLIT PARTICIPANTS TABLE
CREATE TABLE IF NOT EXISTS public.split_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  split_payment_id UUID NOT NULL REFERENCES public.split_payments(id) ON DELETE CASCADE,
  member_id UUID,
  email TEXT NOT NULL,
  display_name TEXT,
  amount_cents INTEGER NOT NULL,
  payment_intent_id TEXT,
  stripe_client_secret TEXT,
  status TEXT NOT NULL DEFAULT 'invited',
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_participants_split_payment_id ON public.split_participants(split_payment_id);
CREATE INDEX IF NOT EXISTS idx_split_participants_member_id ON public.split_participants(member_id);
CREATE INDEX IF NOT EXISTS idx_split_participants_email ON public.split_participants(email);
CREATE INDEX IF NOT EXISTS idx_split_participants_status ON public.split_participants(status);

ALTER TABLE public.split_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on split_participants"
  ON public.split_participants FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view their own split participations"
  ON public.split_participants FOR SELECT
  TO authenticated
  USING (member_id = auth.uid());
