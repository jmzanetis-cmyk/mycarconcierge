-- ============================================================================
-- Enable Matchmaker agent
-- The handler ships in netlify/functions/agent-matchmaker.js and consumes
-- care_plan.auction_closed (produced by the existing
-- agent_emit_auction_closed DB trigger from 20260422_agent_fleet.sql).
-- Autonomy stays at 'propose' — every recommendation queues for human review,
-- and the handler never mutates care_plans, plan_bids, or provider state.
-- Apply via Supabase SQL Editor.
-- ============================================================================

UPDATE public.agents
   SET enabled = true,
       autonomy = 'propose'
 WHERE slug = 'matchmaker';
