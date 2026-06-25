-- ============================================================================
-- 20260625 — Storage privacy: RLS policies for vehicle-files + evidence buckets
--
-- STEP 1 OF 4 in the bucket privacy hardening (Jordan's plan):
--   Step 1 (THIS migration): write storage.objects RLS policies so they exist
--                            BUT the buckets stay PUBLIC for now. Policies are
--                            dormant while bucket.public = true.
--   Step 2 (separate CR):    swap client getPublicUrl() calls to createSignedUrl()
--                            at the 5 LIVE read sites discovered (supabaseclient.js,
--                            members-extras.js).
--   Step 3 (Studio/SQL):     flip buckets to private:
--                              UPDATE storage.buckets SET public=false
--                              WHERE id IN ('vehicle-files','evidence','key-exchange-photos');
--                            At this point, the policies below become enforcement.
--   Step 4:                  verification on live surfaces.
--
-- DELIBERATELY OUT OF SCOPE:
--   - key-exchange-photos: the only writer is dead code (www/providers.js,
--     not loaded by providers.html). Will be flipped private in Step 3 without
--     policies; the bucket is effectively orphan. If/when re-wired, add policies
--     in a follow-up migration.
--   - Bucket privacy flag: NOT toggled here. Buckets remain public until Step 3.
--   - Backfill: evidence bucket has zero existing rows (confirmed); no historical
--     URL→path migration needed.
--
-- All policies use DROP POLICY IF EXISTS ... CREATE POLICY for idempotent re-runs.
-- Templates: 20260328_job_board.sql:246-261 (vehicle-photos) and
--            20260523_driver_app_ratings_notifications_relocation_photos.sql:104-172
--            (relocation-photos).
-- ============================================================================

-- ------------------------------------------------------------
-- vehicle-files
--
-- Path conventions (per discovery of www/supabaseclient.js + www/members-extras.js):
--   <vehicleId>/<uuid>.<ext>            — vehicle photos          (uploadVehiclePhoto)
--   <vehicleId>/docs/<filename>         — vehicle documents       (uploadVehicleDocument)
--   diagnostic-media/<userId>/<uuid>.<ext> — AI diagnostic media  (members-extras.js)
--
-- Access model: the OWNING MEMBER only. A provider-on-accepted-job read path
-- does not exist in code today; if added later, extend the predicate then.
--
-- Predicate logic per object:
--   - If first segment == 'diagnostic-media': owner is the userId at segment 2
--     and must equal auth.uid().
--   - Otherwise: first segment is treated as a vehicle id; allow iff a row in
--     public.vehicles with that id has owner_id = auth.uid().
--
-- Text comparison (v.id::text vs first segment) avoids UUID-parse errors when
-- the segment is the literal string 'diagnostic-media' (not a UUID).
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "vehicle-files: owner read"   ON storage.objects;
DROP POLICY IF EXISTS "vehicle-files: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-files: owner update" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-files: owner delete" ON storage.objects;

CREATE POLICY "vehicle-files: owner read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'vehicle-files'
    AND (
      (
        (storage.foldername(name))[1] = 'diagnostic-media'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id::text = (storage.foldername(name))[1]
          AND v.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "vehicle-files: owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vehicle-files'
    AND (
      (
        (storage.foldername(name))[1] = 'diagnostic-media'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id::text = (storage.foldername(name))[1]
          AND v.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "vehicle-files: owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vehicle-files'
    AND (
      (
        (storage.foldername(name))[1] = 'diagnostic-media'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id::text = (storage.foldername(name))[1]
          AND v.owner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'vehicle-files'
    AND (
      (
        (storage.foldername(name))[1] = 'diagnostic-media'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id::text = (storage.foldername(name))[1]
          AND v.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "vehicle-files: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vehicle-files'
    AND (
      (
        (storage.foldername(name))[1] = 'diagnostic-media'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id::text = (storage.foldername(name))[1]
          AND v.owner_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- evidence
--
-- Path convention (per discovery of www/supabaseclient.js uploadEvidencePhoto):
--   <packageId>/<uuid>.<ext>   where packageId is a care_plans.id
--
-- LEGACY BRANCH INTENTIONALLY DROPPED:
--   An earlier draft also matched against public.maintenance_packages by
--   member_id OR provider_id. Schema verification (information_schema) in
--   Studio showed maintenance_packages has NO provider_id column — only
--   member_id, exclusive_provider_id, and accepted_bid_id (indirect joins).
--   The legacy branch would have failed at apply time with "column does not
--   exist". It also guards no data: the evidence bucket currently has zero
--   rows, the platform is migrating off maintenance_packages onto care_plans,
--   and all new evidence is filed against care_plans (which exposes a clean
--   provider_id). If we ever need legacy package coverage, it would require
--   a different join (e.g. via plan_bids/accepted_bid_id) and belongs in a
--   separate migration with explicit verification.
--
-- Access model:
--   SELECT: participants (member or accepted-provider on the care_plan).
--   INSERT: participants (mirrors SELECT — only a participant should add evidence).
--   UPDATE/DELETE: deliberately NOT granted to `authenticated`. Service-role
--                  (admin via Netlify functions) bypasses RLS and remains able
--                  to manage evidence. Absence of a policy = denied for normal
--                  roles, which is the intended posture (evidence is append-only
--                  from the user perspective; admin-only mutations).
--
-- Text comparison on id::text is safe and avoids UUID-parse errors for any
-- malformed first segment.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "evidence: participants read"   ON storage.objects;
DROP POLICY IF EXISTS "evidence: participants insert" ON storage.objects;

CREATE POLICY "evidence: participants read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evidence'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.care_plans cp
      WHERE cp.id::text = (storage.foldername(name))[1]
        AND (cp.member_id = auth.uid() OR cp.provider_id = auth.uid())
    )
  );

CREATE POLICY "evidence: participants insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.care_plans cp
      WHERE cp.id::text = (storage.foldername(name))[1]
        AND (cp.member_id = auth.uid() OR cp.provider_id = auth.uid())
    )
  );

-- ============================================================================
-- End of 20260625_storage_privacy_buckets.sql
--
-- Next: separate code CR replaces getPublicUrl() with createSignedUrl() at the
-- 5 live read sites. Then Jordan flips bucket.public to false in Studio.
-- ============================================================================
