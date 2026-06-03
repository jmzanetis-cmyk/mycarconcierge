-- fleets had only a SELECT policy; INSERT and UPDATE were blocked for all users,
-- meaning createFleet and fleet-settings edits always failed with RLS violations.

-- Owner can create their own fleet
CREATE POLICY "fleets_owner_insert" ON public.fleets
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Owner can update their own fleet
CREATE POLICY "fleets_owner_update" ON public.fleets
  FOR UPDATE
  USING (owner_id = auth.uid());
