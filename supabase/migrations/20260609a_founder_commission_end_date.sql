-- Add 1-year commission term to member_founder_profiles.
-- commission_end_date = the date after which no new commissions accrue.
-- Existing rows are backfilled to created_at + 1 year so the reconciler
-- can start enforcing the gate immediately without a manual data fix.

ALTER TABLE public.member_founder_profiles
  ADD COLUMN IF NOT EXISTS commission_end_date TIMESTAMPTZ;

-- Backfill all existing rows: term ends 1 year after profile creation.
UPDATE public.member_founder_profiles
   SET commission_end_date = created_at + INTERVAL '1 year'
 WHERE commission_end_date IS NULL;

-- Make it NOT NULL now that every row has a value.
ALTER TABLE public.member_founder_profiles
  ALTER COLUMN commission_end_date SET NOT NULL;

-- Default for future inserts: 1 year from the moment the row is created.
ALTER TABLE public.member_founder_profiles
  ALTER COLUMN commission_end_date SET DEFAULT NOW() + INTERVAL '1 year';
