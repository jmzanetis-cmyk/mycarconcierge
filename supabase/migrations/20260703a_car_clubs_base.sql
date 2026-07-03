CREATE TABLE IF NOT EXISTS car_clubs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  logo_url text,
  banner_url text,
  welcome_message text,
  is_active boolean DEFAULT true,
  provider_suspended boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  vehicle_make text,
  vehicle_model text,
  region text,
  member_count integer DEFAULT 0,
  theme_color text DEFAULT '#C9A84C',
  rules_text text,
  points_enabled boolean NOT NULL DEFAULT false,
  coupons_enabled boolean NOT NULL DEFAULT false,
  comp_services_enabled boolean NOT NULL DEFAULT false,
  punch_card_enabled boolean NOT NULL DEFAULT false
);
-- prod has PK only on this table; no other indexes, no FKs, no RLS.
