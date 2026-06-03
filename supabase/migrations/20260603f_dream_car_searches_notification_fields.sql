-- Add missing columns to dream_car_searches that the client has always tried to write.
-- notification_email / notification_phone store per-search alert destinations.
-- min_mileage completes the mileage range (max_mileage already existed).

ALTER TABLE public.dream_car_searches
  ADD COLUMN IF NOT EXISTS min_mileage integer,
  ADD COLUMN IF NOT EXISTS notification_email text,
  ADD COLUMN IF NOT EXISTS notification_phone text;
