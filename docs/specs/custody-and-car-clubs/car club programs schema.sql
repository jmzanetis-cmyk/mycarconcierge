-- ============================================================================
-- MCC CAR CLUBS — PROVIDER PROGRAMS  (points · coupons · comp services)
-- ----------------------------------------------------------------------------
-- Bolts onto the EXISTING car_clubs / car_club_members tables and the
-- car-clubs.js Netlify functions. Every program is OPT-IN: toggles default
-- false, and a feature that's off creates zero rows. A club with all toggles
-- off is a valid plain branded club.
--
-- Points are PER-PROVIDER, not a global MCC currency — Chris's points live in
-- Chris's club, like the program at his counter. The provider funds the
-- rewards out of their own margin; MCC only tracks accrual (default: against
-- MCC-processed spend at that provider).
--
-- ⚠️ ASSUMPTIONS — verify against your real schema:
--   • car_clubs(id uuid pk, provider_id uuid -> auth.users / providers owner)
--   • car_club_members(club_id uuid, member_id uuid -> auth.users)
--   • If provider_id resolves through a providers table, adjust
--     is_club_provider() below — it's the only provider-link dependency.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. FEATURE TOGGLES on the existing club row (default OFF = opt-in)
-- ----------------------------------------------------------------------------
alter table car_clubs add column if not exists points_enabled        boolean not null default false;
alter table car_clubs add column if not exists coupons_enabled       boolean not null default false;
alter table car_clubs add column if not exists comp_services_enabled boolean not null default false;
alter table car_clubs add column if not exists punch_card_enabled    boolean not null default false;

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
create type club_ledger_reason as enum ('earn_spend', 'redeem', 'adjustment', 'expire');
create type club_accrual_source as enum ('mcc_processed', 'manual_entry');
create type club_reward_kind as enum ('merch', 'comp_service', 'other');
create type club_redemption_status as enum ('issued', 'fulfilled', 'cancelled');
create type club_discount_type as enum ('percent', 'flat');
create type club_grant_status as enum ('granted', 'used', 'expired', 'cancelled');

-- ----------------------------------------------------------------------------
-- 2. AUTHZ HELPERS  (the only provider-link dependency lives here)
-- ----------------------------------------------------------------------------
create or replace function is_club_provider(p_club_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from car_clubs c where c.id = p_club_id and c.provider_id = p_user);
$$;

create or replace function is_club_member(p_club_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from car_club_members m where m.club_id = p_club_id and m.member_id = p_user);
$$;

-- ============================================================================
-- POINTS  (gated by car_clubs.points_enabled)
-- ============================================================================

