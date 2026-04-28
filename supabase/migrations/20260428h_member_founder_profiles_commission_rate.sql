-- Task #158: Move the founder commission rate out of hardcoded email checks.
--
-- Adds a per-row commission_rate column to member_founder_profiles so admins
-- can manage rates from the founders panel instead of relying on hardcoded
-- "Chris Agrapidis" / "CHRISAGRAPIDIS" string matches inside server.js.
--
--   commission_rate — fraction of a referred provider's purchase that is paid
--                     to the referring founder. Defaults to 0.50 (50 %), the
--                     standard rate. Chris's row is backfilled to 0.90 to
--                     preserve the Founding Provider Partner Agreement
--                     compensation that the old hardcoded check produced.
--
-- A small audit table (commission_rate_history) is also created so the
-- existing /api/admin/founders/:id/commission and /commission-history
-- endpoints in www/server.js — and the founders panel in admin.html — can
-- log and surface every rate change.
--
-- Run this in Supabase Dashboard -> SQL Editor.

ALTER TABLE public.member_founder_profiles
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4,3) NOT NULL DEFAULT 0.50;

ALTER TABLE public.member_founder_profiles
  DROP CONSTRAINT IF EXISTS member_founder_profiles_commission_rate_range;

ALTER TABLE public.member_founder_profiles
  ADD CONSTRAINT member_founder_profiles_commission_rate_range
  CHECK (commission_rate >= 0 AND commission_rate <= 1);

-- Backfill Chris Agrapidis to the 90 % rate that the old hardcoded check
-- produced. Match by referral_code first (the canonical identifier) and fall
-- back to the email pattern that the previous string check used so we do not
-- miss the row regardless of how it was originally created.
UPDATE public.member_founder_profiles
   SET commission_rate = 0.90
 WHERE commission_rate < 0.90
   AND (
     referral_code = 'CHRISAGRAPIDIS'
     OR (
       email IS NOT NULL
       AND lower(email) LIKE '%chris%'
       AND lower(email) LIKE '%agrapidis%'
     )
   );

CREATE TABLE IF NOT EXISTS public.commission_rate_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id  UUID NOT NULL REFERENCES public.member_founder_profiles(id) ON DELETE CASCADE,
  admin_id    UUID,
  admin_email TEXT,
  old_rate    NUMERIC(4,3) NOT NULL,
  new_rate    NUMERIC(4,3) NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_rate_history_founder
  ON public.commission_rate_history(founder_id, created_at DESC);
