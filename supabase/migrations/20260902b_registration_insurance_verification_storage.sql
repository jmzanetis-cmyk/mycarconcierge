-- ============================================================================
-- 20260902b — Storage buckets for vehicle ownership verification
--
-- The registration/insurance verification feature (vehicle-verify.js,
-- members-vehicles.js's uploadRegistrationDocument/extractInsuranceCard) has
-- been fully built at the application level, but neither storage bucket it
-- uploads to was ever provisioned in the database — there was no prior
-- migration creating 'registrations' or 'insurance-documents'. This is why
-- the very first live end-to-end test failed at the upload step with a
-- generic "Failed to upload document" error: the client's
-- supabaseClient.storage.from('registrations').upload(...) call had no
-- bucket to write into.
--
-- Both buckets are created PRIVATE (public: false) — these documents carry
-- name, VIN, plate, and address, so they should never be reachable by a
-- guessable public URL. This is safe for the registrations bucket in
-- particular because vehicle-verify.js's handleVerify() already reads the
-- file via the service-role storage client (added in 98b7cf1), which
-- bypasses bucket/RLS policy entirely and does not depend on the bucket
-- being public.
--
-- Path convention for both buckets: <ownerUserId>/<timestamp>_<filename>
-- (see uploadRegistrationDocument() and extractInsuranceCard() in
-- www/members-vehicles.js) — so the RLS predicate mirrors the existing
-- vehicle-photos policy: auth.uid()::text = first folder segment.
--
-- Template: 20260328_job_board.sql:242-261 (vehicle-photos bucket + policies).
-- ============================================================================

-- ------------------------------------------------------------
-- registrations
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('registrations', 'registrations', false, 10485760, ARRAY['image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "registrations: owner insert" ON storage.objects;
CREATE POLICY "registrations: owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'registrations' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "registrations: owner read" ON storage.objects;
CREATE POLICY "registrations: owner read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'registrations' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "registrations: owner delete" ON storage.objects;
CREATE POLICY "registrations: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'registrations' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------
-- insurance-documents
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('insurance-documents', 'insurance-documents', false, 10485760, ARRAY['image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "insurance-documents: owner insert" ON storage.objects;
CREATE POLICY "insurance-documents: owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'insurance-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "insurance-documents: owner read" ON storage.objects;
CREATE POLICY "insurance-documents: owner read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'insurance-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "insurance-documents: owner delete" ON storage.objects;
CREATE POLICY "insurance-documents: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'insurance-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- End of 20260902b_registration_insurance_verification_storage.sql
-- ============================================================================
