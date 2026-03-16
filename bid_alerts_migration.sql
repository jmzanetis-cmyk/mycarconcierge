ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS member_bid_alerts_sms boolean NOT NULL DEFAULT true;
ALTER TABLE maintenance_packages ADD COLUMN IF NOT EXISTS member_bid_alerts_email boolean NOT NULL DEFAULT false;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS provider_bid_alerts_sms boolean NOT NULL DEFAULT false;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS provider_bid_alerts_email boolean NOT NULL DEFAULT false;
