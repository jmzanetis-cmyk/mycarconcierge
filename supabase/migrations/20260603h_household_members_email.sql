-- household_members had no email column, blocking all invitation inserts and
-- the pending-invitation lookup that filters by email.

ALTER TABLE public.household_members
  ADD COLUMN IF NOT EXISTS email text;
