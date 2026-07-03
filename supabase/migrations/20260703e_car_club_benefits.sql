CREATE TABLE IF NOT EXISTS car_club_benefits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES car_clubs(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  benefit_type text NOT NULL,
  description text NOT NULL,
  value_text text,
  expiry_date date,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT car_club_benefits_benefit_type_check CHECK (benefit_type = ANY (ARRAY['coupon','points','discount','free_service','custom']))
);
CREATE INDEX IF NOT EXISTS car_club_benefits_club_idx ON car_club_benefits (club_id);
CREATE INDEX IF NOT EXISTS car_club_benefits_provider_idx ON car_club_benefits (provider_id);
-- no RLS.
