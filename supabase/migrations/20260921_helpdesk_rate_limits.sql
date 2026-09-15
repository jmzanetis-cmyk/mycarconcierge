-- ============================================================================
-- 20260921_helpdesk_rate_limits.sql — Phase 2.5 §3.1(c)
--
-- Durable per-IP rate limit for /api/helpdesk. Replaces the in-memory Map
-- limiter in netlify/functions/helpdesk.js which resets on every cold start
-- (Netlify Lambdas can freeze/recycle any time, so the old limiter was
-- effectively unenforced in practice).
--
-- Two windows enforced together:
--   - minute:  cap 10 requests per rolling minute window
--   - day:     cap 60 requests per rolling day window
--
-- Atomicity: one RPC call increments both counters and returns the pair +
-- an `allowed` flag. Fail-open at the call site — the RPC only decides,
-- the JS treats any transport error as "let it through" with a console.warn
-- so a Supabase outage cannot silently gate legitimate traffic.
--
-- ADDITIVE ONLY. No changes to existing tables. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.helpdesk_rate_limits (
  ip           text NOT NULL,
  window_kind  text NOT NULL CHECK (window_kind IN ('minute','day')),
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_kind, window_start)
);

-- GC index — expected sweep policy is "delete where window_start < now() - '2 days'"
-- run once daily by any scheduled function; index makes that sweep cheap.
CREATE INDEX IF NOT EXISTS helpdesk_rate_limits_gc_idx
  ON public.helpdesk_rate_limits (window_start);

-- Service role only. This table is never read from the client and its rows
-- have no user linkage — RLS is enabled with zero policies so PostgREST
-- reads from anon/auth are hard-blocked; the Netlify function uses the
-- service role client and bypasses RLS.
ALTER TABLE public.helpdesk_rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomic upsert-and-check. Called from helpdesk.js via
-- supabase.rpc('helpdesk_check_rate_limit', { p_ip }). Returns:
--   { minute_count, day_count, allowed: minute_count<=10 AND day_count<=60 }
-- The caller ignores errors (fail-open) and uses the boolean directly.
CREATE OR REPLACE FUNCTION public.helpdesk_check_rate_limit(p_ip text)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  minute_start timestamptz := date_trunc('minute', now());
  day_start    timestamptz := date_trunc('day',    now());
  minute_count int;
  day_count    int;
BEGIN
  INSERT INTO public.helpdesk_rate_limits (ip, window_kind, window_start, count)
    VALUES (p_ip, 'minute', minute_start, 1)
    ON CONFLICT (ip, window_kind, window_start)
    DO UPDATE SET count = public.helpdesk_rate_limits.count + 1
    RETURNING count INTO minute_count;

  INSERT INTO public.helpdesk_rate_limits (ip, window_kind, window_start, count)
    VALUES (p_ip, 'day', day_start, 1)
    ON CONFLICT (ip, window_kind, window_start)
    DO UPDATE SET count = public.helpdesk_rate_limits.count + 1
    RETURNING count INTO day_count;

  RETURN json_build_object(
    'minute_count', minute_count,
    'day_count',    day_count,
    'allowed',      minute_count <= 10 AND day_count <= 60
  );
END $$;
