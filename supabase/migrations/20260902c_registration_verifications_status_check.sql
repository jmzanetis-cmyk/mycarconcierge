-- ============================================================================
-- 20260902c — Fix registration_verifications_status_check to allow 'approved'
--
-- Root cause of the live "Failed to save verification" error, confirmed via
-- Netlify function logs for vehicle-verify:
--   ERROR [vehicle-verify] insert error: new row for relation
--   "registration_verifications" violates check constraint
--   "registration_verifications_status_check"
--
-- handleVerify() (netlify/functions/vehicle-verify.js) inserts status as
-- either 'approved' (score >= AUTO_THRESHOLD) or 'manual_review'. Every
-- clean, high-confidence match — like a member uploading their own,
-- perfectly legible registration — takes the 'approved' branch, which is
-- exactly the value the live check constraint rejects. handleUpdateVerification()
-- (the admin approve/reject endpoint) also requires status to be exactly
-- 'approved' or 'rejected', and www/admin.js's pending-review counter filters
-- on 'pending' and 'manual_review'. The constraint was evidently written (or
-- never updated) against an earlier version of this status set that didn't
-- include 'approved' — this is why the very first live auto-approve path hit
-- it immediately.
--
-- New constraint allows the full set of values the application code actually
-- writes or reads across the member-facing insert, the admin review update,
-- and the admin dashboard counter: pending, manual_review, approved, rejected.
-- ============================================================================

ALTER TABLE public.registration_verifications
  DROP CONSTRAINT IF EXISTS registration_verifications_status_check;

ALTER TABLE public.registration_verifications
  ADD CONSTRAINT registration_verifications_status_check
  CHECK (status IN ('pending', 'manual_review', 'approved', 'rejected'));

-- ============================================================================
-- End of 20260902c_registration_verifications_status_check.sql
-- ============================================================================

-- ============================================================================
-- Same class of bug, same root cause, on the parallel insurance verification
-- table — fixing proactively rather than waiting for the identical failure
-- to surface the next time insurance verification is exercised.
-- handleInsuranceVerify() (netlify/functions/vehicle-verify.js) writes status
-- as one of: 'approved', 'manual_review', 'expired' (lapsed policy).
-- handleUpdateInsuranceVerification() (admin review) requires 'approved' or
-- 'rejected'. New constraint covers the full set actually used in code.
-- ============================================================================

ALTER TABLE public.insurance_verifications
  DROP CONSTRAINT IF EXISTS insurance_verifications_status_check;

ALTER TABLE public.insurance_verifications
  ADD CONSTRAINT insurance_verifications_status_check
  CHECK (status IN ('pending', 'manual_review', 'approved', 'rejected', 'expired'));

-- ============================================================================
-- End of insurance_verifications status check fix
-- ============================================================================
