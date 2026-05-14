-- ============================================================================
-- Backfill social_leads.agent_action_id and social_posts.agent_action_id from
-- the matching agent_actions row's decision JSON.
--
-- Context: until task #178, logAction() returned a bare id (number) but the
-- callers in agent-hunter / agent-promoter accessed `.id` on it, so the FK
-- assignment silently became NULL on every row written. The runtime is now
-- fixed to return { id }, but every social_leads / social_posts row created
-- before the fix still has a NULL FK even though the matching agent_actions
-- row exists and references the lead/post id inside its decision JSON.
--
-- This migration walks those NULL rows and links them up using the most
-- recent matching action. The DISTINCT ON pattern ensures we link one action
-- per lead/post (deduplicating retries) and prefer the latest one.
--
-- Apply via Supabase SQL Editor.
-- ============================================================================

-- ---------- social_leads ----------------------------------------------------
-- Restrict the join to hunter.score actions explicitly so we never link to a
-- different action type that happens to carry the same key in its decision.
WITH latest_hunter_action AS (
  SELECT DISTINCT ON ((decision->>'social_lead_id')::bigint)
         (decision->>'social_lead_id')::bigint AS lead_id,
         id AS action_id
    FROM public.agent_actions
   WHERE agent_slug = 'hunter'
     AND action_type = 'score'
     AND decision ? 'social_lead_id'
     AND decision->>'social_lead_id' ~ '^[0-9]+$'  -- NOSONAR S6353: digit-only regex repeated across CTEs; \set unsupported in Supabase SQL Editor
   ORDER BY (decision->>'social_lead_id')::bigint, created_at DESC
)
UPDATE public.social_leads sl
   SET agent_action_id = lha.action_id
  FROM latest_hunter_action lha
 WHERE sl.id = lha.lead_id
   AND sl.agent_action_id IS NULL;

-- ---------- social_posts ----------------------------------------------------
-- Restrict to promoter.draft for the same reason.
WITH latest_promoter_action AS (
  SELECT DISTINCT ON ((decision->>'social_post_id')::bigint)
         (decision->>'social_post_id')::bigint AS post_id,
         id AS action_id
    FROM public.agent_actions
   WHERE agent_slug = 'promoter'
     AND action_type = 'draft'
     AND decision ? 'social_post_id'
     AND decision->>'social_post_id' ~ '^[0-9]+$'  -- NOSONAR S6353
   ORDER BY (decision->>'social_post_id')::bigint, created_at DESC
)
UPDATE public.social_posts sp
   SET agent_action_id = lpa.action_id
  FROM latest_promoter_action lpa
 WHERE sp.id = lpa.post_id
   AND sp.agent_action_id IS NULL;
