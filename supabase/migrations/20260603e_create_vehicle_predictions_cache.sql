-- vehicle_predictions: caches AI maintenance forecast per vehicle
-- Rows expire after 7 days; the Netlify function regenerates on miss.
CREATE TABLE IF NOT EXISTS public.vehicle_predictions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL,
  health_summary text,
  predictions jsonb NOT NULL DEFAULT '[]',
  model       text,
  tokens_used integer,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_vehicle_predictions_vehicle_id ON public.vehicle_predictions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_predictions_expires_at ON public.vehicle_predictions(expires_at);

ALTER TABLE public.vehicle_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_predictions_member_read"
  ON public.vehicle_predictions FOR SELECT
  USING (member_id = auth.uid());
