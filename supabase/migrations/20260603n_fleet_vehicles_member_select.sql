-- fleet_vehicles SELECT was restricted to the fleet owner only; active fleet
-- members could not read any vehicles in their fleet, rendering the vehicle
-- list empty for all non-owner users.

CREATE POLICY "fv_select_member" ON public.fleet_vehicles
  FOR SELECT
  USING (
    fleet_id IN (
      SELECT fleet_id FROM public.fleet_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
