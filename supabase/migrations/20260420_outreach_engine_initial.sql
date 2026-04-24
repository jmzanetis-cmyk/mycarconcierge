-- ============================================================================
-- 20260420_outreach_engine_initial.sql
-- ----------------------------------------------------------------------------
-- Canonical schema for the AI Outreach Engine (renamed from www/outreach-schema.sql
-- by Task #137 to consolidate around a single source of truth).
--
-- IMPORTANT:
--   - This file IS the schema. www/outreach-schema.sql is now a SYMLINK to
--     this file so the admin "Copy Schema SQL" button (which fetches that URL)
--     still works without code changes.
--   - All bridge fixes layered on top live in 20260425_outreach_crm_bridge.sql
--     and any later 20260*_outreach_*.sql migrations.
--   - Apply manually via the Supabase SQL Editor (this codebase does not run
--     migrations automatically). Idempotent — every CREATE uses IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS engine_state (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    is_running BOOLEAN DEFAULT TRUE,
    auto_send BOOLEAN DEFAULT TRUE,
    paused_at TIMESTAMPTZ,
    paused_by TEXT,
    pause_reason TEXT,
    discovery_interval_minutes INTEGER DEFAULT 30,
    max_drafts_per_cycle INTEGER DEFAULT 20,
    target_cities TEXT[] DEFAULT ARRAY['East Rutherford, NJ', 'Newark, NJ', 'Jersey City, NJ'],
    search_radius_meters INTEGER DEFAULT 15000,
    last_discovery_run TIMESTAMPTZ,
    last_draft_run TIMESTAMPTZ,
    total_leads_discovered INTEGER DEFAULT 0,
    total_messages_drafted INTEGER DEFAULT 0,
    total_messages_sent INTEGER DEFAULT 0,
    warmup_start_date TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO engine_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS outreach_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('member', 'provider', 'investor')),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    location TEXT,
    source TEXT,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'queued', 'contacted', 'responded', 'converted', 'unsubscribed', 'bounced', 'dead')),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    crm_profile_id UUID,
    crm_sync_status TEXT DEFAULT 'unlinked' CHECK (crm_sync_status IN ('unlinked', 'linked', 'converted', 'duplicate')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_leads_crm_profile ON outreach_leads(crm_profile_id);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_email ON outreach_leads(email);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_status ON outreach_leads(status);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_type ON outreach_leads(type);

CREATE TABLE IF NOT EXISTS outreach_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES outreach_leads(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
    sequence_step INTEGER DEFAULT 1,
    subject TEXT,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'failed', 'skipped', 'bounced')),
    metadata JSONB DEFAULT NULL,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    resend_message_id TEXT,
    twilio_message_sid TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_lead ON outreach_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_status ON outreach_messages(status);

CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('member', 'provider', 'investor')),
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
    auto_send_followups BOOLEAN DEFAULT FALSE,
    first_touch_requires_approval BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    message_template TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_leads (
    campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES outreach_leads(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, lead_id)
);

CREATE TABLE IF NOT EXISTS outreach_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES outreach_leads(id),
    message_id UUID REFERENCES outreach_messages(id),
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_activity_lead ON outreach_activity_log(lead_id);

CREATE TABLE IF NOT EXISTS opportunity_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES outreach_leads(id) ON DELETE CASCADE UNIQUE,
    opportunity_score INTEGER DEFAULT 0 CHECK (opportunity_score BETWEEN 0 AND 100),
    score_rationale TEXT,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    recommended_channel TEXT DEFAULT 'email' CHECK (recommended_channel IN ('email', 'sms', 'both')),
    ai_notes TEXT,
    stage TEXT DEFAULT 'new' CHECK (stage IN ('new', 'draft_ready', 'message_queued', 'contacted', 'engaged', 'converted', 'dead')),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    last_action_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pipeline_lead ON opportunity_pipeline(lead_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON opportunity_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_priority ON opportunity_pipeline(priority);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS outreach_lead_id UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS outreach_source TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS outreach_converted_at TIMESTAMPTZ;

ALTER TABLE engine_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_activity_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'engine_state' AND policyname = 'service_role_engine_state') THEN
    CREATE POLICY "service_role_engine_state" ON engine_state FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'opportunity_pipeline' AND policyname = 'service_role_pipeline') THEN
    CREATE POLICY "service_role_pipeline" ON opportunity_pipeline FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outreach_leads' AND policyname = 'service_role_leads') THEN
    CREATE POLICY "service_role_leads" ON outreach_leads FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outreach_messages' AND policyname = 'service_role_messages') THEN
    CREATE POLICY "service_role_messages" ON outreach_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outreach_campaigns' AND policyname = 'service_role_campaigns') THEN
    CREATE POLICY "service_role_campaigns" ON outreach_campaigns FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campaign_leads' AND policyname = 'service_role_campaign_leads') THEN
    CREATE POLICY "service_role_campaign_leads" ON campaign_leads FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outreach_activity_log' AND policyname = 'service_role_activity_log') THEN
    CREATE POLICY "service_role_activity_log" ON outreach_activity_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION check_crm_duplicate(p_email TEXT, p_phone TEXT)
RETURNS TABLE (exists_in_crm BOOLEAN, profile_id UUID, profile_role TEXT)
LANGUAGE sql AS $$
  SELECT TRUE, id, role
  FROM profiles
  WHERE (p_email IS NOT NULL AND email = p_email)
     OR (p_phone IS NOT NULL AND phone = p_phone)
  LIMIT 1;
