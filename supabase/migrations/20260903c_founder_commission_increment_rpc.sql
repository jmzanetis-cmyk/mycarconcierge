-- ============================================================================
-- 20260903c — increment_founder_commissions_paid RPC
--
-- Fixes Commission Payouts → "Complete Payout": completePayout() in
-- admin.js called supabaseClient.raw('total_commissions_paid + ?', [amount]),
-- a method that does not exist on the Supabase JS client — it threw every
-- time, but only AFTER founder_payouts.status had already been separately
-- written as 'completed'. So every completed payout left
-- member_founder_profiles.total_commissions_paid under-counted by that
-- payout's amount, while showing an error toast that made it look like
-- nothing happened. (Any payouts completed before this fix shipped may
-- need a one-off reconciliation query against founder_payouts to
-- back-fill the missing total.)
--
-- PostgREST/the Supabase JS client has no expression-based UPDATE
-- (`col = col + x`) — that's exactly why the original code reached for the
-- nonexistent .raw() escape hatch. A SECURITY DEFINER RPC is the correct
-- way to do this atomically: the UPDATE itself is already atomic per row,
-- this function just gives the client a safe, callable entry point to it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_founder_commissions_paid(p_founder_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    caller_is_admin := true;
  ELSE
    SELECT (role = 'admin') INTO caller_is_admin
      FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF NOT COALESCE(caller_is_admin, false) THEN
    RAISE EXCEPTION 'Only admins can adjust founder commission totals'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.member_founder_profiles
     SET total_commissions_paid = COALESCE(total_commissions_paid, 0) + p_amount,
         updated_at = now()
   WHERE id = p_founder_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_founder_commissions_paid(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_founder_commissions_paid(uuid, numeric) TO authenticated;

-- ============================================================================
-- End of 20260903c_founder_commission_increment_rpc.sql
-- ============================================================================
