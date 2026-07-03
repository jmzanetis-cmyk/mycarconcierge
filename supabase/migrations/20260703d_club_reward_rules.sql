CREATE TABLE IF NOT EXISTS club_reward_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES car_clubs(id) ON DELETE CASCADE,
  reward_name text NOT NULL,
  reward_description text,
  punches_required integer NOT NULL,
  reward_type text DEFAULT 'punch_card',
  is_active boolean DEFAULT true,
  valid_until timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT club_reward_rules_punches_required_check CHECK (punches_required > 0)
);
-- no RLS.
