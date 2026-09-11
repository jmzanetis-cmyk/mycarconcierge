-- Ensure a "provider" is exclusive to one white-label tenant at a time.
-- Members/admins/owners may belong to multiple tenants (or none); only
-- role='provider' is exclusive, since providers are the resellable network
-- asset each tenant is effectively paying for -- a reseller shouldn't be
-- able to lose a provider to a competing tenant's roster silently, and MCC
-- shouldn't let one provider be double-counted toward two tenants' seat
-- limits/analytics at once.
-- 2026-09-11: requested by Jordan while reviewing the tenant/join backend.

CREATE UNIQUE INDEX IF NOT EXISTS white_label_tenant_users_provider_exclusive
  ON white_label_tenant_users (user_id)
  WHERE role = 'provider';
