-- Car Club Members join table
CREATE TABLE IF NOT EXISTS car_club_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id   UUID NOT NULL REFERENCES car_clubs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, member_id)
);

CREATE INDEX IF NOT EXISTS car_club_members_club_idx   ON car_club_members(club_id);
CREATE INDEX IF NOT EXISTS car_club_members_member_idx ON car_club_members(member_id);

ALTER TABLE car_club_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'car_club_members'
      AND policyname = 'Admins can manage car club members'
  ) THEN
    CREATE POLICY "Admins can manage car club members"
      ON car_club_members FOR ALL
      USING (auth.role() = 'authenticated');
  END IF;
END $$;
