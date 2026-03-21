-- =====================================================
-- MY CAR CONCIERGE - INSURANCE DOCUMENT STORAGE SYSTEM
-- Run this script in Supabase SQL Editor after main setup
-- Stores insurance cards and policy documents for vehicles
-- =====================================================

-- =====================================================
-- 1. INSURANCE DOCUMENTS TABLE
-- Stores insurance document metadata for member vehicles
-- =====================================================
CREATE TABLE IF NOT EXISTS insurance_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
  member_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Document Type
  document_type TEXT NOT NULL DEFAULT 'insurance_card' CHECK (document_type IN ('insurance_card', 'policy_declaration', 'proof_of_insurance')),
  
  -- Policy Details
  provider_name VARCHAR(255) NOT NULL,
  policy_number VARCHAR(100),
  coverage_start_date DATE,
  coverage_end_date DATE,
  
  -- File Information
  file_url TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  storage_path TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_insurance_documents_vehicle_id ON insurance_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_insurance_documents_member_id ON insurance_documents(member_id);
CREATE INDEX IF NOT EXISTS idx_insurance_documents_end_date ON insurance_documents(coverage_end_date);
CREATE INDEX IF NOT EXISTS idx_insurance_documents_vehicle_type ON insurance_documents(vehicle_id, document_type);

-- =====================================================
-- 3. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE insurance_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running)
DROP POLICY IF EXISTS "Members can view their insurance documents" ON insurance_documents;
DROP POLICY IF EXISTS "Members can insert their insurance documents" ON insurance_documents;
DROP POLICY IF EXISTS "Members can update their insurance documents" ON insurance_documents;
DROP POLICY IF EXISTS "Members can delete their insurance documents" ON insurance_documents;
DROP POLICY IF EXISTS "Service role can manage all insurance documents" ON insurance_documents;

-- Members can view their own insurance documents
CREATE POLICY "Members can view their insurance documents" ON insurance_documents
  FOR SELECT
  USING (member_id = auth.uid());

-- Members can insert insurance documents for their vehicles
CREATE POLICY "Members can insert their insurance documents" ON insurance_documents
  FOR INSERT
  WITH CHECK (
    member_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM vehicles 
      WHERE vehicles.id = insurance_documents.vehicle_id 
      AND vehicles.owner_id = auth.uid()
    )
  );

-- Members can update their own insurance documents
CREATE POLICY "Members can update their insurance documents" ON insurance_documents
  FOR UPDATE
  USING (member_id = auth.uid());

-- Members can delete their own insurance documents
CREATE POLICY "Members can delete their insurance documents" ON insurance_documents
  FOR DELETE
  USING (member_id = auth.uid());

-- Service role can manage all insurance documents (for admin/background jobs)
CREATE POLICY "Service role can manage all insurance documents" ON insurance_documents
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- 4. FUNCTION TO CHECK EXPIRING DOCUMENTS
-- Returns documents expiring within N days
-- =====================================================
CREATE OR REPLACE FUNCTION get_expiring_insurance_documents(m_id UUID, days_ahead INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID,
  vehicle_id UUID,
  document_type TEXT,
  provider_name VARCHAR(255),
  policy_number VARCHAR(100),
  coverage_end_date DATE,
  days_until_expiry INTEGER,
  is_expired BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.vehicle_id,
    d.document_type,
    d.provider_name,
    d.policy_number,
    d.coverage_end_date,
    (d.coverage_end_date - CURRENT_DATE)::INTEGER as days_until_expiry,
    (d.coverage_end_date < CURRENT_DATE) as is_expired
  FROM insurance_documents d
  WHERE d.member_id = m_id
    AND d.coverage_end_date IS NOT NULL
    AND d.coverage_end_date <= (CURRENT_DATE + (days_ahead || ' days')::INTERVAL)
  ORDER BY d.coverage_end_date ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 5. UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_insurance_documents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS insurance_documents_updated_at ON insurance_documents;
CREATE TRIGGER insurance_documents_updated_at
  BEFORE UPDATE ON insurance_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_insurance_documents_timestamp();

-- =====================================================
-- 6. CREATE STORAGE BUCKET FOR INSURANCE FILES
-- Run this in SQL or via Supabase dashboard
-- =====================================================
-- Note: This should be created via Supabase Storage settings
-- Bucket name: insurance-documents
-- Public: false (private, requires signed URLs)

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
