-- Task #320 — Block duplicate Treasurer proposals at the database layer.
--
-- Task #320 added an application-level idempotency guard to
-- netlify/functions/agent-treasurer.js: before calling Claude the handler
-- looks up agent_actions for an existing proposed/executed/approved
-- review row tied to the same event_id (or the same payment_id /
-- payout_id / care_plan_id keys in decision.payload, scoped by
-- event_type) and short-circuits when one is found. That handles the
-- common case (sequential retries / replays of the same payment.captured
-- / payment.refund_requested / payout.failed event), but two
-- near-simultaneous invocations can both pass the check, both call
-- Claude, and both INSERT a `proposed` row before either commits — the
-- same check-then-act race Matchmaker hit in Task #195.
--
-- These unique partial indexes close that race at the storage layer:
-- Postgres will refuse the second INSERT with a 23505 unique-violation,
-- and the treasurer handler turns that into a successful
-- "already_reviewed" short-circuit (see netlify/functions/agent-treasurer.js).
--
-- One index per event_type so capture and refund-requested can both
-- exist for the same payment_id (they're distinct lifecycle events and
-- both must be reviewable). Conditions in the WHERE clauses mirror the
-- application-level dedupe contract:
--   - agent_slug = 'treasurer' AND action_type = 'review' — only the
--     review rows the treasurer handler itself writes (apply rows live
--     under action_type='apply' and are written by agent-fleet-admin.js).
--   - status IN ('proposed','executed') — non-terminal rows. A previous
--     `skipped` (e.g. dedupe short-circuit, spend-cap) or `error` row
--     must NOT block a fresh attempt.
--   - decision->>'event_type' matches the index's event scope.
--   - The relevant payload key (payment_id / payout_id) IS NOT NULL.
--     Defensive: skip the index entry if for any reason the path is null.

-- Pre-index cleanup: any (event_type, key) tuple that already has more
-- than one proposed/executed treasurer review row in production is a
-- survivor of the very race this migration is closing. Without
-- remediation the CREATE UNIQUE INDEX statements below would abort. We
-- keep the newest row (the one most likely surfaced in the operator
-- review queue) and demote the older duplicates to status='skipped'
-- with a marker in decision.dedupe_source so they remain auditable.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY decision ->> 'event_type',
                        decision -> 'payload' ->> 'payment_id'
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM public.agent_actions
   WHERE agent_slug = 'treasurer'
     AND action_type = 'review'
     AND status IN ('proposed', 'executed')
     AND decision ->> 'event_type' IN ('payment.captured', 'payment.refund_requested')
     AND decision -> 'payload' ->> 'payment_id' IS NOT NULL
)
UPDATE public.agent_actions a
   SET status = 'skipped',
       decision = COALESCE(a.decision, '{}'::jsonb)
                  || jsonb_build_object(
                       'dedupe_source', 'migration_20260514b_backfill',
                       'previous_status', a.status
                     )
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY decision -> 'payload' ->> 'payout_id'
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM public.agent_actions
   WHERE agent_slug = 'treasurer'
     AND action_type = 'review'
     AND status IN ('proposed', 'executed')
     AND decision ->> 'event_type' = 'payout.failed'
     AND decision -> 'payload' ->> 'payout_id' IS NOT NULL
)
UPDATE public.agent_actions a
   SET status = 'skipped',
       decision = COALESCE(a.decision, '{}'::jsonb)
                  || jsonb_build_object(
                       'dedupe_source', 'migration_20260514b_backfill',
                       'previous_status', a.status
                     )
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_treasurer_review_unique_payment_captured
  ON public.agent_actions ((decision -> 'payload' ->> 'payment_id'))
  WHERE agent_slug = 'treasurer'
    AND action_type = 'review'
    AND status IN ('proposed', 'executed')
    AND decision ->> 'event_type' = 'payment.captured'
    AND decision -> 'payload' ->> 'payment_id' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_treasurer_review_unique_refund_requested
  ON public.agent_actions ((decision -> 'payload' ->> 'payment_id'))
  WHERE agent_slug = 'treasurer'
    AND action_type = 'review'
    AND status IN ('proposed', 'executed')
    AND decision ->> 'event_type' = 'payment.refund_requested'
    AND decision -> 'payload' ->> 'payment_id' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_treasurer_review_unique_payout_failed
  ON public.agent_actions ((decision -> 'payload' ->> 'payout_id'))
  WHERE agent_slug = 'treasurer'
    AND action_type = 'review'
    AND status IN ('proposed', 'executed')
    AND decision ->> 'event_type' = 'payout.failed'
    AND decision -> 'payload' ->> 'payout_id' IS NOT NULL;

-- care_plan_id-scoped backstops for payment events. The application
-- guard treats care_plan_id as a dedupe key (some upstream producers
-- emit payment.captured / payment.refund_requested with care_plan_id
-- but no payment_id yet — e.g. an early webhook fires before the PI is
-- attached to the completion row). Without these indexes, two
-- concurrent invocations on such a payload could both pass the app
-- guard and both insert. Same backfill pattern as above.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY decision ->> 'event_type',
                        decision -> 'payload' ->> 'care_plan_id'
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM public.agent_actions
   WHERE agent_slug = 'treasurer'
     AND action_type = 'review'
     AND status IN ('proposed', 'executed')
     AND decision ->> 'event_type' IN ('payment.captured', 'payment.refund_requested')
     AND decision -> 'payload' ->> 'care_plan_id' IS NOT NULL
)
UPDATE public.agent_actions a
   SET status = 'skipped',
       decision = COALESCE(a.decision, '{}'::jsonb)
                  || jsonb_build_object(
                       'dedupe_source', 'migration_20260514b_backfill',
                       'previous_status', a.status
                     )
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_treasurer_review_unique_capture_care_plan
  ON public.agent_actions ((decision -> 'payload' ->> 'care_plan_id'))
  WHERE agent_slug = 'treasurer'
    AND action_type = 'review'
    AND status IN ('proposed', 'executed')
    AND decision ->> 'event_type' = 'payment.captured'
    AND decision -> 'payload' ->> 'care_plan_id' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_treasurer_review_unique_refund_care_plan
  ON public.agent_actions ((decision -> 'payload' ->> 'care_plan_id'))
  WHERE agent_slug = 'treasurer'
    AND action_type = 'review'
    AND status IN ('proposed', 'executed')
    AND decision ->> 'event_type' = 'payment.refund_requested'
    AND decision -> 'payload' ->> 'care_plan_id' IS NOT NULL;
