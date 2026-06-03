-- household_vehicle_access had no RLS policies at all, blocking all client-side access.
-- Policies mirror the household_members pattern:
--   owner of the household can do everything
--   active members of the household can read shared vehicles

ALTER TABLE public.household_vehicle_access ENABLE ROW LEVEL SECURITY;

-- Household owner: full access
CREATE POLICY "hva_owner_all" ON public.household_vehicle_access
  FOR ALL
  USING (
    household_id IN (
      SELECT id FROM public.households WHERE owner_id = auth.uid()
    )
  );

-- Active household members: read-only
CREATE POLICY "hva_member_select" ON public.household_vehicle_access
  FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
