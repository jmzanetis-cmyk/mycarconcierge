-- fleet_members was missing a permissions column; addFleetMember always tried
-- to insert it, causing the insert to fail with an unknown column error.

ALTER TABLE public.fleet_members
  ADD COLUMN IF NOT EXISTS permissions jsonb;
