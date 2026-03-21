-- Maintenance Schedules Migration
-- Automated maintenance reminder system for vehicles
-- Created: 2026-01-21

-- Create maintenance_schedules table
CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    service_type VARCHAR(50) NOT NULL CHECK (service_type IN (
        'oil_change',
        'tire_rotation', 
        'brake_inspection',
        'air_filter',
        'transmission_fluid',
        'coolant_flush',
        'spark_plugs',
        'timing_belt',
        'state_inspection',
        'emissions_test'
    )),
    interval_miles INTEGER,
    interval_months INTEGER,
    last_service_date TIMESTAMP WITH TIME ZONE,
    last_service_mileage INTEGER,
    next_due_date TIMESTAMP WITH TIME ZONE,
    next_due_mileage INTEGER,
    reminder_sent BOOLEAN DEFAULT FALSE,
    reminder_sent_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_interval CHECK (interval_miles IS NOT NULL OR interval_months IS NOT NULL)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_vehicle_id ON maintenance_schedules(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_member_id ON maintenance_schedules(member_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_next_due_date ON maintenance_schedules(next_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_is_active ON maintenance_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_reminder_sent ON maintenance_schedules(reminder_sent);

-- Composite index for reminder checks
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_active_reminders 
    ON maintenance_schedules(is_active, reminder_sent, next_due_date) 
    WHERE is_active = TRUE AND reminder_sent = FALSE;

-- Enable Row Level Security
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Members can view their own maintenance schedules
CREATE POLICY maintenance_schedules_select_own ON maintenance_schedules
    FOR SELECT
    USING (auth.uid() = member_id);

-- RLS Policy: Members can insert their own maintenance schedules
CREATE POLICY maintenance_schedules_insert_own ON maintenance_schedules
    FOR INSERT
    WITH CHECK (auth.uid() = member_id);

-- RLS Policy: Members can update their own maintenance schedules
CREATE POLICY maintenance_schedules_update_own ON maintenance_schedules
    FOR UPDATE
    USING (auth.uid() = member_id)
    WITH CHECK (auth.uid() = member_id);

-- RLS Policy: Members can delete their own maintenance schedules
CREATE POLICY maintenance_schedules_delete_own ON maintenance_schedules
    FOR DELETE
    USING (auth.uid() = member_id);

-- RLS Policy: Service role (backend) can access all records
CREATE POLICY maintenance_schedules_service_role ON maintenance_schedules
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_maintenance_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_maintenance_schedules_updated_at ON maintenance_schedules;
CREATE TRIGGER trigger_update_maintenance_schedules_updated_at
    BEFORE UPDATE ON maintenance_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_maintenance_schedules_updated_at();

-- Function to calculate next due date based on last service
CREATE OR REPLACE FUNCTION calculate_next_maintenance_due()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate next_due_date if interval_months is set and last_service_date is set
    IF NEW.interval_months IS NOT NULL AND NEW.last_service_date IS NOT NULL THEN
        NEW.next_due_date = NEW.last_service_date + (NEW.interval_months || ' months')::INTERVAL;
    ELSIF NEW.interval_months IS NOT NULL AND NEW.last_service_date IS NULL THEN
        -- If no last service, due now + interval from creation
        NEW.next_due_date = NOW() + (NEW.interval_months || ' months')::INTERVAL;
    END IF;
    
    -- Calculate next_due_mileage if interval_miles is set and last_service_mileage is set
    IF NEW.interval_miles IS NOT NULL AND NEW.last_service_mileage IS NOT NULL THEN
        NEW.next_due_mileage = NEW.last_service_mileage + NEW.interval_miles;
    ELSIF NEW.interval_miles IS NOT NULL AND NEW.last_service_mileage IS NULL THEN
        -- If no last mileage, set a reasonable default (estimate current + interval)
        NEW.next_due_mileage = COALESCE(NEW.last_service_mileage, 0) + NEW.interval_miles;
    END IF;
    
    -- Reset reminder status when service is updated
    IF TG_OP = 'UPDATE' AND (
        OLD.last_service_date IS DISTINCT FROM NEW.last_service_date OR
        OLD.last_service_mileage IS DISTINCT FROM NEW.last_service_mileage
    ) THEN
        NEW.reminder_sent = FALSE;
        NEW.reminder_sent_at = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate due dates
DROP TRIGGER IF EXISTS trigger_calculate_next_maintenance_due ON maintenance_schedules;
CREATE TRIGGER trigger_calculate_next_maintenance_due
    BEFORE INSERT OR UPDATE ON maintenance_schedules
    FOR EACH ROW
    EXECUTE FUNCTION calculate_next_maintenance_due();

-- Human-readable service type labels (for reference in application code)
COMMENT ON TABLE maintenance_schedules IS 'Automated maintenance reminder schedules for member vehicles';
COMMENT ON COLUMN maintenance_schedules.service_type IS 'oil_change, tire_rotation, brake_inspection, air_filter, transmission_fluid, coolant_flush, spark_plugs, timing_belt, state_inspection, emissions_test';
COMMENT ON COLUMN maintenance_schedules.interval_miles IS 'Mileage interval between services (e.g., 5000 for oil change)';
COMMENT ON COLUMN maintenance_schedules.interval_months IS 'Time interval in months between services (e.g., 6 for oil change)';
COMMENT ON COLUMN maintenance_schedules.reminder_sent IS 'Whether reminder has been sent for current cycle';
