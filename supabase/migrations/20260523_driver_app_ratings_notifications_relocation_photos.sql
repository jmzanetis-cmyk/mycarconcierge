-- ============================================================
-- Driver-app additions: ride_ratings, driver_notifications,
-- and the relocation-photos Storage bucket (private + RLS).
--
-- Source of the first two SQL bodies: the separate `mcc_driver`
-- Replit repo (scripts/sql/create-ride-ratings.sql and
-- create-driver-notifications.sql). Archived here so the MCC
-- repo has a record of every schema change applied to its
-- shared Supabase project.
--
-- Run against the MCC Supabase project (production).
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ride_ratings (from mcc_driver/scripts/sql/create-ride-ratings.sql)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ride_ratings (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id     UUID         NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  rater_id    TEXT         NOT NULL,
  rater_role  TEXT         NOT NULL CHECK (rater_role IN ('driver', 'member', 'admin')),
  rated_id    TEXT         NOT NULL,
  rated_role  TEXT         NOT NULL CHECK (rated_role IN ('driver', 'member')),
  stars       SMALLINT     NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ride_ratings_rater_ride_key
  ON public.ride_ratings (ride_id, rater_id);

CREATE INDEX IF NOT EXISTS ride_ratings_rated_id_idx
  ON public.ride_ratings (rated_id);

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS total_ratings INTEGER NOT NULL DEFAULT 0;

-- Lock the table down: only service_role (driver-app server) can read/write.
-- No policies = no access for anon/authenticated PostgREST clients.
ALTER TABLE public.ride_ratings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. driver_notifications (from mcc_driver/scripts/sql/create-driver-notifications.sql)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_notifications (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID         NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  type        TEXT         NOT NULL,
  title       TEXT         NOT NULL,
  body        TEXT         NOT NULL,
  data        JSONB,
  read        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS driver_notifications_driver_id_idx
  ON public.driver_notifications (driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS driver_notifications_unread_idx
  ON public.driver_notifications (driver_id, read)
  WHERE read = FALSE;

-- Lock the table down: only service_role (driver-app server) can read/write.
-- No policies = no access for anon/authenticated PostgREST clients.
-- Realtime subscriptions made with an anon/authenticated JWT will also see
-- zero rows; the driver-app server must broadcast via service_role or fan
-- out per-driver channels server-side.
ALTER TABLE public.driver_notifications ENABLE ROW LEVEL SECURITY;

-- Enable Realtime on driver_notifications (idempotent guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'driver_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_notifications';
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 3. relocation-photos Storage bucket (private) + RLS policies
--    Path convention: relocation-photos/{job_id}/{filename}
--    Access:  a driver may upload/read/update/delete an object
--    iff they are assigned (concierge_job_drivers) to the job
--    whose UUID is the first path segment.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('relocation-photos', 'relocation-photos', FALSE)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public;

-- Helper predicate (inlined): caller is an assigned driver on the
-- job whose UUID matches the first folder segment of the object name.
--   drivers.profile_id = auth.uid()
--   concierge_job_drivers.driver_id = drivers.id
--   concierge_job_drivers.job_id    = (storage.foldername(name))[1]::uuid

DROP POLICY IF EXISTS "relocation-photos: drivers read own jobs"   ON storage.objects;
DROP POLICY IF EXISTS "relocation-photos: drivers insert own jobs" ON storage.objects;
DROP POLICY IF EXISTS "relocation-photos: drivers update own jobs" ON storage.objects;
DROP POLICY IF EXISTS "relocation-photos: drivers delete own jobs" ON storage.objects;

CREATE POLICY "relocation-photos: drivers read own jobs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'relocation-photos'
    AND EXISTS (
      SELECT 1
      FROM public.concierge_job_drivers cjd
      JOIN public.drivers d ON d.id = cjd.driver_id
      WHERE d.profile_id = auth.uid()
        AND cjd.job_id = ((storage.foldername(name))[1])::uuid
    )
  );

CREATE POLICY "relocation-photos: drivers insert own jobs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'relocation-photos'
    AND EXISTS (
      SELECT 1
      FROM public.concierge_job_drivers cjd
      JOIN public.drivers d ON d.id = cjd.driver_id
      WHERE d.profile_id = auth.uid()
        AND cjd.job_id = ((storage.foldername(name))[1])::uuid
    )
  );

CREATE POLICY "relocation-photos: drivers update own jobs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'relocation-photos'
    AND EXISTS (
      SELECT 1
      FROM public.concierge_job_drivers cjd
      JOIN public.drivers d ON d.id = cjd.driver_id
      WHERE d.profile_id = auth.uid()
        AND cjd.job_id = ((storage.foldername(name))[1])::uuid
    )
  )
  WITH CHECK (
    bucket_id = 'relocation-photos'
    AND EXISTS (
      SELECT 1
      FROM public.concierge_job_drivers cjd
      JOIN public.drivers d ON d.id = cjd.driver_id
      WHERE d.profile_id = auth.uid()
        AND cjd.job_id = ((storage.foldername(name))[1])::uuid
    )
  );

CREATE POLICY "relocation-photos: drivers delete own jobs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'relocation-photos'
    AND EXISTS (
      SELECT 1
      FROM public.concierge_job_drivers cjd
      JOIN public.drivers d ON d.id = cjd.driver_id
      WHERE d.profile_id = auth.uid()
        AND cjd.job_id = ((storage.foldername(name))[1])::uuid
    )
  );
