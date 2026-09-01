-- ============================================================================
-- 20260901a — additional_work_requests: extend with upsell UX columns +
--             care_plan_id FK + refreshed RLS + widened status CHECK.
--
-- Reactivates the "Additional Work" / upsell approval flow (silently broken
-- since the Express→Netlify migration — the client wrote to upsell_requests
-- but that table is missing the money-path columns; nothing has ever inserted
-- because writes with non-existent columns get rejected by Postgrest).
--
-- Path C from investigation: build on additional_work_requests (which already
-- has the money-path shape: estimated_cost NOT NULL, payment_intent_id,
-- responded_at, approved_at, captured_at, capture_error). Add the update-type,
-- expiry, photos-URL, member-response, work-suspension columns that the live
-- provider modal (providers.js:3521-3605) and member list UI (members-core.js:
-- 1235-1531) expect. Add care_plan_id as a NULLABLE FK — server-side handler
-- REQUIRES it for update_type='cost_increase' (money path) but non-money
-- update types can operate without.
--
-- upsell_requests remains in the DB, untouched, 0 rows — no data-loss risk.
-- Client code will be re-pointed at additional_work_requests in the same PR.
--
-- Coverage note (2026-09-01): the 12 currently-"accepted" maintenance_packages
-- rows all predate the Aug 28 dual-write fix (0abb698) and none have
-- work_started_at set — they are stale test/seed data, not real active jobs.
-- No coverage gap for any real active job. See Step 2a of the investigation.
-- ============================================================================
BEGIN;

-- ── PART A ── new columns on additional_work_requests ───────────────────────
-- All ADD COLUMN IF NOT EXISTS so this migration is safely re-runnable.
-- All nullable except title (nullable initially so existing rows don't break;
-- new inserts pass NOT NULL via server-side validation).

ALTER TABLE additional_work_requests
  -- Care-plan link — required for money path, enforced server-side (nullable
  -- at DB level so historical rows and non-money update_types can co-exist).
  ADD COLUMN IF NOT EXISTS care_plan_id uuid REFERENCES care_plans(id) ON DELETE SET NULL,

  -- Member ownership — used for RLS + notification targeting. Server sets it
  -- on insert by looking up maintenance_packages.member_id. Cannot backfill
  -- via a FK-derived default here so it stays nullable + server-enforced.
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES profiles(id) ON DELETE CASCADE,

  -- Provider-authored summary line (upsell_requests had this; awr's original
  -- design used `description` alone).
  ADD COLUMN IF NOT EXISTS title text,

  -- Which of the 5 update types this row represents. Only 'cost_increase'
  -- follows the money path. The others are provider→member notifications
  -- (car_ready, work_paused, question, request_call).
  ADD COLUMN IF NOT EXISTS update_type text NOT NULL DEFAULT 'cost_increase',

  -- UX severity indicators.
  ADD COLUMN IF NOT EXISTS urgency text,
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_response boolean NOT NULL DEFAULT true,

  -- Provider-side deadline (client currently sets +4h for cost_increase,
  -- +24h for others; server enforces the same).
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,

  -- Member-side action + free-text response for question/reply flows.
  ADD COLUMN IF NOT EXISTS member_action text,
  ADD COLUMN IF NOT EXISTS member_response text,

  -- Provider-side "request a call back" signalling.
  ADD COLUMN IF NOT EXISTS call_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS call_completed boolean NOT NULL DEFAULT false,

  -- Provider "suspend work" state when member misses the response window.
  ADD COLUMN IF NOT EXISTS work_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,

  -- Photo URLs (upsell_requests used photo_urls; awr's original `photos`
  -- ARRAY column stays for backwards compat — server writes to photo_urls
  -- going forward).
  ADD COLUMN IF NOT EXISTS photo_urls text[],

  -- Rebid path: when a member declines by "get competing bids", a fresh
  -- maintenance_package is created and its id is recorded here.
  ADD COLUMN IF NOT EXISTS rebid_package_id uuid REFERENCES maintenance_packages(id) ON DELETE SET NULL,

  -- Timestamp of decline event (independent of the existing `responded_at`
  -- which the server writes on any member action).
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

-- ── PART B ── widen the existing status CHECK ───────────────────────────────
-- The pre-existing CHECK only allowed:
--   ('pending','authorization_pending','approved','declined','cancelled',
--    'captured','capture_failed')
-- We add 'rebid' and 'expired' for the two additional client-side terminal
-- states (upsell rebid to competing bids; expiry after 4h no-response).
-- No 'acknowledged' status — for non-money updates the row moves straight
-- to 'approved' (matching the current client behavior at members-core.js:1391).

