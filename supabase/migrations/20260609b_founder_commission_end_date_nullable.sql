-- NULL commission_end_date means "lifetime" (grandfathered).
-- Drop the NOT NULL constraint so existing real founders can be exempted.
ALTER TABLE public.member_founder_profiles
  ALTER COLUMN commission_end_date DROP NOT NULL;

-- Grandfather the three real founders who enrolled under lifetime terms.
-- Test rows (Test Founder, Test Member Founder) are left with their 1-year dates.
UPDATE public.member_founder_profiles
   SET commission_end_date = NULL
 WHERE id IN (
   '2cd29cab-318c-46d5-954d-1b2e5694f684',  -- Nicholas J Pohl
   '1b2c60a6-5389-4ccb-8f5b-edf6b1debdab',  -- tevyn.alexander
   '21837a02-6df4-4cb8-b0f4-c5082e83acbd'   -- Chris Agrapidis (provider)
 );
