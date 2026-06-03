-- founder_commissions: add columns to support the 7-day maturation window
--
-- became_payable_at — set when the cron promotes a row from pending → payable.
--                     Used by the earnings API to report the exact clearance
--                     timestamp to founders (for rows still pending, the API
--                     derives it as created_at + 7 days).
--
-- voided_at         — set by the refund/dispute clawback handler when a
--                     commission is cancelled before it is paid out.

ALTER TABLE public.founder_commissions
  ADD COLUMN IF NOT EXISTS became_payable_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_at         TIMESTAMPTZ;

COMMENT ON COLUMN public.founder_commissions.became_payable_at IS
  'Timestamp when this commission cleared the 7-day maturation window and was '
  'promoted to payable status by the monthly payout cron.';

COMMENT ON COLUMN public.founder_commissions.voided_at IS
  'Timestamp when this commission was voided, either by a Stripe refund or '
  'dispute clawback before the commission was paid out.';