ALTER TABLE additional_work_requests
  DROP CONSTRAINT IF EXISTS additional_work_requests_status_check;

ALTER TABLE additional_work_requests
  ADD CONSTRAINT additional_work_requests_status_check CHECK (
    status IN (
      'pending',
      'authorization_pending',
      'approved',
      'declined',
      'cancelled',
      'captured',
      'capture_failed',
      'rebid',
      'expired'
    )
  );

-- ── PART C ── update_type CHECK ─────────────────────────────────────────────

ALTER TABLE additional_work_requests
  DROP CONSTRAINT IF EXISTS additional_work_requests_update_type_check;

ALTER TABLE additional_work_requests
  ADD CONSTRAINT additional_work_requests_update_type_check CHECK (
    update_type IN ('cost_increase','car_ready','work_paused','question','request_call')
  );

-- ── PART D ── urgency CHECK (nullable ok) ───────────────────────────────────

ALTER TABLE additional_work_requests
  DROP CONSTRAINT IF EXISTS additional_work_requests_urgency_check;

ALTER TABLE additional_work_requests
  ADD CONSTRAINT additional_work_requests_urgency_check CHECK (
    urgency IS NULL OR urgency IN ('critical','recommended','optional')
  );

-- ── PART E ── indexes for the hot lookup paths ──────────────────────────────

CREATE INDEX IF NOT EXISTS additional_work_requests_member_id_status_idx
  ON additional_work_requests (member_id, status);

CREATE INDEX IF NOT EXISTS additional_work_requests_care_plan_id_status_idx
  ON additional_work_requests (care_plan_id, status);

CREATE INDEX IF NOT EXISTS additional_work_requests_provider_id_created_at_idx
  ON additional_work_requests (provider_id, created_at DESC);

-- ── PART F ── refreshed RLS ─────────────────────────────────────────────────
-- Existing policies were provider-only or member-through-package-join; drop
-- and replace with member/provider/admin participant policies that use the
-- new member_id column directly (faster + clearer).
--
-- Writes (INSERT / UPDATE / DELETE) go through the service-role netlify
-- function, so RLS only needs to gate SELECT + client-direct fallback reads.
-- We keep provider INSERT capability via RLS for defense-in-depth (in case
-- the client ever writes directly), matching upsell_requests' pattern.

ALTER TABLE additional_work_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS members_update_package_additional_work    ON additional_work_requests;
DROP POLICY IF EXISTS members_view_package_additional_work      ON additional_work_requests;
DROP POLICY IF EXISTS providers_create_additional_work          ON additional_work_requests;
DROP POLICY IF EXISTS providers_update_own_additional_work      ON additional_work_requests;
DROP POLICY IF EXISTS providers_view_own_additional_work        ON additional_work_requests;

-- SELECT: participant (member, provider) or admin.
CREATE POLICY awr_select_participant ON additional_work_requests
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR auth.uid() = member_id
    OR auth.uid() = provider_id
  );

-- INSERT: provider inserts under their own provider_id. The server function
-- runs under service_role and bypasses RLS anyway; this policy is here as
-- defense-in-depth for any accidental client-direct write.
CREATE POLICY awr_insert_provider ON additional_work_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = provider_id);

-- UPDATE: participant (member responding, provider suspending work).
-- Guarding client-direct edits — the server function operates as service_role.
CREATE POLICY awr_update_participant ON additional_work_requests
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = member_id
    OR auth.uid() = provider_id
  )
  WITH CHECK (
    auth.uid() = member_id
    OR auth.uid() = provider_id
  );

-- No DELETE policy — deletion is only via service_role (admin path). Clients
-- have no legitimate reason to delete rows.

COMMIT;

-- ============================================================================
-- POST-APPLY SMOKE (manual):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='additional_work_requests'
--     ORDER BY ordinal_position;
--   -- Expect: id, package_id, provider_id, description, photos, estimated_cost,
--   --         status, member_response_note, payment_intent_id, created_at,
--   --         responded_at, approved_at, captured_at, capture_error, updated_at,
--   --         care_plan_id, member_id, title, update_type, urgency, is_urgent,
--   --         requires_response, expires_at, member_action, member_response,
--   --         call_requested, call_completed, work_suspended, suspended_at,
--   --         photo_urls, rebid_package_id, declined_at.
--
--   SELECT policyname, cmd FROM pg_policies
--     WHERE tablename='additional_work_requests';
--   -- Expect: awr_select_participant, awr_insert_provider, awr_update_participant.
-- ============================================================================
