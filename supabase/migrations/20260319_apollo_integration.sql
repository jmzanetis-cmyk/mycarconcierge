-- Apollo.io integration: add apollo_id column to outreach_leads
ALTER TABLE outreach_leads
  ADD COLUMN IF NOT EXISTS apollo_id TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT;

-- Index for fast dedup lookups
CREATE INDEX IF NOT EXISTS idx_outreach_leads_apollo_id ON outreach_leads(apollo_id) WHERE apollo_id IS NOT NULL;

-- Source label for Apollo leads
DO $$
BEGIN
  -- No enum change needed; source is TEXT column
  NULL;
END $$;
