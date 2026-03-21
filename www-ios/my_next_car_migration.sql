-- My Next Car Feature Migration
-- Allows members to track and compare prospective vehicle purchases

-- Create prospect_vehicles table
CREATE TABLE IF NOT EXISTS prospect_vehicles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vin VARCHAR(17),
    year INTEGER,
    make VARCHAR(100),
    model VARCHAR(100),
    trim VARCHAR(100),
    body_style VARCHAR(100),
    engine VARCHAR(200),
    fuel_type VARCHAR(50),
    mileage INTEGER,
    asking_price DECIMAL(12, 2),
    seller_type VARCHAR(50) CHECK (seller_type IN ('dealer', 'private', 'auction', 'other')),
    seller_name VARCHAR(200),
    seller_location VARCHAR(300),
    listing_url TEXT,
    exterior_color VARCHAR(100),
    interior_color VARCHAR(100),
    condition_notes TEXT,
    carfax_accidents INTEGER DEFAULT 0,
    carfax_owners INTEGER DEFAULT 0,
    carfax_service_records BOOLEAN DEFAULT false,
    carfax_notes TEXT,
    personal_rating INTEGER CHECK (personal_rating >= 1 AND personal_rating <= 5),
    personal_notes TEXT,
    photos JSONB DEFAULT '[]'::jsonb,
    is_favorite BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'considering' CHECK (status IN ('considering', 'test_driven', 'offer_made', 'purchased', 'passed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create member_car_preferences table
CREATE TABLE IF NOT EXISTS member_car_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    min_year INTEGER,
    max_year INTEGER,
    preferred_makes JSONB DEFAULT '[]'::jsonb,
    preferred_body_styles JSONB DEFAULT '[]'::jsonb,
    max_mileage INTEGER,
    min_budget DECIMAL(12, 2),
    max_budget DECIMAL(12, 2),
    must_have_features JSONB DEFAULT '[]'::jsonb,
    nice_to_have_features JSONB DEFAULT '[]'::jsonb,
    deal_breakers JSONB DEFAULT '[]'::jsonb,
    fuel_preference VARCHAR(50),
    transmission_preference VARCHAR(50),
    drivetrain_preference VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_prospect_vehicles_user ON prospect_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_prospect_vehicles_status ON prospect_vehicles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_prospect_vehicles_favorite ON prospect_vehicles(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_member_car_preferences_user ON member_car_preferences(user_id);

-- Enable RLS
ALTER TABLE prospect_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_car_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for prospect_vehicles
DROP POLICY IF EXISTS "Users can view own prospect vehicles" ON prospect_vehicles;
CREATE POLICY "Users can view own prospect vehicles" ON prospect_vehicles
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own prospect vehicles" ON prospect_vehicles;
CREATE POLICY "Users can insert own prospect vehicles" ON prospect_vehicles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own prospect vehicles" ON prospect_vehicles;
CREATE POLICY "Users can update own prospect vehicles" ON prospect_vehicles
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own prospect vehicles" ON prospect_vehicles;
CREATE POLICY "Users can delete own prospect vehicles" ON prospect_vehicles
    FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for member_car_preferences
DROP POLICY IF EXISTS "Users can view own preferences" ON member_car_preferences;
CREATE POLICY "Users can view own preferences" ON member_car_preferences
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preferences" ON member_car_preferences;
CREATE POLICY "Users can insert own preferences" ON member_car_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON member_car_preferences;
CREATE POLICY "Users can update own preferences" ON member_car_preferences
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own preferences" ON member_car_preferences;
CREATE POLICY "Users can delete own preferences" ON member_car_preferences
    FOR DELETE USING (auth.uid() = user_id);

-- Admin access policies (uses existing is_admin() function from project)
-- Note: If is_admin() doesn't exist, remove these two policies
DROP POLICY IF EXISTS "Admins can view all prospect vehicles" ON prospect_vehicles;
CREATE POLICY "Admins can view all prospect vehicles" ON prospect_vehicles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can view all preferences" ON member_car_preferences;
CREATE POLICY "Admins can view all preferences" ON member_car_preferences
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_prospect_vehicles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prospect_vehicles_updated_at ON prospect_vehicles;
CREATE TRIGGER trigger_prospect_vehicles_updated_at
    BEFORE UPDATE ON prospect_vehicles
    FOR EACH ROW
    EXECUTE FUNCTION update_prospect_vehicles_updated_at();

DROP TRIGGER IF EXISTS trigger_member_car_preferences_updated_at ON member_car_preferences;
CREATE TRIGGER trigger_member_car_preferences_updated_at
    BEFORE UPDATE ON member_car_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_prospect_vehicles_updated_at();
