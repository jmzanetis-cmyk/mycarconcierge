-- fleet_vehicles was missing columns that assignVehicleToFleet always wrote
-- and renderFleetVehicles always read, causing assign-vehicle to 400 and the
-- vehicle list to always render blank department/cost_center/notes fields.

ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS assignment_type text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