-- 3. Per-club points config — only exists when the provider turns points on.
create table club_points_config (
  club_id              uuid primary key references car_clubs(id) on delete cascade,
  points_per_dollar    numeric not null default 1,        -- earn rate
  points_label         text not null default 'points',    -- e.g. "Tony Bucks"
  accrual_source       club_accrual_source not null default 'mcc_processed',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 4. APPEND-ONLY ledger. Balance = sum(delta_points) per (club, member).
create table club_points_ledger (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid not null references car_clubs(id) on delete cascade,
  member_id          uuid not null references auth.users(id),
  delta_points       int not null,                 -- + earn, - redeem
  reason             club_ledger_reason not null,
  dollars_spent_cents int,                          -- set on earn_spend
  source_ref         text,                          -- payment id / redemption id
  created_at         timestamptz not null default now()
);
create index on club_points_ledger (club_id, member_id);

-- 5. Provider-defined reward catalog. Holds BOTH merch and comp-service rewards
--    that cost points. (Conditional/free comp perks live in section below.)
create table club_rewards (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references car_clubs(id) on delete cascade,
  kind         club_reward_kind not null default 'merch',
  title        text not null,
  description  text,
  point_cost   int not null check (point_cost >= 0),
  image_url    text,
  inventory_qty int,                                -- null = unlimited
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on club_rewards (club_id) where active;

-- 6. Redemptions → a voucher the provider fulfills at their location.
create table club_reward_redemptions (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references car_clubs(id) on delete cascade,
  member_id     uuid not null references auth.users(id),
  reward_id     uuid not null references club_rewards(id),
  point_cost    int not null,                       -- snapshot at redeem time
  voucher_code  text not null,
  status        club_redemption_status not null default 'issued',
  redeemed_at   timestamptz not null default now(),
  fulfilled_at  timestamptz
);
create index on club_reward_redemptions (club_id);
create index on club_reward_redemptions (member_id);

-- ----------------------------------------------------------------------------
-- 6a. Points functions (atomic; enforce toggle + balance)
-- ----------------------------------------------------------------------------
create or replace function club_points_balance(p_club_id uuid, p_member_id uuid)
returns int language sql stable as $$
  select coalesce(sum(delta_points), 0)::int
  from club_points_ledger where club_id = p_club_id and member_id = p_member_id;
$$;

-- Call from your payment-settlement webhook (service role) when an MCC-processed
-- charge to this provider succeeds. No-op unless points are enabled.
create or replace function accrue_points(
  p_club_id uuid, p_member_id uuid, p_amount_cents int, p_source_ref text
) returns int language plpgsql security definer set search_path = public as $$
declare cfg club_points_config%rowtype; pts int;
begin
  if not (select points_enabled from car_clubs where id = p_club_id) then return 0; end if;
  select * into cfg from club_points_config where club_id = p_club_id;
  if not found then return 0; end if;
  pts := floor((p_amount_cents / 100.0) * cfg.points_per_dollar)::int;
  if pts <= 0 then return 0; end if;
  insert into club_points_ledger(club_id, member_id, delta_points, reason, dollars_spent_cents, source_ref)
  values (p_club_id, p_member_id, pts, 'earn_spend', p_amount_cents, p_source_ref);
  return pts;
end; $$;

-- Member redeems a catalog item. Checks toggle, active, inventory, and balance
-- atomically, then writes the debit + the voucher. Returns the redemption id.
create or replace function redeem_reward(p_club_id uuid, p_reward_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r club_rewards%rowtype; bal int; code text; rid uuid;
begin
  if not (select points_enabled from car_clubs where id = p_club_id) then
    raise exception 'Points are not enabled for this club.'; end if;
  if not is_club_member(p_club_id, auth.uid()) then
    raise exception 'Not a member of this club.'; end if;

  select * into r from club_rewards where id = p_reward_id and club_id = p_club_id for update;
  if not found or not r.active then raise exception 'Reward unavailable.'; end if;
  if r.inventory_qty is not null and r.inventory_qty <= 0 then
    raise exception 'Reward out of stock.'; end if;

  bal := club_points_balance(p_club_id, auth.uid());
  if bal < r.point_cost then raise exception 'Not enough points (% of %).', bal, r.point_cost; end if;

  insert into club_points_ledger(club_id, member_id, delta_points, reason, source_ref)
  values (p_club_id, auth.uid(), -r.point_cost, 'redeem', p_reward_id::text);

  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  insert into club_reward_redemptions(club_id, member_id, reward_id, point_cost, voucher_code)
  values (p_club_id, auth.uid(), p_reward_id, r.point_cost, code)
  returning id into rid;

  if r.inventory_qty is not null then
    update club_rewards set inventory_qty = inventory_qty - 1 where id = p_reward_id;
  end if;
  return rid;
end; $$;

-- ============================================================================
-- COUPONS  (gated by car_clubs.coupons_enabled)
-- ============================================================================
create table club_coupons (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references car_clubs(id) on delete cascade,
  code             text not null,
  title            text,
  discount_type    club_discount_type not null,
  discount_value   numeric not null,                -- percent (0-100) or flat $
  min_spend_cents  int,
  eligible_services text[],                          -- null = any service
  max_redemptions  int,                              -- total cap, null = unlimited
  per_member_limit int,                              -- null = unlimited
  starts_at        timestamptz,
  expires_at       timestamptz,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (club_id, code)
);
create index on club_coupons (club_id) where active;

create table club_coupon_redemptions (
  id                    uuid primary key default gen_random_uuid(),
  coupon_id             uuid not null references club_coupons(id) on delete cascade,
  club_id               uuid not null references car_clubs(id) on delete cascade,
  member_id             uuid not null references auth.users(id),
  job_id                uuid,                          -- ref jobs(id) if you link it
  amount_discounted_cents int,
  redeemed_at           timestamptz not null default now()
);
create index on club_coupon_redemptions (coupon_id);

-- ============================================================================
-- COMPLIMENTARY SERVICES  (gated by car_clubs.comp_services_enabled)
-- Conditional/free perks (e.g. "free wash with any service over $X"), distinct
-- from comp services purchased with points (those go in club_rewards).
-- ============================================================================
create table club_comp_services (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid not null references car_clubs(id) on delete cascade,
  title               text not null,
  description         text,
  service_type        text,
  condition_min_spend_cents int,                      -- null = no minimum
  per_member_limit    int,                             -- null = unlimited
  starts_at           timestamptz,
  expires_at          timestamptz,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
create index on club_comp_services (club_id) where active;

create table club_comp_service_grants (
  id              uuid primary key default gen_random_uuid(),
  comp_service_id uuid not null references club_comp_services(id) on delete cascade,
  club_id         uuid not null references car_clubs(id) on delete cascade,
  member_id       uuid not null references auth.users(id),
  job_id          uuid,
  status          club_grant_status not null default 'granted',
  granted_at      timestamptz not null default now(),
  used_at         timestamptz
);
create index on club_comp_service_grants (club_id);

-- ----------------------------------------------------------------------------
-- 7. ROW-LEVEL SECURITY (defense-in-depth; your Netlify fns may use service role)
-- ----------------------------------------------------------------------------
alter table club_points_config        enable row level security;
alter table club_points_ledger        enable row level security;
alter table club_rewards              enable row level security;
alter table club_reward_redemptions   enable row level security;
alter table club_coupons              enable row level security;
alter table club_coupon_redemptions   enable row level security;
alter table club_comp_services        enable row level security;
alter table club_comp_service_grants  enable row level security;

-- Provider manages everything for their own club.
create policy prov_cfg     on club_points_config      for all using (is_club_provider(club_id, auth.uid())) with check (is_club_provider(club_id, auth.uid()));
create policy prov_rewards on club_rewards            for all using (is_club_provider(club_id, auth.uid())) with check (is_club_provider(club_id, auth.uid()));
create policy prov_coupons on club_coupons            for all using (is_club_provider(club_id, auth.uid())) with check (is_club_provider(club_id, auth.uid()));
create policy prov_comp    on club_comp_services      for all using (is_club_provider(club_id, auth.uid())) with check (is_club_provider(club_id, auth.uid()));

-- Members read active offers for clubs they belong to.
create policy mem_rewards on club_rewards       for select using (active and is_club_member(club_id, auth.uid()));
create policy mem_coupons on club_coupons       for select using (active and is_club_member(club_id, auth.uid()));
create policy mem_comp    on club_comp_services for select using (active and is_club_member(club_id, auth.uid()));

-- Members read their OWN ledger/redemptions/grants; providers read all for their club.
create policy ledger_read on club_points_ledger      for select using (member_id = auth.uid() or is_club_provider(club_id, auth.uid()));
create policy redem_read  on club_reward_redemptions for select using (member_id = auth.uid() or is_club_provider(club_id, auth.uid()));
create policy coupr_read  on club_coupon_redemptions for select using (member_id = auth.uid() or is_club_provider(club_id, auth.uid()));
create policy grant_read  on club_comp_service_grants for select using (member_id = auth.uid() or is_club_provider(club_id, auth.uid()));

-- (Ledger/redemption WRITES flow through the SECURITY DEFINER functions above,
--  so no member insert policy is needed on those tables.)

-- ----------------------------------------------------------------------------
-- 8. REALTIME (so a redeemed reward / new offer pushes to dashboards live)
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table club_rewards;
alter publication supabase_realtime add table club_reward_redemptions;
alter publication supabase_realtime add table club_points_ledger;
alter publication supabase_realtime add table club_coupons;
alter publication supabase_realtime add table club_comp_services;

commit;

-- ============================================================================
-- OPT-IN ENFORCEMENT — wire into car-clubs.js (not SQL):
--   • Provider config/create endpoints REJECT writes unless the matching
--     toggle is on (points_enabled / coupons_enabled / comp_services_enabled).
--   • Member-facing club GET returns ONLY the sections whose toggle is on, so a
--     zero-feature club renders branding + join with no empty reward shelves.
--   • accrue_points() already self-guards on points_enabled, so a provider who
--     never turned points on accrues nothing even if a payment fires.
-- TIE-IN: when a club member returns and books the same provider, grant the
--   provider their 3 bonus bid credits (existing logic) — independent of which
--   programs the club has enabled.
-- ============================================================================
