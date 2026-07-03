CREATE TABLE IF NOT EXISTS car_club_return_bonuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES car_clubs(id) ON DELETE CASCADE,
  credits_granted integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS car_club_return_bonuses_window_idx ON car_club_return_bonuses (provider_id, member_id, created_at);
-- no RLS.
