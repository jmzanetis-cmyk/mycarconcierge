-- Atomic increment function for API usage tracking
-- This ensures concurrent API calls properly increment rather than overwrite

CREATE OR REPLACE FUNCTION upsert_api_usage(
  p_key_id UUID,
  p_month TEXT,
  p_endpoint TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO api_key_usage (api_key_id, month_year, endpoint, calls, updated_at)
  VALUES (p_key_id, p_month, p_endpoint, 1, NOW())
  ON CONFLICT (api_key_id, month_year, endpoint)
  DO UPDATE SET 
    calls = api_key_usage.calls + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION upsert_api_usage(UUID, TEXT, TEXT) TO service_role;
