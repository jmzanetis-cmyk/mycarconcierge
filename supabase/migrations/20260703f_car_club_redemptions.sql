CREATE TABLE IF NOT EXISTS car_club_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  benefit_id uuid NOT NULL REFERENCES car_club_benefits(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS car_club_redemptions_benefit_idx ON car_club_redemptions (benefit_id);
CREATE INDEX IF NOT EXISTS car_club_redemptions_member_idx ON car_club_redemptions (member_id);
-- NO UNIQUE constraint (single-redemption is app-enforced). no RLS.
