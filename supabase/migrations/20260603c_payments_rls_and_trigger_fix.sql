-- Fix 1: Tighten payments_select_provider RLS policy.
--
-- Old: auth.uid() = provider_id
--   → any user listed as provider_id on a payment could read it,
--     regardless of bid status or approval.
--
-- New: auth.uid() = provider_id AND bids.status = 'accepted'
--   → provider can only see a payment once their bid is accepted.
--     This is when a real payment record is created in practice;
--     the gate prevents accidental early reads or manually-created rows
--     from leaking to unapproved/pending providers.

DROP POLICY IF EXISTS payments_select_provider ON public.payments;

CREATE POLICY payments_select_provider ON public.payments
  FOR SELECT
  USING (
    auth.uid() = provider_id
    AND EXISTS (
      SELECT 1 FROM public.bids b
      WHERE b.id        = payments.bid_id
        AND b.provider_id = auth.uid()
        AND b.status    = 'accepted'
    )
  );

-- Fix 2: Repair payments_block_delete_with_open_dispute trigger function.
--
-- Bug: referenced d.payment_id — a column that does not exist on disputes.
--   The disputes table has package_id, not payment_id.
-- Fix: join through payments.package_id → disputes.package_id.

CREATE OR REPLACE FUNCTION public.payments_block_delete_with_open_dispute()
RETURNS trigger AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN OLD;
  END IF;
  IF NOT public.payments_caller_is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete payments' USING ERRCODE = '42501';
  END IF;
  IF OLD.package_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.disputes d
    WHERE d.package_id = OLD.package_id
      AND d.status = 'open'
  ) THEN
    RAISE EXCEPTION
      'Cannot delete payment %: an open dispute on its package exists. Resolve the dispute first.', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
