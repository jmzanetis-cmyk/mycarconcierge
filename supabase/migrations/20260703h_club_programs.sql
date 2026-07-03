-- ============================================================================
-- 20260703h — Car Club programs bolt-on: points, coupons, comp services.
--
-- Ports docs/specs/custody-and-car-clubs/car_club_programs_schema_corrected.sql
-- (reconciled against prod 2026-05-29) with fresh-replay guards so this file is
-- both a safe no-op against prod (which already has everything) AND clean on
-- fresh replay:
--   • CREATE EXTENSION IF NOT EXISTS pgcrypto (for gen_random_bytes)
--   • CREATE TYPE wrapped in DO $$ EXCEPTION WHEN duplicate_object $$ blocks
--   • CREATE TABLE IF NOT EXISTS
--   • CREATE INDEX IF NOT EXISTS (indexes given explicit names — spec used
--     auto-generated names which can't be guarded)
--   • CREATE OR REPLACE for all functions (unchanged from spec)
--   • DROP POLICY IF EXISTS before every CREATE POLICY
--   • ALTER PUBLICATION wrapped in DO $$ EXCEPTION $$ blocks
--
-- Deduplication:
--   • is_club_member() and is_club_provider() use CREATE OR REPLACE. is_club_member()
--     is also defined in 20260603d_fix_is_club_member.sql — later definition wins,
--     bodies are functionally identical. Safe.
--
-- RPCs:
--   • redeem_reward(p_club_id, p_reward_id) — 2-param, VERBATIM from the spec
--     (uses auth.uid() so callable from RLS contexts only, not service-role).
--   • redeem_reward_for_member(p_club_id, p_reward_id, p_member_id) — 3-param,
--     corrected 2026-07-02: replaced a prod version that referenced nonexistent
--     columns (points/ref_type/ref_id/points_spent). Now targets the spec/replay
--     schema columns (delta_points/source_ref/point_cost/voucher_code).
--
-- Removed the outer BEGIN/COMMIT wrapper from the spec — Supabase runs each
-- migration file inside its own transaction.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. FEATURE TOGGLES on the existing club row (default OFF = opt-in)
--    Redundant with 20260703a (which already creates car_clubs with these
--    columns); IF NOT EXISTS makes it a safe no-op after 20260703a.
-- ----------------------------------------------------------------------------
ALTER TABLE car_clubs ADD COLUMN IF NOT EXISTS points_enabled        boolean NOT NULL DEFAULT false;
ALTER TABLE car_clubs ADD COLUMN IF NOT EXISTS coupons_enabled       boolean NOT NULL DEFAULT false;
ALTER TABLE car_clubs ADD COLUMN IF NOT EXISTS comp_services_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE car_clubs ADD COLUMN IF NOT EXISTS punch_card_enabled    boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 1. ENUMS (each wrapped in DO/EXCEPTION for idempotency)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE club_ledger_reason AS ENUM ('earn_spend', 'redeem', 'adjustment', 'expire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE club_accrual_source AS ENUM ('mcc_processed', 'manual_entry');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE club_reward_kind AS ENUM ('merch', 'comp_service', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE club_redemption_status AS ENUM ('issued', 'fulfilled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE club_discount_type AS ENUM ('percent', 'flat');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE club_grant_status AS ENUM ('granted', 'used', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. AUTHZ HELPERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_club_provider(p_club_id uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM car_clubs c WHERE c.id = p_club_id AND c.provider_id = p_user);
$$;

-- Uses club_memberships (live table) with is_active filter.
-- Duplicates 20260603d_fix_is_club_member.sql — CREATE OR REPLACE, later wins.
CREATE OR REPLACE FUNCTION is_club_member(p_club_id uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_memberships m
    WHERE m.club_id = p_club_id AND m.member_id = p_user AND m.is_active = true
  );
$$;

-- ============================================================================
-- POINTS  (gated by car_clubs.points_enabled)
-- ============================================================================

-- 3. Per-club points config
CREATE TABLE IF NOT EXISTS club_points_config (
  club_id              uuid primary key references car_clubs(id) on delete cascade,
  points_per_dollar    numeric not null default 1,
  points_label         text not null default 'points',
  accrual_source       club_accrual_source not null default 'mcc_processed',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 4. APPEND-ONLY ledger. Balance = sum(delta_points) per (club, member).
CREATE TABLE IF NOT EXISTS club_points_ledger (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid not null references car_clubs(id) on delete cascade,
  member_id          uuid not null references auth.users(id),
  delta_points       int not null,
  reason             club_ledger_reason not null,
  dollars_spent_cents int,
  source_ref         text,
  created_at         timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS club_points_ledger_club_member_idx
  ON club_points_ledger (club_id, member_id);

-- 5. Provider-defined reward catalog.
CREATE TABLE IF NOT EXISTS club_rewards (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references car_clubs(id) on delete cascade,
  kind         club_reward_kind not null default 'merch',
  title        text not null,
  description  text,
  point_cost   int not null check (point_cost >= 0),
  image_url    text,
  inventory_qty int,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS club_rewards_active_idx
  ON club_rewards (club_id) WHERE active;

-- 6. Points redemptions — vouchers the provider fulfills.
--    Named club_points_redemptions (not club_reward_redemptions) to avoid
--    collision with the existing punch-card redemption table of that name.
CREATE TABLE IF NOT EXISTS club_points_redemptions (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references car_clubs(id) on delete cascade,
  member_id     uuid not null references auth.users(id),
  reward_id     uuid not null references club_rewards(id),
  point_cost    int not null,
  voucher_code  text not null,
  status        club_redemption_status not null default 'issued',
  redeemed_at   timestamptz not null default now(),
  fulfilled_at  timestamptz
);
CREATE INDEX IF NOT EXISTS club_points_redemptions_club_idx
  ON club_points_redemptions (club_id);
CREATE INDEX IF NOT EXISTS club_points_redemptions_member_idx
  ON club_points_redemptions (member_id);

-- ----------------------------------------------------------------------------
-- 6a. Points functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION club_points_balance(p_club_id uuid, p_member_id uuid)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(delta_points), 0)::int
  FROM club_points_ledger WHERE club_id = p_club_id AND member_id = p_member_id;
$$;

CREATE OR REPLACE FUNCTION accrue_points(
  p_club_id uuid, p_member_id uuid, p_amount_cents int, p_source_ref text
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg club_points_config%ROWTYPE; pts int;
BEGIN
  IF NOT (SELECT points_enabled FROM car_clubs WHERE id = p_club_id) THEN RETURN 0; END IF;
  SELECT * INTO cfg FROM club_points_config WHERE club_id = p_club_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  pts := floor((p_amount_cents / 100.0) * cfg.points_per_dollar)::int;
  IF pts <= 0 THEN RETURN 0; END IF;
  INSERT INTO club_points_ledger(club_id, member_id, delta_points, reason, dollars_spent_cents, source_ref)
  VALUES (p_club_id, p_member_id, pts, 'earn_spend', p_amount_cents, p_source_ref);
  RETURN pts;
END; $$;

-- 2-param redeem_reward — spec VERBATIM. Uses auth.uid() so callable from RLS
-- contexts only (not service-role). Kept for policy parity with the spec.
CREATE OR REPLACE FUNCTION redeem_reward(p_club_id uuid, p_reward_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r club_rewards%ROWTYPE; bal int; code text; rid uuid;
BEGIN
  IF NOT (SELECT points_enabled FROM car_clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Points are not enabled for this club.'; END IF;
  IF NOT is_club_member(p_club_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of this club.'; END IF;

  SELECT * INTO r FROM club_rewards WHERE id = p_reward_id AND club_id = p_club_id FOR UPDATE;
  IF NOT FOUND OR NOT r.active THEN RAISE EXCEPTION 'Reward unavailable.'; END IF;
  IF r.inventory_qty IS NOT NULL AND r.inventory_qty <= 0 THEN
    RAISE EXCEPTION 'Reward out of stock.'; END IF;

  bal := club_points_balance(p_club_id, auth.uid());
  IF bal < r.point_cost THEN RAISE EXCEPTION 'Not enough points (% of %).', bal, r.point_cost; END IF;

  INSERT INTO club_points_ledger(club_id, member_id, delta_points, reason, source_ref)
  VALUES (p_club_id, auth.uid(), -r.point_cost, 'redeem', p_reward_id::text);

  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  INSERT INTO club_points_redemptions(club_id, member_id, reward_id, point_cost, voucher_code)
  VALUES (p_club_id, auth.uid(), p_reward_id, r.point_cost, code)
  RETURNING id INTO rid;

  IF r.inventory_qty IS NOT NULL THEN
    UPDATE club_rewards SET inventory_qty = inventory_qty - 1 WHERE id = p_reward_id;
  END IF;
  RETURN rid;
END; $$;

-- ============================================================================
-- COUPONS  (gated by car_clubs.coupons_enabled)
-- ============================================================================
CREATE TABLE IF NOT EXISTS club_coupons (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references car_clubs(id) on delete cascade,
  code             text not null,
  title            text,
  discount_type    club_discount_type not null,
  discount_value   numeric not null,
  min_spend_cents  int,
  eligible_services text[],
  max_redemptions  int,
  per_member_limit int,
  starts_at        timestamptz,
  expires_at       timestamptz,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (club_id, code)
);
CREATE INDEX IF NOT EXISTS club_coupons_active_idx
  ON club_coupons (club_id) WHERE active;

CREATE TABLE IF NOT EXISTS club_coupon_redemptions (
  id                      uuid primary key default gen_random_uuid(),
  coupon_id               uuid not null references club_coupons(id) on delete cascade,
  club_id                 uuid not null references car_clubs(id) on delete cascade,
  member_id               uuid not null references auth.users(id),
  job_id                  uuid,
  amount_discounted_cents int,
  redeemed_at             timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS club_coupon_redemptions_coupon_idx
  ON club_coupon_redemptions (coupon_id);

-- ============================================================================
-- COMPLIMENTARY SERVICES  (gated by car_clubs.comp_services_enabled)
-- ============================================================================
CREATE TABLE IF NOT EXISTS club_comp_services (
  id                        uuid primary key default gen_random_uuid(),
  club_id                   uuid not null references car_clubs(id) on delete cascade,
  title                     text not null,
  description               text,
  service_type              text,
  condition_min_spend_cents int,
  per_member_limit          int,
  starts_at                 timestamptz,
  expires_at                timestamptz,
  active                    boolean not null default true,
  created_at                timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS club_comp_services_active_idx
  ON club_comp_services (club_id) WHERE active;

CREATE TABLE IF NOT EXISTS club_comp_service_grants (
  id              uuid primary key default gen_random_uuid(),
  comp_service_id uuid not null references club_comp_services(id) on delete cascade,
  club_id         uuid not null references car_clubs(id) on delete cascade,
  member_id       uuid not null references auth.users(id),
  job_id          uuid,
  status          club_grant_status not null default 'granted',
  granted_at      timestamptz not null default now(),
  used_at         timestamptz
);
CREATE INDEX IF NOT EXISTS club_comp_service_grants_club_idx
  ON club_comp_service_grants (club_id);

-- ----------------------------------------------------------------------------
-- 7. ROW-LEVEL SECURITY (ENABLE is idempotent; policies use DROP IF EXISTS)
-- ----------------------------------------------------------------------------
ALTER TABLE club_points_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_points_ledger       ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_rewards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_points_redemptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_coupons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_coupon_redemptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_comp_services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_comp_service_grants ENABLE ROW LEVEL SECURITY;

-- Provider manages everything for their own club.
DROP POLICY IF EXISTS prov_cfg     ON club_points_config;
CREATE POLICY prov_cfg     ON club_points_config      FOR ALL
  USING (is_club_provider(club_id, auth.uid())) WITH CHECK (is_club_provider(club_id, auth.uid()));

DROP POLICY IF EXISTS prov_rewards ON club_rewards;
CREATE POLICY prov_rewards ON club_rewards            FOR ALL
  USING (is_club_provider(club_id, auth.uid())) WITH CHECK (is_club_provider(club_id, auth.uid()));

DROP POLICY IF EXISTS prov_coupons ON club_coupons;
CREATE POLICY prov_coupons ON club_coupons            FOR ALL
  USING (is_club_provider(club_id, auth.uid())) WITH CHECK (is_club_provider(club_id, auth.uid()));

DROP POLICY IF EXISTS prov_comp    ON club_comp_services;
CREATE POLICY prov_comp    ON club_comp_services      FOR ALL
  USING (is_club_provider(club_id, auth.uid())) WITH CHECK (is_club_provider(club_id, auth.uid()));

-- Members read active offers for clubs they belong to.
DROP POLICY IF EXISTS mem_rewards ON club_rewards;
CREATE POLICY mem_rewards ON club_rewards       FOR SELECT
  USING (active AND is_club_member(club_id, auth.uid()));

DROP POLICY IF EXISTS mem_coupons ON club_coupons;
CREATE POLICY mem_coupons ON club_coupons       FOR SELECT
  USING (active AND is_club_member(club_id, auth.uid()));

DROP POLICY IF EXISTS mem_comp    ON club_comp_services;
CREATE POLICY mem_comp    ON club_comp_services FOR SELECT
  USING (active AND is_club_member(club_id, auth.uid()));

-- Members read their OWN ledger/redemptions/grants; providers read all for their club.
DROP POLICY IF EXISTS ledger_read ON club_points_ledger;
CREATE POLICY ledger_read ON club_points_ledger        FOR SELECT
  USING (member_id = auth.uid() OR is_club_provider(club_id, auth.uid()));

DROP POLICY IF EXISTS redem_read  ON club_points_redemptions;
CREATE POLICY redem_read  ON club_points_redemptions   FOR SELECT
  USING (member_id = auth.uid() OR is_club_provider(club_id, auth.uid()));

DROP POLICY IF EXISTS coupr_read  ON club_coupon_redemptions;
CREATE POLICY coupr_read  ON club_coupon_redemptions   FOR SELECT
  USING (member_id = auth.uid() OR is_club_provider(club_id, auth.uid()));

DROP POLICY IF EXISTS grant_read  ON club_comp_service_grants;
CREATE POLICY grant_read  ON club_comp_service_grants  FOR SELECT
  USING (member_id = auth.uid() OR is_club_provider(club_id, auth.uid()));

-- (Ledger/redemption WRITES flow through SECURITY DEFINER functions.)

-- ----------------------------------------------------------------------------
-- 8. REALTIME (guarded — swallows "table already in publication")
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE club_rewards;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE club_points_redemptions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE club_points_ledger;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE club_coupons;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE club_comp_services;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 9. redeem_reward_for_member (3-param) — service-role callable variant
--    Corrected 2026-07-02: replaced a prod version that referenced nonexistent columns.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.redeem_reward_for_member(p_club_id uuid, p_reward_id uuid, p_member_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r RECORD; v_balance INT; code TEXT; rid UUID;
BEGIN
  IF NOT public.is_club_member(p_club_id, p_member_id) THEN
    RAISE EXCEPTION 'Not an active club member';
  END IF;
  SELECT * INTO r FROM public.club_rewards
    WHERE id = p_reward_id AND club_id = p_club_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward not found or inactive'; END IF;
  IF r.inventory_qty IS NOT NULL AND r.inventory_qty <= 0 THEN
    RAISE EXCEPTION 'Reward out of stock'; END IF;
  SELECT COALESCE(SUM(delta_points), 0) INTO v_balance
    FROM public.club_points_ledger WHERE club_id = p_club_id AND member_id = p_member_id;
  IF v_balance < r.point_cost THEN
    RAISE EXCEPTION 'Insufficient points: have %, need %', v_balance, r.point_cost; END IF;
  INSERT INTO public.club_points_ledger (club_id, member_id, delta_points, reason, source_ref)
    VALUES (p_club_id, p_member_id, -r.point_cost, 'redeem', p_reward_id::text);
  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  INSERT INTO public.club_points_redemptions (club_id, member_id, reward_id, point_cost, voucher_code)
    VALUES (p_club_id, p_member_id, p_reward_id, r.point_cost, code) RETURNING id INTO rid;
  IF r.inventory_qty IS NOT NULL THEN
    UPDATE public.club_rewards SET inventory_qty = inventory_qty - 1 WHERE id = p_reward_id; END IF;
  RETURN rid;
END; $function$;
