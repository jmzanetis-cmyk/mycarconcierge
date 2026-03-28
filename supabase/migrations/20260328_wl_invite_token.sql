-- Add join_token for token-based tenant membership authorization.
-- /api/white-label/tenant/join validates by join_token DB lookup (not host headers).
-- /api/white-label/config returns join_token only for authenticated requests.

ALTER TABLE white_label_tenants
  ADD COLUMN IF NOT EXISTS join_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_wl_tenants_join_token ON white_label_tenants(join_token);

UPDATE white_label_tenants SET join_token = gen_random_uuid() WHERE join_token IS NULL;
