CREATE TABLE IF NOT EXISTS club_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES car_clubs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  activity_type text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);
-- no CHECK, no RLS.
