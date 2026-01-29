-- Dream Car Finder AI Search Feature Migration
-- Allows members to set up AI-powered searches for their dream car

-- Create dream_car_searches table
CREATE TABLE IF NOT EXISTS dream_car_searches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    search_name VARCHAR(200),
    min_year INTEGER,
    max_year INTEGER,
    preferred_makes JSONB DEFAULT '[]'::jsonb,
    preferred_models JSONB DEFAULT '[]'::jsonb,
    preferred_trims JSONB DEFAULT '[]'::jsonb,
    body_styles JSONB DEFAULT '[]'::jsonb,
    max_mileage INTEGER,
    min_price DECIMAL(12, 2),
    max_price DECIMAL(12, 2),
    max_distance_miles INTEGER,
    zip_code VARCHAR(10),
    fuel_types JSONB DEFAULT '[]'::jsonb,
    transmission_preference VARCHAR(50),
    exterior_colors JSONB DEFAULT '[]'::jsonb,
    must_have_features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    search_frequency VARCHAR(50) DEFAULT 'daily' CHECK (search_frequency IN ('hourly', 'twice_daily', 'daily')),
    notify_sms BOOLEAN DEFAULT false,
    notify_email BOOLEAN DEFAULT true,
    last_searched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create dream_car_matches table
CREATE TABLE IF NOT EXISTS dream_car_matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    search_id UUID NOT NULL REFERENCES dream_car_searches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source VARCHAR(100),
    listing_url TEXT,
    listing_id VARCHAR(200),
    year VARCHAR(10),
    make VARCHAR(100),
    model VARCHAR(100),
    trim VARCHAR(100),
    price DECIMAL(12, 2),
    mileage INTEGER,
    exterior_color VARCHAR(100),
    location VARCHAR(300),
    seller_type VARCHAR(50) CHECK (seller_type IN ('dealer', 'private', 'other')),
    match_score INTEGER CHECK (match_score >= 0 AND match_score <= 100),
    match_reasons JSONB DEFAULT '[]'::jsonb,
    listing_data JSONB DEFAULT '{}'::jsonb,
    photos JSONB DEFAULT '[]'::jsonb,
    is_seen BOOLEAN DEFAULT false,
    is_saved BOOLEAN DEFAULT false,
    is_dismissed BOOLEAN DEFAULT false,
    notified_at TIMESTAMPTZ,
    found_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for dream_car_searches
CREATE INDEX IF NOT EXISTS idx_dream_car_searches_user ON dream_car_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_dream_car_searches_active ON dream_car_searches(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_dream_car_searches_frequency ON dream_car_searches(search_frequency, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_dream_car_searches_last_searched ON dream_car_searches(last_searched_at) WHERE is_active = true;

-- Create indexes for dream_car_matches
CREATE INDEX IF NOT EXISTS idx_dream_car_matches_search ON dream_car_matches(search_id);
CREATE INDEX IF NOT EXISTS idx_dream_car_matches_user ON dream_car_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_dream_car_matches_unseen ON dream_car_matches(user_id, is_seen) WHERE is_seen = false;
CREATE INDEX IF NOT EXISTS idx_dream_car_matches_saved ON dream_car_matches(user_id, is_saved) WHERE is_saved = true;
CREATE INDEX IF NOT EXISTS idx_dream_car_matches_listing ON dream_car_matches(source, listing_id);
CREATE INDEX IF NOT EXISTS idx_dream_car_matches_found ON dream_car_matches(found_at);

-- Enable RLS
ALTER TABLE dream_car_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_car_matches ENABLE ROW LEVEL SECURITY;

-- RLS policies for dream_car_searches
DROP POLICY IF EXISTS "Users can view own dream car searches" ON dream_car_searches;
CREATE POLICY "Users can view own dream car searches" ON dream_car_searches
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own dream car searches" ON dream_car_searches;
CREATE POLICY "Users can insert own dream car searches" ON dream_car_searches
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own dream car searches" ON dream_car_searches;
CREATE POLICY "Users can update own dream car searches" ON dream_car_searches
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own dream car searches" ON dream_car_searches;
CREATE POLICY "Users can delete own dream car searches" ON dream_car_searches
    FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for dream_car_matches
DROP POLICY IF EXISTS "Users can view own dream car matches" ON dream_car_matches;
CREATE POLICY "Users can view own dream car matches" ON dream_car_matches
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own dream car matches" ON dream_car_matches;
CREATE POLICY "Users can insert own dream car matches" ON dream_car_matches
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own dream car matches" ON dream_car_matches;
CREATE POLICY "Users can update own dream car matches" ON dream_car_matches
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own dream car matches" ON dream_car_matches;
CREATE POLICY "Users can delete own dream car matches" ON dream_car_matches
    FOR DELETE USING (auth.uid() = user_id);

-- Admin access policies
DROP POLICY IF EXISTS "Admins can view all dream car searches" ON dream_car_searches;
CREATE POLICY "Admins can view all dream car searches" ON dream_car_searches
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can view all dream car matches" ON dream_car_matches;
CREATE POLICY "Admins can view all dream car matches" ON dream_car_matches
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_dream_car_searches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_dream_car_searches_updated_at ON dream_car_searches;
CREATE TRIGGER trigger_dream_car_searches_updated_at
    BEFORE UPDATE ON dream_car_searches
    FOR EACH ROW
    EXECUTE FUNCTION update_dream_car_searches_updated_at();

-- Add preferred_trims column for existing databases (run if upgrading)
ALTER TABLE dream_car_searches ADD COLUMN IF NOT EXISTS preferred_trims JSONB DEFAULT '[]'::jsonb;

-- Add email_report_frequency column for digest emails
-- Email report frequencies: none, daily, weekly, monthly, quarterly, yearly
ALTER TABLE dream_car_searches ADD COLUMN IF NOT EXISTS email_report_frequency VARCHAR(20) DEFAULT 'daily' 
  CHECK (email_report_frequency IN ('none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'));
ALTER TABLE dream_car_searches ADD COLUMN IF NOT EXISTS last_email_report_at TIMESTAMPTZ;

-- Index for email report scheduling
CREATE INDEX IF NOT EXISTS idx_dream_car_searches_email_report ON dream_car_searches(email_report_frequency, last_email_report_at) WHERE is_active = true AND email_report_frequency != 'none';
