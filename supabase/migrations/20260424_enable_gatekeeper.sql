-- ============================================================================
-- Task #126 — Enable Gatekeeper agent
-- The handler is shipped (Task #123), producers are wired (DB triggers + BGC
-- webhook), prompt is editable from the admin console (Task #128), and the
-- review queue now has Apply + Suspend buttons (Task #127). Flip enabled=true
-- so the orchestrator routes provider.* events to the handler. Autonomy stays
-- at 'propose' — every decision still queues for human review.
-- Apply via Supabase SQL Editor.
-- ============================================================================

UPDATE public.agents
   SET enabled = true,
       autonomy = 'propose'
 WHERE slug = 'gatekeeper';
