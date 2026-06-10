-- fleet_members had only SELECT and admin-ALL policies; INSERT and UPDATE were
-- blocked, making addFleetMember and updateFleetMember/removeFleetMember fail.

-- Fleet owner can add members to their fleet
CREATE POLICY "fm_owner_insert" ON public.fleet_members
  FOR INSERT
  WITH CHECK (
    fleet_id IN (
      SELECT id FROM public.fleets WHERE owner_id = auth.uid()
    )
  );

-- Fleet owner can update (role changes, status changes) members in their fleet
CREATE POLICY "fm_owner_update" ON public.fleet_members
  FOR UPDATE
  USING (
    fleet_id IN (
      SELECT id FROM public.fleets WHERE owner_id = auth.uid()
    )
  );
