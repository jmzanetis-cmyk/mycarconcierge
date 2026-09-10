-- Port split-pay onto care_plans (the live checkout path), replacing the
-- retired maintenance_packages/package-escrow wiring. See
-- 20260604d_maintenance_packages_split_payment_id.sql for the precedent on
-- the old table.
--
-- 1) care_plans.split_payment_id links a plan to its (at most one active)
--    split_payments row, same shape as the old maintenance_packages column.
-- 2) payment_status gets a new 'pending_split_payment' state: set when the
--    member opts to split the bill instead of authorizing the full card
--    charge themselves (see care-plans.js's handleAcceptBid -- a Stripe PI
--    for the full amount already exists at that point with payment_status
--    'requires_payment'; split-create.js cancels it and moves the plan into
--    this state while participants pay their shares).

ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS split_payment_id uuid REFERENCES public.split_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_care_plans_split_payment ON public.care_plans(split_payment_id);

ALTER TABLE public.care_plans DROP CONSTRAINT IF EXISTS care_plans_payment_status_check;
ALTER TABLE public.care_plans ADD CONSTRAINT care_plans_payment_status_check
  CHECK (payment_status IN ('none','requires_payment','pending_split_payment','held','captured','refunded','partially_refunded','disputed','cancelled','failed'));
