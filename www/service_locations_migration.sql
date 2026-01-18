-- Service Locations Migration for My Car Concierge
-- Creates table to store configurable pilot/service locations

CREATE TABLE IF NOT EXISTS service_locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    city VARCHAR(255) NOT NULL,
    state VARCHAR(50) NOT NULL,
    zip_codes TEXT[] NOT NULL DEFAULT '{}',
    launch_date DATE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'coming_soon', 'paused')),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_locations_status ON service_locations(status);
CREATE INDEX IF NOT EXISTS idx_service_locations_primary ON service_locations(is_primary);

CREATE OR REPLACE FUNCTION update_service_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_service_locations_updated_at ON service_locations;
CREATE TRIGGER update_service_locations_updated_at
    BEFORE UPDATE ON service_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_service_locations_updated_at();

INSERT INTO service_locations (city, state, zip_codes, launch_date, status, is_primary) VALUES
    ('Hackensack', 'NJ', ARRAY['07601', '07602', '07603'], NOW(), 'active', true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE service_locations IS 'Stores configurable service area/pilot locations';
