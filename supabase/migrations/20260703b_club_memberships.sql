CREATE TABLE IF NOT EXISTS club_memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES car_clubs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  is_active boolean DEFAULT true,
  joined_at timestamptz DEFAULT now(),
  CONSTRAINT club_memberships_club_id_member_id_key UNIQUE (club_id, member_id)
);
-- no RLS.
