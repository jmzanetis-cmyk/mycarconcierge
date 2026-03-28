-- =============================================================================
-- White-label Tenant Invite Token
-- Adds a join_token column to white_label_tenants so that tenant membership
-- join authorization is based on a server-issued cryptographic token, not just
-- the domain/host header (which can be spoofed in direct-to-origin requests).
--
-- Security model:
--   - join_token is a random UUID generated at tenant creation time
--   - /api/white-label/config returns join_token only for domain-matched requests
--   - /api/white-label/tenant/join validates join_token against DB (not host header)
--   - join_token can be rotated by tenant admins (via admin portal or API)
--   - The join_token acts as an invite secret: anyone who has it (by visiting the
--     legitimate domain and getting the config) can join the tenant, which is the
--     intended behavior for open white-label tenants
-- =============================================================================

ALTER TABLE white_label_tenants
  ADD COLUMN IF NOT EXISTS join_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_wl_tenants_join_token ON white_label_tenants(join_token);

-- Populate existing rows that have null join_token due to no default being set at insert time
-- (The DEFAULT gen_random_uuid() handles new rows; this UPDATE handles existing ones)
UPDATE white_label_tenants SET join_token = gen_random_uuid() WHERE join_token IS NULL;
