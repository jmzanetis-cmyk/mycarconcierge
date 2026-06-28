-- ============================================================================
-- 20260627a — webhook_events: central idempotency gate for Stripe webhooks
--
-- BACKGROUND
--   stripe-webhook.js today relies on per-handler idempotency guards (status
--   checks, unique-constraint catches, zero-row filters). Audit verified all
--   money-moving handlers are replay-safe (see Session 3 STEP 1 report). But
--   a replayed event still runs through each handler's full code path and —
--   after commit 2614a8a — would also fire duplicate audit_log rows for 9 of
--   them where the audit() call sits after a no-op status update.
--
--   This table adds a FRONT-DOOR gate keyed on Stripe's stable event.id. A
--   replayed delivery short-circuits at the gate, BEFORE any handler runs
--   and BEFORE any audit row is written. Per-handler guards remain in place
--   as defense-in-depth (untouched by this CR).
--
-- APPLY ORDER (DB-first)
--   1. Apply this migration in Studio.
--   2. Deploy the stripe-webhook.js gate code in the same commit (the code
--      fails-OPEN if this table is missing, so deploying code first wouldn't
--      break anything — but DB-first is cleaner).
--
-- FAIL-SAFE POSTURE (in code, for reference)
--   The gate's own queries are wrapped in try/catch in the handler. If a
--   gate query throws (table missing, transient DB error), the gate returns
--   { skip: false, reason: 'gate_error' } and the handler runs anyway.
--   Per-handler guards catch double-processing. The opposite posture
--   (fail-closed = skip the handler on gate error) would silently drop a
--   first-delivery event if the gate had a transient hiccup — strictly worse
--   than today's behavior (Stripe doesn't retry on 200).
--
-- SCHEMA
--   stripe_event_id    text, UNIQUE NOT NULL — Stripe's stable evt_xxx id
--   event_type         text NOT NULL — e.g. 'checkout.session.completed'
--   status             text — 'processing' | 'processed' | 'failed'
--   received_at        timestamptz default now() — last observed
--   processed_at       timestamptz — set when handler completed successfully
--   error_message      text — populated when status='failed'
--   retry_count        int default 0 — incremented when a stale-or-failed row
--                      is reprocessed (manual Resend or stale-row recovery)
--   raw_event_summary  jsonb — small subset: { id, type, livemode, created }
--                      stored for diagnostics; we intentionally do NOT store
--                      the full event body (often KB of card/customer data).
--
-- STALE-ROW RECOVERY (in code)
--   A 'processing' row older than 15 minutes is treated as abandoned (a
--   previous invocation crashed mid-handler). The next delivery resets
--   received_at, increments retry_count, and proceeds to the handler.
--
-- POST-APPLY CHECKS (run in Studio after this lands)
--   SELECT count(*) FROM public.webhook_events;
--     → expect 0 (empty table)
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname='public' AND tablename='webhook_events';
--     → expect 0 rows (RLS on, no policies = denied to anon/authenticated;
--       service-role bypasses RLS by design — webhook uses service-role key)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id                bigserial PRIMARY KEY,
  stripe_event_id   text NOT NULL UNIQUE,
  event_type        text NOT NULL,
  status            text NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'processed', 'failed')),
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  error_message     text,
  retry_count       int NOT NULL DEFAULT 0,
  raw_event_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- The UNIQUE constraint on stripe_event_id creates the lookup index used by
-- the gate. A second index supports stale-row diagnostics and admin queries
-- like "show me failed webhooks in the last 24h".
CREATE INDEX IF NOT EXISTS webhook_events_status_received_idx
  ON public.webhook_events (status, received_at DESC);

-- RLS hardening: webhook handler uses the service-role key (bypasses RLS by
-- design). Enable RLS with no policies for normal roles — service-role still
-- works; anon/authenticated cannot read/write. Prevents accidental exposure.
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- End of 20260627a_webhook_events.sql
-- ============================================================================
