-- A/B Testing Migration for My Car Concierge
-- Creates tables to store A/B tests and their events

CREATE TABLE IF NOT EXISTS ab_tests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ab_test_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    test_name VARCHAR(255) NOT NULL,
    variant CHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),
    event_type VARCHAR(100) NOT NULL,
    visitor_id VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_events_test_name ON ab_test_events(test_name);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_variant ON ab_test_events(test_name, variant);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_event_type ON ab_test_events(test_name, event_type);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_visitor ON ab_test_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_created ON ab_test_events(created_at);

INSERT INTO ab_tests (name, description, status) VALUES
    ('join_headline', 'Test headline variations on join page', 'active')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_ab_tests_updated_at ON ab_tests;
CREATE TRIGGER update_ab_tests_updated_at
    BEFORE UPDATE ON ab_tests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ab_tests IS 'Stores A/B test configurations';
COMMENT ON TABLE ab_test_events IS 'Stores tracking events for A/B tests';
