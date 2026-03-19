-- Apollo.io integration: add columns to outreach_leads
ALTER TABLE outreach_leads
  ADD COLUMN IF NOT EXISTS apollo_id TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT;

-- Index for fast apollo_id dedup lookups
CREATE INDEX IF NOT EXISTS idx_outreach_leads_apollo_id ON outreach_leads(apollo_id) WHERE apollo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_leads_source ON outreach_leads(source);

-- Index for metadata JSONB (for apollo_id dedup via metadata.apollo_id fallback)
CREATE INDEX IF NOT EXISTS idx_outreach_leads_metadata_apollo_id ON outreach_leads((metadata->>'apollo_id')) WHERE metadata->>'apollo_id' IS NOT NULL;

-- engine_state already has metadata JSONB column; Apollo config stored under metadata.apollo_config
-- No additional columns needed — apollo_config is stored as nested JSONB within the existing metadata field.

COMMENT ON COLUMN outreach_leads.apollo_id IS 'Apollo.io person ID for deduplication';
COMMENT ON COLUMN outreach_leads.linkedin_url IS 'LinkedIn profile URL from Apollo enrichment';
COMMENT ON COLUMN outreach_leads.website IS 'Company website from Apollo search';
