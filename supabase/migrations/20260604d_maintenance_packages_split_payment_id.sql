-- split-guest-confirm.js wrote split_payment_id to maintenance_packages but the
-- column did not exist, causing the completion handler to crash silently and
-- leaving the package unlinked from its split.

ALTER TABLE public.maintenance_packages
  ADD COLUMN IF NOT EXISTS split_payment_id uuid REFERENCES public.split_payments(id) ON DELETE SET NULL;
