-- fleets table was missing billing/address columns that createFleet always tried
-- to insert and loadFleetDetails always tried to read.

ALTER TABLE public.fleets
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS business_type text;
