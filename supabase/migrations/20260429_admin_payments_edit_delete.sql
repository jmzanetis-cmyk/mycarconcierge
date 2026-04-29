-- Task #270: Let admins edit, delete, and export transaction history on the
-- Payments page.
--
-- Adds the bookkeeping `admin_note` column to payments, plus a BEFORE DELETE
-- trigger that prevents deletion of any payment row currently tied to an open
-- dispute (so dispute history isn't broken).
--
-- Why no full RLS lockdown on UPDATE/DELETE here:
--   The payments table is written to by member, provider, and admin flows
--   today (see members.js, members-packages.js, admin.html releasePayment),
--   all using the authenticated user's anon key without RLS. Wholesale
--   admin-only RLS would break those existing flows. The new admin Edit /
--   Delete UI lives on admin.html which already gates rendering on
--   `profiles.role = 'admin'` at page load (admin.html:918), mirroring how
--   `releasePayment` is admin-gated today. Future hardening should follow the
--   column-scoped trigger pattern from
--   20260428e_provider_writes_rls_lockdown.sql, applied per-column for
--   admin-only fields (admin_note, manual amount adjustments).
--
-- Run this in Supabase Dashboard -> SQL Editor.

-- ============================================================
-- 1. ADMIN NOTE COLUMN
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS admin_note text;

COMMENT ON COLUMN public.payments.admin_note IS
  'Free-text bookkeeping note set by admins via the Payments & Escrow Edit modal. Not shown to members or providers.';

-- ============================================================
-- 2. BLOCK DELETE WHILE A DISPUTE IS OPEN
-- ============================================================
CREATE OR REPLACE FUNCTION public.payments_block_delete_with_open_dispute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.disputes d
    WHERE d.payment_id = OLD.id
      AND d.status = 'open'
  ) THEN
    RAISE EXCEPTION
      'Cannot delete payment %: an open dispute references it. Resolve the dispute first.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS payments_block_delete_open_dispute ON public.payments;
CREATE TRIGGER payments_block_delete_open_dispute
  BEFORE DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_block_delete_with_open_dispute();
