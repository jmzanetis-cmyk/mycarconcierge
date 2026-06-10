-- Task #421: Provider dispute response on care_plan_completions.
-- Adds free-text provider_response + timestamp so providers can record
-- their side of a member-raised dispute before an admin steps in.
ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS provider_response TEXT;

ALTER TABLE public.care_plan_completions
  ADD COLUMN IF NOT EXISTS provider_responded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cpc_provider_response_at
  ON public.care_plan_completions(provider_responded_at DESC)
  WHERE provider_response IS NOT NULL;
