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

-- Atomic increment for developer_api_keys.calls_made counter
CREATE OR REPLACE FUNCTION increment_api_key_calls(p_key_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE developer_api_keys
  SET calls_made = calls_made + 1, last_used_at = NOW()
  WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_api_key_calls(UUID) TO service_role;
