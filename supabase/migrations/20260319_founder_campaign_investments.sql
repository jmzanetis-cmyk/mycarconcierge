-- Migration: Create founder_campaign_clicks and founder_campaign_investments tables
-- Tracks Wefunder campaign link clicks and attributed investments per founder

-- Campaign click tracking (may already exist; safe to re-run)
CREATE TABLE IF NOT EXISTS founder_campaign_clicks (
  id SERIAL PRIMARY KEY,
  founder_code TEXT NOT NULL,
  user_id UUID,
  ip TEXT,
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_founder_campaign_clicks_code ON founder_campaign_clicks (founder_code);
CREATE INDEX IF NOT EXISTS idx_founder_campaign_clicks_at ON founder_campaign_clicks (clicked_at);

-- Investment attribution tracking (manually logged by admin after Wefunder confirms)
CREATE TABLE IF NOT EXISTS founder_campaign_investments (
  id SERIAL PRIMARY KEY,
  founder_code TEXT NOT NULL,
  amount NUMERIC(12,2),
  investor_email TEXT,
  notes TEXT,
  invested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_founder_campaign_investments_code ON founder_campaign_investments (founder_code);
CREATE INDEX IF NOT EXISTS idx_founder_campaign_investments_at ON founder_campaign_investments (invested_at);
