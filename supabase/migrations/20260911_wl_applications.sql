-- White-label tenant applications: the self-serve "apply for tenancy" flow.
-- A prospective reseller fills out the public application form, which
-- inserts a row here (status='pending_payment') and sends them into Stripe
-- Checkout for the chosen plan. On successful payment, stripe-webhook.js
-- provisions the real white_label_tenants row and flips this row to
-- 'provisioned' (or 'failed' if provisioning hit an error after payment --
-- e.g. a subdomain race -- which needs manual follow-up since the customer
-- already paid).
-- 2026-09-11: task #80 follow-up (self-serve tenancy application + payment).

CREATE TABLE IF NOT EXISTS white_label_applications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name      TEXT NOT NULL,
  subdomain          TEXT NOT NULL,
  support_email      TEXT,
  support_phone      TEXT,
  plan               TEXT NOT NULL CHECK (plan IN ('starter','pro','business')),
  billing            TEXT NOT NULL DEFAULT 'monthly' CHECK (billing IN ('monthly','annual')),
  status             TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','provisioned','failed','canceled')),
  failure_reason     TEXT,
  stripe_session_id  TEXT,
  tenant_id          UUID REFERENCES white_label_tenants(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wl_applications_user ON white_label_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_wl_applications_status ON white_label_applications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wl_applications_stripe_session
  ON white_label_applications(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

ALTER TABLE white_label_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wl_applications_own_or_admin_select" ON white_label_applications;
CREATE POLICY "wl_applications_own_or_admin_select" ON white_label_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- No client-side INSERT/UPDATE policy on purpose: applying and provisioning
-- both go through service-role Netlify functions only (white-label-apply.js,
-- stripe-webhook.js) -- same pattern as white_label_tenant_users, where the
-- client-self-insert policy was deliberately removed
-- (20260327_wl_tenant_users_rls_fix.sql) because it allowed self-joining any
-- tenant by UUID. service_role bypasses RLS entirely, so no explicit
-- service-role policy is needed for those writes.
