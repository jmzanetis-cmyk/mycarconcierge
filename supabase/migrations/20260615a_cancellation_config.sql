-- ============================================================================
-- 20260615a_cancellation_config.sql
-- Additive supplement to 20260614b_cancellation_and_vehicles.sql.
-- Adds the three objects missing from the applied 86-line migration:
--   1. cancellation_policy_config table  (admin-tunable thresholds)
--   2. drivers.cancel_strike_count       (rolling at-fault strike counter)
--   3. driver_cancel_rates view          (corrected for concierge_jobs schema)
-- ============================================================================

-- ── 1. Policy config table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cancellation_policy_config (
  key        text        PRIMARY KEY,
  value_int  integer,
  value_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cancellation_policy_config (key, value_int) VALUES
  ('grace_seconds',                        60),
  ('passenger_cancel_fee_cents',         1000),
  ('passenger_noshow_wait_seconds',       300),
  ('driver_penalty_cents',                500),
  ('driver_penalty_cap_per_period_cents',1500),
  ('timeout_2nd_strike_min',               15),
  ('timeout_3rd_strike_min',               30),
  ('strike_window_days',                    7),
  ('cancel_rate_warn_pct',                 10),
  ('cancel_rate_review_pct',               20)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.cancellation_policy_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated reads policy config"
  ON public.cancellation_policy_config FOR SELECT
  TO authenticated USING (true);

-- ── 2. cancel_strike_count on drivers ─────────────────────────────────────────
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS cancel_strike_count integer NOT NULL DEFAULT 0;

-- ── 3. driver_cancel_rates view ───────────────────────────────────────────────
-- Joins via cancelled_by_id → drivers.profile_id since the applied
-- ride_cancellations schema has no direct driver_id FK.
CREATE OR REPLACE VIEW public.driver_cancel_rates AS
SELECT
  d.id AS driver_id,
  COUNT(rc.id)
    FILTER (WHERE rc.created_at >= now() - interval '7 days')             AS cancels_7d,
  COUNT(rc.id)
    FILTER (WHERE rc.fault = 'driver'
               AND rc.created_at >= now() - interval '7 days')            AS at_fault_7d,
  CASE
    WHEN COUNT(rc.id)
         FILTER (WHERE rc.created_at >= now() - interval '7 days') = 0
    THEN 0
    ELSE ROUND(
      100.0
      * COUNT(rc.id) FILTER (WHERE rc.fault = 'driver'
                                AND rc.created_at >= now() - interval '7 days')
      / COUNT(rc.id) FILTER (WHERE rc.created_at >= now() - interval '7 days')
    )
  END AS cancel_rate_7d_pct
FROM public.drivers d
LEFT JOIN public.ride_cancellations rc
  ON rc.cancelled_by_id = d.profile_id
 AND rc.cancelled_by_role = 'driver'
GROUP BY d.id;
