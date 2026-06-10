-- ============================================================================
-- MCC CHAIN-OF-CUSTODY PHOTO VERIFICATION  +  RETURN-FEE  SCHEMA
-- ----------------------------------------------------------------------------
-- ONE source of truth. Runs ONCE on the shared Supabase project.
-- The member repo (mycarconcierge) and the driver repo (mcc_driver) both READ
-- this — they do NOT store evidence independently. The provider surface reads
-- it too. RLS below makes every party to a job see the same chain, and nobody
-- outside the job see anything.
--
-- ⚠️ ASSUMPTIONS — VERIFY THESE COLUMN NAMES AGAINST YOUR ACTUAL SCHEMA:
--   • A `jobs` table exists with: id (uuid), member_id (uuid -> auth.users),
--     and a way to resolve the provider's owning user. Below assumes
--     jobs.provider_user_id. If your provider link is jobs.provider_id ->
--     providers.owner_id, adjust is_job_party() accordingly (note inline).
--   • Drivers are NOT assumed to live in a separate table — a driver becomes a
--     "party" simply by being the releasing/receiving party on a handoff. This
--     captures every driver on multi-leg trips with zero extra bookkeeping.
--   • If column names differ, the ONLY thing you must edit is is_job_party().
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. ENUMS
-- ----------------------------------------------------------------------------
create type party_role as enum ('member', 'provider', 'driver');

-- The four canonical handoffs. Extensible (e.g. driver->driver relay).
create type handoff_leg as enum (
  'member_to_driver',   -- 1. pickup
  'driver_to_shop',     -- 2. drop-off
  'shop_to_driver',     -- 3. return after service
  'driver_to_member',   -- 4. delivery
  'driver_to_driver'    -- relay (optional)
);

create type handoff_status as enum (
  'pending',            -- created, not yet started
  'awaiting_receiver',  -- releaser submitted; receiver must accept/dispute
  'accepted',           -- receiver confirmed condition -> baseline locked
  'disputed'            -- receiver flagged a discrepancy
);

create type attestation_type as enum ('release', 'accept', 'dispute');

create type photo_angle as enum (
  'front','rear','driver_side','passenger_side','roof',
  'wheel_fl','wheel_fr','wheel_rl','wheel_rr',
  'interior_front','interior_rear','cargo','odometer','other'
);

create type dispute_type as enum (
  'new_damage',          -- damage appeared between two checkpoints
  'missing_item',        -- item that was present went missing in custody
  'condition_mismatch',  -- general disagreement on condition
  'cleaning_revealed'    -- the honest edge case: wash exposed pre-existing damage
);

create type dispute_status as enum (
  'open','under_review',
  'resolved_charged',           -- a custody segment owner is liable
  'resolved_no_fault',
  'resolved_cleaning_exception' -- revealed-by-cleaning, not charged to last custodian
);

create type fee_status as enum ('pending','authorized','paid','waived','refunded');

