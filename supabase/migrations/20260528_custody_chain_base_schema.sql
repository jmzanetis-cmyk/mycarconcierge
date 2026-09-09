-- ============================================================================
-- Custody chain base schema — catch-up migration (2026-09-09)
-- ----------------------------------------------------------------------------
-- WHY THIS FILE EXISTS:
--   This schema has been LIVE in production (Supabase project ifbyjxuaclwmadqbjcyp,
--   "mcc-production") since 2026-05-29. It was applied by hand, pasting
--   docs/specs/custody-and-car-clubs/custody_chain_schema_corrected.sql
--   directly into the Supabase SQL editor, and was never committed to this
--   repo as a tracked migration. This file is that catch-up: it reproduces
--   the exact schema that is already live, written idempotently so it is
--   SAFE TO RUN AGAINST PRODUCTION (which already has all of this) as well
--   as against a fresh branch/environment that doesn't.
--
-- SOURCE OF TRUTH FOR THIS FILE:
--   docs/specs/custody-and-car-clubs/custody_chain_schema_corrected.sql
--   (content reproduced verbatim below, restructured only for idempotency —
--   no table/column/function/policy definitions were changed).
--
-- WHY handoff_leg AND photo_angle HAVE FEWER VALUES HERE THAN IN PRODUCTION:
--   This file intentionally reproduces the ORIGINAL 5-value handoff_leg enum
--   and the ORIGINAL 14-value photo_angle enum, matching what
--   custody_chain_schema_corrected.sql actually created on 2026-05-29.
--   Two more handoff_leg values (member_to_provider, provider_to_member) and
--   one more photo_angle value (fuel_gauge) were added later — those live in
--   their own catch-up migrations, alongside the already-tracked migrations
--   that depend on them, so each file maps cleanly to what actually happened:
--     20260529_option_b_concierge_jobs_package_bridge.sql  -> member_to_provider
--     20260530a_custody_handoff_leg_add_provider_to_member.sql -> provider_to_member
--     20260605a_custody_hardening.sql (already tracked)    -> fuel_gauge
--
-- IDEMPOTENCY NOTES:
--   - CREATE TYPE has no native IF NOT EXISTS -> wrapped in DO/EXCEPTION
--     WHEN duplicate_object.
--   - CREATE TABLE uses IF NOT EXISTS.
--   - Indexes are given explicit names (the original spec used unnamed
--     `create index on ...`) so CREATE INDEX IF NOT EXISTS can be used.
--   - CREATE POLICY has no native IF NOT EXISTS -> wrapped in DO/EXCEPTION
--     WHEN duplicate_object, one policy per DO block (a caught exception
--     stops execution for the rest of that block, so each policy needs its
--     own block or a pre-existing policy would silently block the ones
--     after it).
--   - CREATE OR REPLACE FUNCTION is natively idempotent.
--   - Triggers use DROP TRIGGER IF EXISTS + CREATE TRIGGER (no native
--     CREATE TRIGGER IF NOT EXISTS).
--   - ALTER TABLE ... ENABLE ROW LEVEL SECURITY is safe to re-run.
--   - The storage bucket insert uses ON CONFLICT (id) DO NOTHING (the
--     original spec only had this as a comment describing a manual step;
--     it is included here as live SQL since the bucket already exists in
--     production and this file needs to be able to create it elsewhere).
--   - Realtime publication membership has no IF NOT EXISTS form, so each
--     ADD TABLE is guarded by an explicit pg_publication_tables check.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE party_role AS ENUM ('member', 'provider', 'driver');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The original four canonical handoffs, as first shipped 2026-05-29.
-- (member_to_provider / provider_to_member are added by later migrations —
-- see the header note above.)
DO $$ BEGIN
  CREATE TYPE handoff_leg AS ENUM (
    'member_to_driver',   -- 1. pickup
    'driver_to_shop',     -- 2. drop-off
    'shop_to_driver',     -- 3. return after service
    'driver_to_member',   -- 4. delivery
    'driver_to_driver'    -- relay (optional)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE handoff_status AS ENUM (
    'pending',            -- created, not yet started
    'awaiting_receiver',  -- releaser submitted; receiver must accept/dispute
    'accepted',           -- receiver confirmed condition -> baseline locked
    'disputed'            -- receiver flagged a discrepancy
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE attestation_type AS ENUM ('release', 'accept', 'dispute');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Original 14 values (no fuel_gauge -- see header note above).
DO $$ BEGIN
  CREATE TYPE photo_angle AS ENUM (
    'front','rear','driver_side','passenger_side','roof',
    'wheel_fl','wheel_fr','wheel_rl','wheel_rr',
    'interior_front','interior_rear','cargo','odometer','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_type AS ENUM (
    'new_damage',          -- damage appeared between two checkpoints
    'missing_item',        -- item that was present went missing in custody
    'condition_mismatch',  -- general disagreement on condition
    'cleaning_revealed'    -- the honest edge case: wash exposed pre-existing damage
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_status AS ENUM (
    'open','under_review',
    'resolved_charged',           -- a custody segment owner is liable
    'resolved_no_fault',
    'resolved_cleaning_exception' -- revealed-by-cleaning, not charged to last custodian
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fee_status AS ENUM ('pending','authorized','paid','waived','refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 1. is_job_party()  — the lynchpin of cross-party access
-- ----------------------------------------------------------------------------
-- Returns true if the user is the job's member, the job's provider, or ANY
-- driver who appears on ANY handoff of that job. Everything else keys off this.
CREATE OR REPLACE FUNCTION is_job_party(p_job_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM concierge_jobs j
      WHERE j.id = p_job_id
        AND (j.member_id = p_user OR j.provider_id = p_user)
    )
    OR EXISTS (
      SELECT 1 FROM custody_handoffs h
      WHERE h.job_id = p_job_id
        AND (h.releasing_party_id = p_user OR h.receiving_party_id = p_user)
    )
  );
END; $$;

-- ----------------------------------------------------------------------------
-- 2. custody_handoffs  — one row per handoff in the chain
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custody_handoffs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid NOT NULL REFERENCES concierge_jobs(id) ON DELETE CASCADE,
  sequence              int  NOT NULL,                 -- 1..N order in the chain
  leg                   handoff_leg NOT NULL,
  releasing_party_id    uuid NOT NULL REFERENCES auth.users(id),
  releasing_party_role  party_role NOT NULL,
  receiving_party_id    uuid NOT NULL REFERENCES auth.users(id),
  receiving_party_role  party_role NOT NULL,
  status                handoff_status NOT NULL DEFAULT 'pending',
  handoff_lat           double precision,
  handoff_lng           double precision,
  handoff_gps_accuracy_m double precision,
  released_at           timestamptz,
  received_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_custody_handoffs_job_id ON custody_handoffs (job_id);

-- ----------------------------------------------------------------------------
-- 3. custody_photos  — APPEND-ONLY evidence
-- ----------------------------------------------------------------------------
-- job_id is denormalized onto every evidence row so RLS never has to join.
CREATE TABLE IF NOT EXISTS custody_photos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id        uuid NOT NULL REFERENCES custody_handoffs(id) ON DELETE CASCADE,
  job_id            uuid NOT NULL REFERENCES concierge_jobs(id) ON DELETE CASCADE,
  captured_by       uuid NOT NULL REFERENCES auth.users(id),
  captured_by_role  party_role NOT NULL,
  angle             photo_angle NOT NULL,
  -- path inside the 'custody-evidence' bucket. CONVENTION (matters for storage
  -- RLS below):  custody/{job_id}/{handoff_id}/{photo_id}.jpg
  storage_path      text NOT NULL,
  captured_at       timestamptz NOT NULL,   -- client-reported capture time
  server_received_at timestamptz NOT NULL DEFAULT now(),
  gps_lat           double precision,
  gps_lng           double precision,
  gps_accuracy_m    double precision,
  live_capture      boolean NOT NULL DEFAULT true,
  quality_score     numeric,                -- 0..1
  quality_flags     text[] DEFAULT '{}',    -- {'too_dark','too_dirty','blurry','partial'}
  ai_diff_result    jsonb,                  -- diff vs the previous checkpoint
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custody_photos_handoff_id ON custody_photos (handoff_id);
CREATE INDEX IF NOT EXISTS idx_custody_photos_job_id ON custody_photos (job_id);

-- ----------------------------------------------------------------------------
-- 4. custody_attestations  — APPEND-ONLY. The legal spine.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custody_attestations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id      uuid NOT NULL REFERENCES custody_handoffs(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES concierge_jobs(id) ON DELETE CASCADE,
  party_id        uuid NOT NULL REFERENCES auth.users(id),
  party_role      party_role NOT NULL,
  type            attestation_type NOT NULL,
  condition_ok    boolean NOT NULL,
  notes           text,
  attested_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custody_attestations_handoff_id ON custody_attestations (handoff_id);
CREATE INDEX IF NOT EXISTS idx_custody_attestations_job_id ON custody_attestations (job_id);

-- ----------------------------------------------------------------------------
-- 5. custody_disputes  — localizes new damage to a custody SEGMENT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custody_disputes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES concierge_jobs(id) ON DELETE CASCADE,
  handoff_id          uuid NOT NULL REFERENCES custody_handoffs(id),
  raised_by           uuid NOT NULL REFERENCES auth.users(id),
  raised_by_role      party_role NOT NULL,
  type                dispute_type NOT NULL,
  description         text,
  implicated_party_id uuid REFERENCES auth.users(id),
  implicated_role     party_role,
  status              dispute_status NOT NULL DEFAULT 'open',
  resolution_notes    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_custody_disputes_job_id ON custody_disputes (job_id);

-- ----------------------------------------------------------------------------
-- 6. return_fees  — left-item return (rideshare lost-item pattern)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS return_fees (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               uuid NOT NULL REFERENCES concierge_jobs(id) ON DELETE CASCADE,
  item_owner_id        uuid NOT NULL REFERENCES auth.users(id),
  item_owner_role      party_role NOT NULL,
  driver_id            uuid NOT NULL REFERENCES auth.users(id),
  description          text,
  discovered_in_handoff_id uuid REFERENCES custody_handoffs(id),
  fee_amount_cents     int NOT NULL,
  status               fee_status NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_return_fees_job_id ON return_fees (job_id);

-- ----------------------------------------------------------------------------
-- 7. IMMUTABILITY TRIGGERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Row is append-only; corrections must be added as new rows.';
END; $$;

DROP TRIGGER IF EXISTS photos_immutable ON custody_photos;
CREATE TRIGGER photos_immutable
  BEFORE UPDATE OR DELETE ON custody_photos
  FOR EACH ROW EXECUTE FUNCTION block_mutation();

DROP TRIGGER IF EXISTS attestations_immutable ON custody_attestations;
CREATE TRIGGER attestations_immutable
  BEFORE UPDATE OR DELETE ON custody_attestations
  FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- ----------------------------------------------------------------------------
-- 8. CLOSE FUNCTIONS — enforce mutual attestation + sequential ordering
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_prev_accepted(p_job_id uuid, p_sequence int)
RETURNS void LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_sequence > 1 AND EXISTS (
    SELECT 1 FROM custody_handoffs
    WHERE job_id = p_job_id AND sequence = p_sequence - 1
      AND status <> 'accepted'
  ) THEN
    RAISE EXCEPTION 'Previous handoff (seq %) is not yet accepted.', p_sequence - 1;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION close_handoff_accept(p_handoff_id uuid, p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE h custody_handoffs%ROWTYPE;
BEGIN
  SELECT * INTO h FROM custody_handoffs WHERE id = p_handoff_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handoff not found'; END IF;
  IF auth.uid() <> h.receiving_party_id THEN
    RAISE EXCEPTION 'Only the receiving party may accept this handoff.';
  END IF;
  PERFORM assert_prev_accepted(h.job_id, h.sequence);

  INSERT INTO custody_attestations(handoff_id, job_id, party_id, party_role, type, condition_ok, notes)
  VALUES (h.id, h.job_id, h.receiving_party_id, h.receiving_party_role, 'accept', true, p_notes);

  UPDATE custody_handoffs
    SET status = 'accepted', received_at = now()
    WHERE id = p_handoff_id;
END; $$;

CREATE OR REPLACE FUNCTION close_handoff_dispute(
  p_handoff_id uuid,
  p_type dispute_type,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE h custody_handoffs%ROWTYPE; d_id uuid;
BEGIN
  SELECT * INTO h FROM custody_handoffs WHERE id = p_handoff_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handoff not found'; END IF;
  IF auth.uid() <> h.receiving_party_id THEN
    RAISE EXCEPTION 'Only the receiving party may dispute this handoff.';
  END IF;

  INSERT INTO custody_attestations(handoff_id, job_id, party_id, party_role, type, condition_ok, notes)
  VALUES (h.id, h.job_id, h.receiving_party_id, h.receiving_party_role, 'dispute', false, p_description);

  INSERT INTO custody_disputes(job_id, handoff_id, raised_by, raised_by_role, type,
                               description, implicated_party_id, implicated_role)
  VALUES (h.job_id, h.id, h.receiving_party_id, h.receiving_party_role, p_type,
          p_description, h.releasing_party_id, h.releasing_party_role)
  RETURNING id INTO d_id;

  UPDATE custody_handoffs SET status = 'disputed', received_at = now()
    WHERE id = p_handoff_id;
  RETURN d_id;
END; $$;

-- ----------------------------------------------------------------------------
-- 9. ROW-LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE custody_handoffs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_photos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_disputes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_fees          ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY sel_handoffs ON custody_handoffs
    FOR SELECT USING (is_job_party(job_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY sel_photos ON custody_photos
    FOR SELECT USING (is_job_party(job_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY sel_attest ON custody_attestations
    FOR SELECT USING (is_job_party(job_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY sel_disputes ON custody_disputes
    FOR SELECT USING (is_job_party(job_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY sel_fees ON return_fees
    FOR SELECT USING (is_job_party(job_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT photos: you must be a party AND tagging yourself as the capturer.
DO $$ BEGIN
  CREATE POLICY ins_photos ON custody_photos
    FOR INSERT WITH CHECK (
      is_job_party(job_id, auth.uid()) AND captured_by = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Attestations + handoff status changes flow ONLY through the SECURITY DEFINER
-- close functions — no direct client insert policy needed.

DO $$ BEGIN
  CREATE POLICY ins_disputes ON custody_disputes
    FOR INSERT WITH CHECK (
      is_job_party(job_id, auth.uid()) AND raised_by = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- return_fees created server-side; Stripe webhook updates status via service role.

-- ----------------------------------------------------------------------------
-- 10. STORAGE — bucket + policies mirror is_job_party()
-- ----------------------------------------------------------------------------
-- Path convention:  custody/{job_id}/{handoff_id}/{photo_id}.jpg
-- foldername(name) -> {'custody', job_id, handoff_id} (1-indexed), so [2]=job_id.
--
-- The original spec doc only described this bucket creation in a comment
-- ("paste this manually"); it is live SQL here because the bucket already
-- exists in production this way and this migration needs to be able to
-- create it in any environment that doesn't have it yet.
INSERT INTO storage.buckets (id, name, public)
VALUES ('custody-evidence', 'custody-evidence', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY custody_read ON storage.objects
    FOR SELECT USING (
      bucket_id = 'custody-evidence'
      AND is_job_party(((storage.foldername(name))[2])::uuid, auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY custody_write ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'custody-evidence'
      AND is_job_party(((storage.foldername(name))[2])::uuid, auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 11. REALTIME
-- ----------------------------------------------------------------------------
-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form, and re-adding an
-- already-member table raises an error (not silently ignorable via a simple
-- EXCEPTION catch the way duplicate_object works for types/policies), so each
-- addition is guarded by an explicit membership check instead.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'custody_handoffs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE custody_handoffs;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'custody_photos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE custody_photos;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'custody_attestations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE custody_attestations;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'custody_disputes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE custody_disputes;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'return_fees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE return_fees;
  END IF;
END $$;

-- ============================================================================
-- POLICY RULES THAT LIVE OUTSIDE SQL (carried over from the source spec doc):
--  • "Cleaning-revealed" damage is NOT charged to the last custodian.
--  • A panel flagged 'too_dirty' / 'too_dark' is "not inspectable" — surface
--    this to the receiver BEFORE they accept.
--  • Left-your-own-item -> return_fees. Item went missing in custody ->
--    custody_disputes.
--  • This is EVIDENCE for your dispute process / insurer, not MCC
--    unilaterally adjudicating and paying out.
-- ============================================================================
