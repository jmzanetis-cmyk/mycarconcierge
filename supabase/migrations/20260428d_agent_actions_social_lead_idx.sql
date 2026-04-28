-- Task #130 — deterministic Hunter-reasoning lookup by social_lead_id.
--
-- The admin agent-fleet UI fetches Hunter reasoning for a social lead by
-- selecting agent_actions where decision->>'social_lead_id' = :id ORDER BY
-- created_at DESC LIMIT 1. Without an expression index this becomes a full
-- scan over agent_actions (which grows fast: every agent invocation logs a
-- row). Index the JSONB extraction so the lookup stays O(log n).
--
-- The partial WHERE filter keeps the index small — only Hunter rows that
-- actually carry a social_lead_id are indexed.
CREATE INDEX IF NOT EXISTS agent_actions_social_lead_idx
  ON public.agent_actions ((decision->>'social_lead_id'), created_at DESC)
  WHERE decision ? 'social_lead_id';