$$;

-- NOTE: get_dormant_members is now handled directly in outreach-engine-api.js
-- using Supabase client queries instead of an RPC function, for reliability.
-- The engine queries profiles table directly for members who:
--   - Signed up 3+ days ago
--   - Have no outreach_lead_id
--   - Have a valid email (not test accounts)
-- It also checks vehicle count per member to generate context-aware notes.

CREATE OR REPLACE FUNCTION get_stalled_applications()
RETURNS TABLE (id UUID, full_name TEXT, business_name TEXT, email TEXT, phone TEXT, application_status TEXT)
LANGUAGE sql AS $$
  SELECT p.id, p.full_name, p.business_name, p.email, p.phone,
         pa.status AS application_status
  FROM profiles p
  JOIN provider_applications pa ON pa.user_id = p.id
  WHERE p.role = 'pending_provider'
    AND pa.updated_at < NOW() - INTERVAL '5 days'
    AND pa.status NOT IN ('rejected', 'approved')
    AND p.outreach_lead_id IS NULL
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION get_followup_candidates()
RETURNS TABLE (id UUID, name TEXT, email TEXT, phone TEXT, type TEXT, last_channel TEXT)
LANGUAGE sql AS $$
  SELECT l.id, l.name, l.email, l.phone, l.type,
         m.channel AS last_channel
  FROM outreach_leads l
  JOIN outreach_messages m ON m.lead_id = l.id
  WHERE l.status = 'contacted'
    AND m.status = 'sent'
    AND m.sequence_step = 1
    AND m.opened_at IS NULL
    AND m.sent_at < NOW() - INTERVAL '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM outreach_messages m2
      WHERE m2.lead_id = l.id AND m2.sequence_step >= 2
    )
$$;

CREATE OR REPLACE FUNCTION auto_link_outreach_lead()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  matched_lead_id UUID;
  has_outreach_leads BOOLEAN;
  has_opportunity_pipeline BOOLEAN;
  has_col_lead_id BOOLEAN;
  has_col_source BOOLEAN;
  has_col_converted_at BOOLEAN;
  lead_source TEXT;
  update_parts TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'outreach_leads'
  ) INTO has_outreach_leads;

  IF NOT has_outreach_leads THEN
    RETURN NEW;
  END IF;

  SELECT id INTO matched_lead_id
  FROM outreach_leads
  WHERE crm_profile_id IS NULL
    AND crm_sync_status != 'duplicate'
    AND (
      (NEW.email IS NOT NULL AND email = NEW.email)
      OR (NEW.phone IS NOT NULL AND phone = NEW.phone)
    )
  LIMIT 1;

  IF matched_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE outreach_leads
  SET status = 'converted',
      crm_profile_id = NEW.id,
      crm_sync_status = 'converted',
      updated_at = NOW()
  WHERE id = matched_lead_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'outreach_lead_id'
  ) INTO has_col_lead_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'outreach_source'
  ) INTO has_col_source;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'outreach_converted_at'
  ) INTO has_col_converted_at;

  IF has_col_lead_id OR has_col_source OR has_col_converted_at THEN
    update_parts := ARRAY[]::TEXT[];

    IF has_col_lead_id THEN
      update_parts := array_append(update_parts, 'outreach_lead_id = ' || quote_literal(matched_lead_id));
    END IF;

    IF has_col_source THEN
      SELECT source INTO lead_source FROM outreach_leads WHERE id = matched_lead_id;
      IF lead_source IS NOT NULL THEN
        update_parts := array_append(update_parts, 'outreach_source = ' || quote_literal(lead_source));
      ELSE
        update_parts := array_append(update_parts, 'outreach_source = NULL');
      END IF;
    END IF;

    IF has_col_converted_at THEN
      update_parts := array_append(update_parts, 'outreach_converted_at = NOW()');
    END IF;

    IF array_length(update_parts, 1) > 0 THEN
      EXECUTE 'UPDATE profiles SET ' || array_to_string(update_parts, ', ') || ' WHERE id = ' || quote_literal(NEW.id);
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'opportunity_pipeline'
  ) INTO has_opportunity_pipeline;

  IF has_opportunity_pipeline THEN
    UPDATE opportunity_pipeline
    SET stage = 'converted', last_action_at = NOW()
    WHERE lead_id = matched_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_outreach_lead ON profiles;
CREATE TRIGGER trg_auto_link_outreach_lead
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_link_outreach_lead();

ALTER TABLE engine_state ADD COLUMN IF NOT EXISTS auto_send BOOLEAN DEFAULT TRUE;
ALTER TABLE engine_state ADD COLUMN IF NOT EXISTS warmup_start_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE engine_state ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
UPDATE engine_state SET is_running = TRUE, auto_send = TRUE WHERE id = 1;

DO $$
BEGIN
  ALTER TABLE outreach_leads DROP CONSTRAINT IF EXISTS outreach_leads_status_check;
  ALTER TABLE outreach_leads ADD CONSTRAINT outreach_leads_status_check CHECK (status IN ('new', 'queued', 'contacted', 'responded', 'converted', 'unsubscribed', 'bounced', 'dead'));
  ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_status_check;
  ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_status_check CHECK (status IN ('draft', 'approved', 'sent', 'failed', 'skipped', 'bounced'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
