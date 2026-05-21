-- ============================================================================
-- Task #345 — bulk_service_bids
--
-- Backing table for provider fleet bulk bidding. A provider submits one bid
-- for an entire fleet batch (B2B fleet customer job queue). Referenced by
-- www/providers.js submitFleetBulkBid() and the fleet-bulk-bid-modal flow.
--
-- DDL synthesised from the insert call in www/providers.js (no prior migration
-- file existed — applied 2026-05-21 alongside ghost-table triage).
--
-- Columns derived from insertShape:
--   batch_id          — references a fleet bid batch (no FK; batch table TBD)
--   provider_id       — the bidding provider (FK → profiles)
--   pricing_type      — 'per_vehicle' | 'total'
--   price_per_vehicle — populated when pricing_type='per_vehicle', else NULL
--   total_price       — computed total (price × vehicle_count or flat price)
--   estimated_duration — free-text duration estimate
--   proposed_start_date / proposed_end_date — scheduling window
--   notes             — provider notes on the bid
--   status            — bid lifecycle: pending → accepted | rejected | withdrawn
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bulk_service_bids (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              uuid NOT NULL,
  provider_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pricing_type          text NOT NULL CHECK (pricing_type IN ('per_vehicle','total')),
  price_per_vehicle     numeric,
  total_price           numeric NOT NULL,
  estimated_duration    text,
  proposed_start_date   date,
  proposed_end_date     date,
  notes                 text,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bulk_service_bids_batch_idx
  ON public.bulk_service_bids (batch_id);
CREATE INDEX IF NOT EXISTS bulk_service_bids_provider_idx
  ON public.bulk_service_bids (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bulk_service_bids_status_idx
  ON public.bulk_service_bids (status, created_at DESC);

-- RLS — providers read/write only their own bids; admin uses service role.
ALTER TABLE public.bulk_service_bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_service_bids_provider_select ON public.bulk_service_bids;
CREATE POLICY bulk_service_bids_provider_select ON public.bulk_service_bids
  FOR SELECT USING (provider_id = auth.uid());

DROP POLICY IF EXISTS bulk_service_bids_provider_insert ON public.bulk_service_bids;
CREATE POLICY bulk_service_bids_provider_insert ON public.bulk_service_bids
  FOR INSERT WITH CHECK (provider_id = auth.uid());
