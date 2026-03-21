-- Add background_verified field to provider_applications
-- This tracks whether a provider has completed voluntary background verification

ALTER TABLE provider_applications ADD COLUMN IF NOT EXISTS background_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE provider_applications ADD COLUMN IF NOT EXISTS background_verified_at TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the column
COMMENT ON COLUMN provider_applications.background_verified IS 'True if provider has voluntarily completed background check verification';
COMMENT ON COLUMN provider_applications.background_verified_at IS 'Timestamp when background verification was completed';

-- Create index for filtering by verified providers
CREATE INDEX IF NOT EXISTS idx_provider_applications_background_verified ON provider_applications(background_verified) WHERE background_verified = TRUE;
