-- ============================================================================
-- Task #300 — Enable Treasurer agent
-- The handler ships in netlify/functions/agent-treasurer.js, mirrors the
-- gatekeeper / matchmaker structure, and proposes for payment.captured,
-- payment.refund_requested, and payout.failed. Flip enabled=true so the
-- orchestrator routes those events to the handler. Autonomy stays at
-- 'propose' — every recommendation queues for human review.
-- Apply via Supabase SQL Editor.
-- ============================================================================

UPDATE public.agents
   SET enabled = true,
       autonomy = 'propose'
 WHERE slug = 'treasurer';
