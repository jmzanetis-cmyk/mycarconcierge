-- Add background check columns to drivers table
-- Applied 2026-05-26 via Supabase MCP; this file captures the migration for version control.

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS bgc_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (bgc_status IN ('not_started','pending_check','passed','consider','failed')),
  ADD COLUMN IF NOT EXISTS bgc_report_id TEXT,
  ADD COLUMN IF NOT EXISTS bgc_invite_url TEXT,
  ADD COLUMN IF NOT EXISTS bgc_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS drivers_bgc_report_id_idx
  ON drivers(bgc_report_id)
  WHERE bgc_report_id IS NOT NULL;
