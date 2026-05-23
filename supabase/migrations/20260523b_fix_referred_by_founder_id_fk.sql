-- Fix profiles.referred_by_founder_id foreign-key target (Task #367)
--
-- The original FK `profiles_referred_by_founder_id_fkey` was created targeting
-- member_founder_profiles(id), but every application code path that writes or
-- reads referred_by_founder_id treats it as a member_founder_profiles.user_id
-- (i.e. the founder's auth.users.id). See:
--   * server.js (record_bid_pack_commission caller) — joins on user_id
--   * netlify/functions/agent-fleet-admin.js (Treasurer apply) — joins on user_id
--   * supabase/migrations/20260515b_record_bid_pack_commission.sql RPC — joins on user_id
--   * tests/founder-commission-rate-db-driven.spec.js — stores founderUserId
--
-- Today the column is NULL in production so the mismatch is invisible. The
-- first real founder referral write will hit FK error 23503 and silently fail
-- the founder commission flow. This migration repoints the FK at
-- member_founder_profiles(user_id), matching what the app already expects.

BEGIN;

-- Postgres FK targets must be backed by a unique or primary key constraint.
-- user_id is logically unique (one founder profile per auth user); add a
-- unique constraint if one doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.member_founder_profiles'::regclass
       AND contype IN ('u', 'p')
       AND conkey = ARRAY[
         (SELECT attnum
            FROM pg_attribute
           WHERE attrelid = 'public.member_founder_profiles'::regclass
             AND attname = 'user_id')
       ]
  ) THEN
    ALTER TABLE public.member_founder_profiles
      ADD CONSTRAINT member_founder_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_referred_by_founder_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_referred_by_founder_id_fkey
  FOREIGN KEY (referred_by_founder_id)
  REFERENCES public.member_founder_profiles(user_id)
  ON DELETE SET NULL;

COMMIT;
