-- Task #195 — Block duplicate Matchmaker rankings at the database layer.
--
-- Task #152 added an application-level idempotency guard to
-- netlify/functions/agent-matchmaker.js: before calling Claude the handler
-- looks up agent_actions for an existing matchmaker rank/apply row tied to
-- the same care_plan_id and short-circuits when one is found. That guard
-- handles the common case (sequential retries / replays of the same
-- `care_plan.auction_closed` event), but two near-simultaneous invocations
-- can both pass the check, both call Claude, and both INSERT a `proposed`
-- row before either commits — a classic check-then-act race.
--
-- This unique partial index closes that race at the storage layer:
-- Postgres will refuse the second INSERT with a 23505 unique-violation,
-- and the matchmaker handler turns that into a successful "already_ranked"
-- short-circuit (see netlify/functions/agent-matchmaker.js).
--
-- Conditions in the WHERE clause mirror the application-level dedupe
-- contract:
--   - agent_slug = 'matchmaker' and action_type = 'rank' — only the rank
--     rows the matchmaker handler itself writes (apply rows live under a
--     different action_type and are written by agent-fleet-admin.js).
--   - status IN ('proposed','executed') — non-terminal rows. A previous
--     `skipped` (e.g. dedupe short-circuit, spend-cap) or `error` row
--     must NOT block a fresh attempt; nor should `completed`/`escalated`
--     which the matchmaker does not produce for ranks.
--   - decision->'payload'->>'care_plan_id' IS NOT NULL — every rank row
--     this handler writes carries the care_plan_id at this path.
--     Defensive: skip the index entry if for any reason the path is null.
--
-- Pre-index cleanup: any care_plan that already has more than one
-- proposed/executed matchmaker rank row in production is a survivor of
-- the very race this migration is closing. Without remediation the
-- CREATE UNIQUE INDEX below would abort. We keep the newest row (the
-- one most likely surfaced in the operator review queue) and demote
-- the older duplicates to status='skipped' with a marker in
-- decision.dedupe_source so they remain auditable.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY decision -> 'payload' ->> 'care_plan_id'
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM public.agent_actions
   WHERE agent_slug = 'matchmaker'
     AND action_type = 'rank'
     AND status IN ('proposed', 'executed')
     AND decision -> 'payload' ->> 'care_plan_id' IS NOT NULL
)
UPDATE public.agent_actions a
   SET status = 'skipped',
       decision = COALESCE(a.decision, '{}'::jsonb)
                  || jsonb_build_object(
                       'dedupe_source', 'migration_20260429f_backfill',
                       'previous_status', a.status
                     )
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_matchmaker_rank_unique
  ON public.agent_actions ((decision -> 'payload' ->> 'care_plan_id'))
  WHERE agent_slug = 'matchmaker'
    AND action_type = 'rank'
    AND status IN ('proposed', 'executed')
    AND decision -> 'payload' ->> 'care_plan_id' IS NOT NULL;
