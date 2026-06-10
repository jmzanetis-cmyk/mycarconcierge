-- Task #419 — Add 'completed' to the care_plans.status allowed-values set.
--
-- The inline CHECK constraint in 20260328_job_board.sql only allows:
--   'open', 'awarded', 'expired', 'cancelled'
-- But agent-fleet-admin.js writes status='completed' after a successful
-- Stripe capture, and the DB silently rejects it (CHECK violation → the
-- UPDATE returns an error that the caller logs but does not surface to the
-- user, leaving the care plan permanently stuck in 'awarded').
--
-- Fix: drop the auto-named constraint and recreate it with 'completed'.
--
-- OPERATOR NOTE: run in Supabase Dashboard → SQL Editor.

ALTER TABLE public.care_plans
  DROP CONSTRAINT IF EXISTS care_plans_status_check;

ALTER TABLE public.care_plans
  ADD CONSTRAINT care_plans_status_check
  CHECK (status IN ('open', 'awarded', 'completed', 'expired', 'cancelled'));
