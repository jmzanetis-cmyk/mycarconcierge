-- split_payments and split_participants had only SELECT policies; all INSERT
-- and UPDATE were blocked for both client and server paths. Service-role
-- functions bypassed this today, but client paths and future direct writes
-- were completely blocked.

-- split_payments: owner can create and update their own split
CREATE POLICY "split_payments_insert" ON public.split_payments
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "split_payments_update" ON public.split_payments
  FOR UPDATE USING (created_by = auth.uid());

-- split_participants: owner of the split can insert participants;
-- a participant can update their own row (e.g. status on payment)
CREATE POLICY "split_participants_insert" ON public.split_participants
  FOR INSERT WITH CHECK (
    split_payment_id IN (
      SELECT id FROM public.split_payments WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "split_participants_update_owner" ON public.split_participants
  FOR UPDATE USING (
    split_payment_id IN (
      SELECT id FROM public.split_payments WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "split_participants_update_self" ON public.split_participants
  FOR UPDATE USING (member_id = auth.uid());
