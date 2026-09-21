-- ============================================================================
-- 20260921h_preserve_job_records_on_account_delete.sql
--
-- Data-loss fix. Before this migration, deleting a member destroyed the
-- provider's business records for work already performed:
--
--   care_plans.member_id             -> auth.users ON DELETE CASCADE
--   plan_bids.care_plan_id           -> care_plans ON DELETE CASCADE
--   plan_bids.provider_id            -> auth.users ON DELETE CASCADE
--   care_plan_completions.care_plan_id -> care_plans ON DELETE CASCADE
--   care_plan_completions.member_id  -> auth.users ON DELETE CASCADE
--
-- So one member tapping "Delete my account" removed the job, every bid on
-- it, and the completion row holding the agreed amount, the amount actually
-- paid, the payment method and the dispute status. The provider lost their
-- invoice basis and their warranty record for work they had already done,
-- and MCC lost the evidence it would need in a chargeback.
--
-- The rest of account-deletion-core.js already gets this right — rides,
-- concierge_jobs, payments, escrow_payments, disputes, signed_agreements
-- are all anonymised rather than cascaded (see "Step 3: anonymise
-- financial/legal records"). care_plans and its children were simply never
-- added to that list. This migration makes the schema support the same
-- treatment, and the companion change to account-deletion-core.js performs
-- the anonymisation.
--
-- Shape of the fix: the counterparty FK becomes nullable ON DELETE SET
-- NULL, a *_deleted_at marker records that the counterparty is gone (as
-- opposed to never having been set), an identity snapshot keeps the
-- surviving side's record meaningful, and a CHECK constraint keeps the
-- pair honest so a row can never be silently orphaned.
--
-- Deliberately NOT changed: care_plan_completions.provider_id was already
-- ON DELETE SET NULL, and care_plan_completions.care_plan_id keeps its
-- CASCADE — a care plan deleted on purpose should still take its
-- completion with it. Only deletion *via the account* path changes.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- care_plans — the job itself
-- ---------------------------------------------------------------------------
ALTER TABLE public.care_plans
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.care_plans
  DROP CONSTRAINT IF EXISTS care_plans_member_id_fkey;

ALTER TABLE public.care_plans
  ADD CONSTRAINT care_plans_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS member_deleted_at TIMESTAMPTZ NULL;

-- A care plan always has either a live member or a record of when that
-- member deleted their account. Never neither.
ALTER TABLE public.care_plans
  DROP CONSTRAINT IF EXISTS care_plans_member_present_or_deleted;

ALTER TABLE public.care_plans
  ADD CONSTRAINT care_plans_member_present_or_deleted
  CHECK (member_id IS NOT NULL OR member_deleted_at IS NOT NULL);

-- ---------------------------------------------------------------------------
-- plan_bids — the provider's offer on that job
--
-- provider_id CASCADE meant a provider closing their account also erased
-- their bids from other people's jobs, including the accepted bid that a
-- completion row points at. Same treatment.
-- ---------------------------------------------------------------------------
ALTER TABLE public.plan_bids
  ALTER COLUMN provider_id DROP NOT NULL;

ALTER TABLE public.plan_bids
  DROP CONSTRAINT IF EXISTS plan_bids_provider_id_fkey;

ALTER TABLE public.plan_bids
  ADD CONSTRAINT plan_bids_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.plan_bids
  ADD COLUMN IF NOT EXISTS provider_deleted_at TIMESTAMPTZ NULL;

ALTER TABLE public.plan_bids
  DROP CONSTRAINT IF EXISTS plan_bids_provider_present_or_deleted;

ALTER TABLE public.plan_bids
  ADD CONSTRAINT plan_bids_provider_present_or_deleted
  CHECK (provider_id IS NOT NULL OR provider_deleted_at IS NOT NULL);

-- ---------------------------------------------------------------------------
-- care_plan_completions — the money record
-- ---------------------------------------------------------------------------
ALTER TABLE public.care_plan_completions
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.care_plan_completions
  DROP CONSTRAINT IF EXISTS care_plan_completions_member_id_fkey;

ALTER TABLE public.care_plan_completions
  ADD CONSTRAINT care_plan_completions_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS member_deleted_at   TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS provider_deleted_at TIMESTAMPTZ NULL;

ALTER TABLE public.care_plan_completions
  DROP CONSTRAINT IF EXISTS care_plan_completions_member_present_or_deleted;

ALTER TABLE public.care_plan_completions
  ADD CONSTRAINT care_plan_completions_member_present_or_deleted
  CHECK (member_id IS NOT NULL OR member_deleted_at IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Identity snapshots
--
-- Same pattern as signed_agreements.signer_email_snapshot (see
-- account-deletion-core.js): capture who the counterparty was BEFORE
-- breaking the link, so the surviving party's record still names the other
-- side. Without this a provider's completed job reads "someone paid $840",
-- which is useless for warranty or for a tax question years later.
--
-- Provider-side snapshot is the BUSINESS name, which is public information
-- a provider trades under, not personal data. Member-side snapshot is a
-- display name only — no email, no phone, no address — the minimum needed
-- for the provider to recognise the job.
-- ---------------------------------------------------------------------------
ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS member_name_snapshot            TEXT NULL,
  ADD COLUMN IF NOT EXISTS provider_business_name_snapshot TEXT NULL;

COMMENT ON COLUMN public.care_plan_completions.member_name_snapshot IS
  'Member display name captured at account deletion so the provider''s record stays meaningful. Written only by the deletion cascade.';
COMMENT ON COLUMN public.care_plan_completions.provider_business_name_snapshot IS
  'Provider business name captured at account deletion so the member''s record stays meaningful. Written only by the deletion cascade.';

-- ---------------------------------------------------------------------------
-- Indexes for the "counterparty is gone" queries admin/support will run.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_care_plans_member_deleted_at
  ON public.care_plans (member_deleted_at)
  WHERE member_deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_care_plan_completions_member_deleted_at
  ON public.care_plan_completions (member_deleted_at)
  WHERE member_deleted_at IS NOT NULL;

COMMIT;
