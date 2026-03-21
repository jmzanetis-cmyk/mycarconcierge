-- Migration: OBD Diagnostic Scan Feature
-- Date: 2026-02-04
-- Features: Allow members to upload OBD-II diagnostic codes for AI interpretation

-- 1. Create diagnostic_scans table
CREATE TABLE IF NOT EXISTS diagnostic_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  user_id UUID NOT NULL,
  codes TEXT[] NOT NULL DEFAULT '{}',
  raw_input TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'photo_ocr', 'import')),
  ai_interpretation JSONB,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  service_request_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_scans_vehicle ON diagnostic_scans(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_scans_user ON diagnostic_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_scans_created ON diagnostic_scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_scans_service_request ON diagnostic_scans(service_request_id);

-- 2. Enable RLS
ALTER TABLE diagnostic_scans ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Users can view their own scans
CREATE POLICY "Users can view own diagnostic scans"
  ON diagnostic_scans FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own scans
CREATE POLICY "Users can create diagnostic scans"
  ON diagnostic_scans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own scans
CREATE POLICY "Users can update own diagnostic scans"
  ON diagnostic_scans FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own scans
CREATE POLICY "Users can delete own diagnostic scans"
  ON diagnostic_scans FOR DELETE
  USING (auth.uid() = user_id);

-- Service authenticated can access for API operations
CREATE POLICY "Service role full access to diagnostic scans"
  ON diagnostic_scans FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Add diagnostic_scan_id to service_requests if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_requests' AND column_name = 'diagnostic_scan_id'
  ) THEN
    ALTER TABLE service_requests ADD COLUMN diagnostic_scan_id UUID REFERENCES diagnostic_scans(id);
  END IF;
END $$;

-- 5. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_diagnostic_scan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for updated_at
DROP TRIGGER IF EXISTS diagnostic_scans_updated_at ON diagnostic_scans;
CREATE TRIGGER diagnostic_scans_updated_at
  BEFORE UPDATE ON diagnostic_scans
  FOR EACH ROW
  EXECUTE FUNCTION update_diagnostic_scan_timestamp();

-- 7. Create view for diagnostic scan history with vehicle info
CREATE OR REPLACE VIEW diagnostic_scan_history AS
SELECT 
  ds.id,
  ds.vehicle_id,
  ds.user_id,
  ds.codes,
  ds.raw_input,
  ds.source,
  ds.ai_interpretation,
  ds.severity,
  ds.service_request_id,
  ds.notes,
  ds.created_at,
  ds.updated_at
FROM diagnostic_scans ds;

COMMENT ON TABLE diagnostic_scans IS 'Stores OBD-II diagnostic code scans uploaded by members';
COMMENT ON COLUMN diagnostic_scans.codes IS 'Array of OBD-II codes like P0420, P0171, etc.';
COMMENT ON COLUMN diagnostic_scans.source IS 'How codes were entered: manual, photo_ocr, or import';
COMMENT ON COLUMN diagnostic_scans.ai_interpretation IS 'JSON with AI-generated explanations, severity, and cost estimates';
COMMENT ON COLUMN diagnostic_scans.severity IS 'Overall severity: low, medium, high, or critical';
