-- Task #150: Close the spec gap for the marketplace payments tracking layer.
--
-- Adds two columns to care_plan_completions so the table fully matches the
-- spec ("metadata jsonb column" + "payout batch ID"):
--
--   metadata         — generic jsonb scratch space populated by the lifecycle
--                      endpoints (capture, refund, dispute, complete) so
--                      audit-trail context lives next to the row instead of
--                      only in ai_action_log.
--   payout_batch_id  — admin-assigned grouping label (e.g. weekly settlement
--                      run) so multiple captured completions can be tagged as
--                      paid out together. The actual provider payout happens
--                      via stripe transfer_data at capture time today; this
--                      column is the accounting handle on top.
--
-- Run this in Supabase Dashboard -> SQL Editor.

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS payout_batch_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cpc_payout_batch
  ON public.care_plan_completions(payout_batch_id)
  WHERE payout_batch_id IS NOT NULL;