-- ----------------------------------------------------------------------------
-- 1. is_job_party()  — the lynchpin of cross-party access
-- ----------------------------------------------------------------------------
-- Returns true if the user is the job's member, the job's provider, or ANY
-- driver who appears on ANY handoff of that job. Everything else keys off this.
create or replace function is_job_party(p_job_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- member or provider on the job itself
    select 1 from jobs j
    where j.id = p_job_id
      and (j.member_id = p_user or j.provider_user_id = p_user)
      --  ^ if you use jobs.provider_id -> providers.owner_id instead, replace
      --    the provider_user_id check with an EXISTS against providers.
  )
  or exists (
    -- any driver attached to any handoff of this job
    select 1 from custody_handoffs h
    where h.job_id = p_job_id
      and (h.releasing_party_id = p_user or h.receiving_party_id = p_user)
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. custody_handoffs  — one row per handoff in the chain
-- ----------------------------------------------------------------------------
create table custody_handoffs (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references jobs(id) on delete cascade,
  sequence              int  not null,                 -- 1..N order in the chain
  leg                   handoff_leg not null,
  releasing_party_id    uuid not null references auth.users(id),
  releasing_party_role  party_role not null,
  receiving_party_id    uuid not null references auth.users(id),
  receiving_party_role  party_role not null,
  status                handoff_status not null default 'pending',
  -- GPS captured at the moment of physical handoff (lat/lng kept as plain
  -- doubles to avoid a PostGIS dependency; add geography later if you need it).
  handoff_lat           double precision,
  handoff_lng           double precision,
  handoff_gps_accuracy_m double precision,
  released_at           timestamptz,
  received_at           timestamptz,
  created_at            timestamptz not null default now(),
  unique (job_id, sequence)
);

create index on custody_handoffs (job_id);

-- ----------------------------------------------------------------------------
-- 3. custody_photos  — APPEND-ONLY evidence
-- ----------------------------------------------------------------------------
-- job_id is denormalized onto every evidence row so RLS never has to join.
create table custody_photos (
  id                uuid primary key default gen_random_uuid(),
  handoff_id        uuid not null references custody_handoffs(id) on delete cascade,
  job_id            uuid not null references jobs(id) on delete cascade,
  captured_by       uuid not null references auth.users(id),
  captured_by_role  party_role not null,
  angle             photo_angle not null,
  -- path inside the 'custody-evidence' bucket. CONVENTION (matters for storage
  -- RLS below):  custody/{job_id}/{handoff_id}/{photo_id}.jpg
  storage_path      text not null,
  captured_at       timestamptz not null,   -- client-reported capture time
  server_received_at timestamptz not null default now(),
  gps_lat           double precision,
  gps_lng           double precision,
  gps_accuracy_m    double precision,
  -- Live-camera claim. Enforce "no gallery upload" in the Capacitor camera
  -- layer; store the claim here so a faked one is at least auditable.
  live_capture      boolean not null default true,
  -- Quality + AI layer (filled by your edge function / model):
  quality_score     numeric,                -- 0..1, lower = harder to verify
  quality_flags     text[] default '{}',    -- {'too_dark','too_dirty','blurry','partial'}
  ai_diff_result    jsonb,                  -- diff vs the previous checkpoint
  created_at        timestamptz not null default now()
);

create index on custody_photos (handoff_id);
create index on custody_photos (job_id);

-- ----------------------------------------------------------------------------
-- 4. custody_attestations  — APPEND-ONLY. The legal spine.
-- ----------------------------------------------------------------------------
-- "Accepting the car certifies it was in this condition when I took it."
-- Inserted ONLY through the close functions below so status + attestation are
-- always atomic. Corrections never edit a row — they add a 'dispute'.
create table custody_attestations (
  id              uuid primary key default gen_random_uuid(),
  handoff_id      uuid not null references custody_handoffs(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete cascade,
  party_id        uuid not null references auth.users(id),
  party_role      party_role not null,
  type            attestation_type not null,
  condition_ok    boolean not null,         -- true on accept, false on dispute
  notes           text,
  attested_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index on custody_attestations (handoff_id);
create index on custody_attestations (job_id);

-- ----------------------------------------------------------------------------
-- 5. custody_disputes  — localizes new damage to a custody SEGMENT
-- ----------------------------------------------------------------------------
create table custody_disputes (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references jobs(id) on delete cascade,
  -- the receiving handoff where the discrepancy surfaced
  handoff_id          uuid not null references custody_handoffs(id),
  raised_by           uuid not null references auth.users(id),
  raised_by_role      party_role not null,
  type                dispute_type not null,
  description         text,
  -- the segment implicated = whoever held the car between the two checkpoints
  implicated_party_id uuid references auth.users(id),
  implicated_role     party_role,
  status              dispute_status not null default 'open',
  resolution_notes    text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index on custody_disputes (job_id);

-- ----------------------------------------------------------------------------
-- 6. return_fees  — left-item return (rideshare lost-item pattern)
-- ----------------------------------------------------------------------------
-- A member OR provider who left their own item in the driver's car pays a fee
-- that compensates the driver for the extra trip. DISTINCT from missing_item
-- in custody_disputes (that's loss/liability, not a fee).
create table return_fees (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references jobs(id) on delete cascade,
  item_owner_id        uuid not null references auth.users(id),  -- member or provider
  item_owner_role      party_role not null,
  driver_id            uuid not null references auth.users(id),  -- compensated party
  description          text,
  -- which interior checkpoint surfaced the item, if any
  discovered_in_handoff_id uuid references custody_handoffs(id),
  fee_amount_cents     int not null,
  status               fee_status not null default 'pending',
  stripe_payment_intent_id text,
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz
);

create index on return_fees (job_id);

-- ----------------------------------------------------------------------------
-- 7. IMMUTABILITY TRIGGERS (belt + suspenders alongside RLS)
-- ----------------------------------------------------------------------------
create or replace function block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Row is append-only; corrections must be added as new rows.';
end; $$;

create trigger photos_immutable
  before update or delete on custody_photos
  for each row execute function block_mutation();

create trigger attestations_immutable
  before update or delete on custody_attestations
  for each row execute function block_mutation();

-- ----------------------------------------------------------------------------
-- 8. CLOSE FUNCTIONS — enforce mutual attestation + sequential ordering
-- ----------------------------------------------------------------------------
-- A handoff at sequence N cannot be accepted until N-1 is accepted, so nothing
-- downstream proceeds on an unconfirmed leg.
create or replace function assert_prev_accepted(p_job_id uuid, p_sequence int)
returns void language plpgsql stable as $$
begin
  if p_sequence > 1 and exists (
    select 1 from custody_handoffs
    where job_id = p_job_id and sequence = p_sequence - 1
      and status <> 'accepted'
  ) then
    raise exception 'Previous handoff (seq %) is not yet accepted.', p_sequence - 1;
  end if;
end; $$;

-- Receiver accepts: locks this condition as the baseline for the next leg.
create or replace function close_handoff_accept(p_handoff_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare h custody_handoffs%rowtype;
begin
  select * into h from custody_handoffs where id = p_handoff_id for update;
  if not found then raise exception 'Handoff not found'; end if;
  if auth.uid() <> h.receiving_party_id then
    raise exception 'Only the receiving party may accept this handoff.';
  end if;
  perform assert_prev_accepted(h.job_id, h.sequence);

  insert into custody_attestations(handoff_id, job_id, party_id, party_role, type, condition_ok, notes)
  values (h.id, h.job_id, h.receiving_party_id, h.receiving_party_role, 'accept', true, p_notes);

  update custody_handoffs
    set status = 'accepted', received_at = now()
    where id = p_handoff_id;
end; $$;

-- Receiver disputes: records the dispute against the implicated custody segment.
create or replace function close_handoff_dispute(
  p_handoff_id uuid,
  p_type dispute_type,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare h custody_handoffs%rowtype; d_id uuid;
begin
  select * into h from custody_handoffs where id = p_handoff_id for update;
  if not found then raise exception 'Handoff not found'; end if;
  if auth.uid() <> h.receiving_party_id then
    raise exception 'Only the receiving party may dispute this handoff.';
  end if;

  insert into custody_attestations(handoff_id, job_id, party_id, party_role, type, condition_ok, notes)
  values (h.id, h.job_id, h.receiving_party_id, h.receiving_party_role, 'dispute', false, p_description);

  -- implicate the party who RELEASED into this handoff (held the prior segment)
  insert into custody_disputes(job_id, handoff_id, raised_by, raised_by_role, type,
                               description, implicated_party_id, implicated_role)
  values (h.job_id, h.id, h.receiving_party_id, h.receiving_party_role, p_type,
          p_description, h.releasing_party_id, h.releasing_party_role)
  returning id into d_id;

  update custody_handoffs set status = 'disputed', received_at = now()
    where id = p_handoff_id;
  return d_id;
end; $$;

-- ----------------------------------------------------------------------------
-- 9. ROW-LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table custody_handoffs     enable row level security;
alter table custody_photos       enable row level security;
alter table custody_attestations enable row level security;
alter table custody_disputes     enable row level security;
alter table return_fees          enable row level security;

-- SELECT: every party to the job sees the whole chain.
create policy sel_handoffs on custody_handoffs
  for select using (is_job_party(job_id, auth.uid()));
create policy sel_photos on custody_photos
  for select using (is_job_party(job_id, auth.uid()));
create policy sel_attest on custody_attestations
  for select using (is_job_party(job_id, auth.uid()));
create policy sel_disputes on custody_disputes
  for select using (is_job_party(job_id, auth.uid()));
create policy sel_fees on return_fees
  for select using (is_job_party(job_id, auth.uid()));

-- INSERT photos: you must be a party AND tagging yourself as the capturer.
create policy ins_photos on custody_photos
  for insert with check (
    is_job_party(job_id, auth.uid()) and captured_by = auth.uid()
  );

-- NOTE: attestations + handoff status changes have NO insert/update policy on
-- purpose. They flow ONLY through the SECURITY DEFINER close functions, which
-- enforce mutual-attestation, sequencing, and append-only correctness. RLS
-- absence = blocked for normal clients; the functions run with definer rights.

-- Disputes can also be raised post-hoc by any party (within your policy window)
create policy ins_disputes on custody_disputes
  for insert with check (
    is_job_party(job_id, auth.uid()) and raised_by = auth.uid()
  );

-- return_fees created server-side (edge fn / function); Stripe webhook updates
-- status via the service role, which bypasses RLS. No client insert/update.

-- ----------------------------------------------------------------------------
-- 10. STORAGE — bucket policies mirror is_job_party()
-- ----------------------------------------------------------------------------
-- Create the bucket once (private):
--   insert into storage.buckets (id, name, public) values
--     ('custody-evidence','custody-evidence', false)
--   on conflict do nothing;
--
-- Path convention:  custody/{job_id}/{handoff_id}/{photo_id}.jpg
-- foldername(name) -> {'custody', job_id, handoff_id} (1-indexed), so [2]=job_id.

create policy custody_read on storage.objects
  for select using (
    bucket_id = 'custody-evidence'
    and is_job_party(((storage.foldername(name))[2])::uuid, auth.uid())
  );

create policy custody_write on storage.objects
  for insert with check (
    bucket_id = 'custody-evidence'
    and is_job_party(((storage.foldername(name))[2])::uuid, auth.uid())
  );
-- (No update/delete policy on these objects -> evidence files are immutable.)

-- ----------------------------------------------------------------------------
-- 11. REALTIME — push handoff/dispute changes to all parties live
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table custody_handoffs;
alter publication supabase_realtime add table custody_photos;
alter publication supabase_realtime add table custody_attestations;
alter publication supabase_realtime add table custody_disputes;
alter publication supabase_realtime add table return_fees;

commit;

-- ============================================================================
-- POLICY RULES THAT LIVE OUTSIDE SQL (encode in your dispute-handling logic):
--  • "Cleaning-revealed" damage (dispute_type 'cleaning_revealed') is NOT
--    charged to the last custodian — protects an honest shop from being blamed
--    for REVEALING pre-existing damage rather than causing it.
--  • A panel flagged 'too_dirty' / 'too_dark' at a checkpoint is "not
--    inspectable" — new damage on that panel can't be pinned to the next
--    segment. Surface this to the receiver BEFORE they accept.
--  • Return fee vs. loss: left-your-own-item -> return_fees (you pay). Item
--    went missing in custody -> custody_disputes (liability, not a fee).
--  • Marketplace stance: this is EVIDENCE for your dispute process / insurer,
--    not MCC unilaterally adjudicating and paying out.
-- ============================================================================
