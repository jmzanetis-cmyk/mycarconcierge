-- Registration Verification Migration
-- Adds Google Vision OCR-based vehicle registration verification

-- Create verifications table
CREATE TABLE IF NOT EXISTS registration_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  
  -- Registration document
  registration_url TEXT NOT NULL,
  
  -- OCR extracted data
  extracted_text TEXT,
  extracted_owner_name TEXT,
  extracted_vin TEXT,
  extracted_plate TEXT,
  
  -- Profile comparison
  profile_name TEXT,
  name_match_score INTEGER DEFAULT 0, -- 0-100
  
  -- Status: pending, approved, rejected, needs_review
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_review')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE registration_verifications ENABLE ROW LEVEL SECURITY;

-- Users can see their own verifications
CREATE POLICY "Users can view own registration verifications"
  ON registration_verifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own verifications
CREATE POLICY "Users can create registration verifications"
  ON registration_verifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can see all verifications
CREATE POLICY "Admins can view all registration verifications"
  ON registration_verifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Admins can update verifications
CREATE POLICY "Admins can update registration verifications"
  ON registration_verifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Create storage bucket for registration documents (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('registrations', 'registrations', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for registration documents
CREATE POLICY "Users can upload own registrations"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'registrations' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own registrations"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'registrations'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins can view all registrations"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'registrations'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Add registration_verified column to vehicles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vehicles' AND column_name = 'registration_verified'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN registration_verified BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vehicles' AND column_name = 'registration_verification_id'
  ) THEN
    ALTER TABLE vehicles ADD COLUMN registration_verification_id UUID REFERENCES registration_verifications(id);
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_registration_verifications_user_id ON registration_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_registration_verifications_status ON registration_verifications(status);
CREATE INDEX IF NOT EXISTS idx_registration_verifications_vehicle_id ON registration_verifications(vehicle_id);

-- Function to update vehicle verification status
CREATE OR REPLACE FUNCTION update_vehicle_registration_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.vehicle_id IS NOT NULL THEN
    UPDATE vehicles 
    SET registration_verified = TRUE,
        registration_verification_id = NEW.id
    WHERE id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update vehicle when verification is approved
DROP TRIGGER IF EXISTS on_registration_verification_approved ON registration_verifications;
CREATE TRIGGER on_registration_verification_approved
  AFTER UPDATE ON registration_verifications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved')
  EXECUTE FUNCTION update_vehicle_registration_status();
