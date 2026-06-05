-- 1. Add fuel_gauge to photo_angle enum
ALTER TYPE photo_angle ADD VALUE IF NOT EXISTS 'fuel_gauge';

-- 2. Add quality_passed and quality_meta to custody_photos (additive, nullable)
ALTER TABLE custody_photos
  ADD COLUMN IF NOT EXISTS quality_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS quality_meta   JSONB;

-- 3. Fix missing INSERT RLS policy on custody_attestations
--    Pattern: is_job_party(job_id) AND inserting party is the attesting party
CREATE POLICY ins_attestations ON custody_attestations
  FOR INSERT
  WITH CHECK (
    is_job_party(job_id, auth.uid())
    AND party_id = auth.uid()
  );

-- 4. custody_write storage INSERT policy already has is_job_party auth check
--    (confirmed in Step 0 reconciliation) -- no change needed.
