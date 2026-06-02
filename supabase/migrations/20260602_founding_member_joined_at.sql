-- Step 7B: founding member no-car onboarding path
-- is_founding_member (bool) already exists; add the timestamp.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS founding_member_joined_at timestamptz;
