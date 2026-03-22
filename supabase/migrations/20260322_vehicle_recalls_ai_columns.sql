-- MY CAR CONCIERGE
-- Migration: Add AI enrichment columns to vehicle_recalls
-- Run this in the Supabase SQL Editor

ALTER TABLE vehicle_recalls
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS severity VARCHAR(20);

-- Index to quickly find un-enriched recalls
CREATE INDEX IF NOT EXISTS idx_vehicle_recalls_ai_summary
  ON vehicle_recalls(ai_summary)
  WHERE ai_summary IS NULL;
