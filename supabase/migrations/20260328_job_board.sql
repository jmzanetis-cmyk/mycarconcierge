-- Task #92: Provider Job Board
-- care_plans, vehicle_photos, plan_bids + auto-bid profile columns
-- Run in Supabase SQL Editor

-- ============================================================
-- 1. AUTO-BID SETTINGS ON PROFILES
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_bid_enabled BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_bid_max_distance_miles INT DEFAULT 25;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_bid_service_types TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_bid_percent_of_estimate INT DEFAULT 85;

-- ============================================================
-- 2. CARE PLANS (multi-service plan auctions)
-- ============================================================
CREATE TABLE IF NOT EXISTS care_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  services JSONB NOT NULL DEFAULT '[]',
  value_min NUMERIC(10,2),
  value_max NUMERIC(10,2),
  service_types TEXT[] DEFAULT '{}',
  city TEXT,
  state TEXT,
  zip_code TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'awarded', 'expired', 'cancelled')),
  bid_count INT DEFAULT 0,
  bid_closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_care_plans_member ON care_plans(member_id);
CREATE INDEX IF NOT EXISTS idx_care_plans_vehicle ON care_plans(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_care_plans_status ON care_plans(status);
CREATE INDEX IF NOT EXISTS idx_care_plans_closes_at ON care_plans(bid_closes_at);
CREATE INDEX IF NOT EXISTS idx_care_plans_zip ON care_plans(zip_code);

-- Trigger: set bid_closes_at = now() + 72h on insert if null
CREATE OR REPLACE FUNCTION set_care_plan_closes_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bid_closes_at IS NULL THEN
    NEW.bid_closes_at := now() + INTERVAL '72 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_care_plan_closes_at ON care_plans;
CREATE TRIGGER trg_care_plan_closes_at
  BEFORE INSERT ON care_plans
  FOR EACH ROW EXECUTE FUNCTION set_care_plan_closes_at();

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION update_care_plan_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_care_plan_updated_at ON care_plans;
CREATE TRIGGER trg_care_plan_updated_at
  BEFORE UPDATE ON care_plans
  FOR EACH ROW EXECUTE FUNCTION update_care_plan_updated_at();

-- Add closing_soon_notified_at to prevent duplicate hourly notifications per plan
ALTER TABLE care_plans ADD COLUMN IF NOT EXISTS closing_soon_notified_at TIMESTAMPTZ;

-- ============================================================
-- 3. VEHICLE PHOTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicle_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle ON vehicle_photos(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_member ON vehicle_photos(member_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_primary ON vehicle_photos(vehicle_id, is_primary) WHERE is_primary = true;

-- ============================================================
-- 4. PLAN BIDS
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_bids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  is_auto_bid BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(care_plan_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_bids_plan ON plan_bids(care_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_bids_provider ON plan_bids(provider_id);
CREATE INDEX IF NOT EXISTS idx_plan_bids_status ON plan_bids(status);

-- Trigger: update bid_count on care_plans
CREATE OR REPLACE FUNCTION update_care_plan_bid_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE care_plans SET bid_count = bid_count + 1, updated_at = now() WHERE id = NEW.care_plan_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE care_plans SET bid_count = GREATEST(0, bid_count - 1), updated_at = now() WHERE id = OLD.care_plan_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_bid_count ON plan_bids;
CREATE TRIGGER trg_plan_bid_count
  AFTER INSERT OR DELETE ON plan_bids
  FOR EACH ROW EXECUTE FUNCTION update_care_plan_bid_count();

-- Trigger: updated_at for plan_bids
CREATE OR REPLACE FUNCTION update_plan_bid_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_plan_bid_updated_at ON plan_bids;
CREATE TRIGGER trg_plan_bid_updated_at
  BEFORE UPDATE ON plan_bids
  FOR EACH ROW EXECUTE FUNCTION update_plan_bid_updated_at();

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_bids ENABLE ROW LEVEL SECURITY;

-- care_plans policies
DROP POLICY IF EXISTS "Members manage own care plans" ON care_plans;
CREATE POLICY "Members manage own care plans" ON care_plans
  FOR ALL USING (member_id = auth.uid());

DROP POLICY IF EXISTS "Providers view open care plans" ON care_plans;
CREATE POLICY "Providers view open care plans" ON care_plans
  FOR SELECT USING (
    member_id = auth.uid()
    OR (
      status = 'open'
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('provider', 'admin')
          AND verification_status = 'verified'
      )
    )
  );

DROP POLICY IF EXISTS "Service role full care plans" ON care_plans;
CREATE POLICY "Service role full care plans" ON care_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- vehicle_photos policies
DROP POLICY IF EXISTS "Members manage own vehicle photos" ON vehicle_photos;
CREATE POLICY "Members manage own vehicle photos" ON vehicle_photos
  FOR ALL USING (member_id = auth.uid());

DROP POLICY IF EXISTS "Providers view photos for open plans" ON vehicle_photos;
CREATE POLICY "Providers view photos for open plans" ON vehicle_photos
  FOR SELECT USING (
    member_id = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM care_plans cp
        WHERE cp.vehicle_id = vehicle_photos.vehicle_id AND cp.status = 'open'
      )
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('provider', 'admin')
          AND verification_status = 'verified'
      )
    )
  );

DROP POLICY IF EXISTS "Service role full vehicle photos" ON vehicle_photos;
CREATE POLICY "Service role full vehicle photos" ON vehicle_photos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- plan_bids policies
DROP POLICY IF EXISTS "Providers manage own bids" ON plan_bids;
CREATE POLICY "Providers manage own bids" ON plan_bids
  FOR ALL USING (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('provider', 'admin')
    )
  );

DROP POLICY IF EXISTS "Members view bids on own plans" ON plan_bids;
CREATE POLICY "Members view bids on own plans" ON plan_bids
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM care_plans WHERE id = plan_bids.care_plan_id AND member_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full plan bids" ON plan_bids;
CREATE POLICY "Service role full plan bids" ON plan_bids
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 6. STORAGE BUCKET FOR VEHICLE PHOTOS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vehicle-photos', 'vehicle-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "Auth users upload vehicle photos" ON storage.objects;
CREATE POLICY "Auth users upload vehicle photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Private bucket: only the owning member can read their own photos (no public access)
DROP POLICY IF EXISTS "Public read vehicle photos" ON storage.objects;
DROP POLICY IF EXISTS "Owner read vehicle photos" ON storage.objects;
CREATE POLICY "Owner read vehicle photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Auth users delete own vehicle photos" ON storage.objects;
CREATE POLICY "Auth users delete own vehicle photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- 7. GRANTS
-- RLS enforces row-level access; table grants are restricted to only
-- what authenticated users may need via their RLS policies.
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON care_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vehicle_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_bids TO authenticated;
