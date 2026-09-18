-- ============================================================================
-- Task #474 — Block self-service edits to privileged profile columns.
--
-- Background: the live `profiles_update_self` policy is
--   USING (auth.uid() = id) WITH CHECK (auth.uid() = id)
-- with no column restriction, so any signed-in user with the public anon
-- key can PATCH /rest/v1/profiles?id=eq.<self> setting privileged columns
-- like `role='admin'`, `bid_credits`, `verification_status`, etc. Every
-- admin-* Netlify function trusts profiles.role === 'admin', so this is a
-- full privilege escalation.
--
-- This migration extends the BEFORE UPDATE trigger from
-- 20260428e_provider_writes_rls_lockdown.sql (function name preserved:
-- `restrict_profile_suspension_writes`) to cover the full set of
-- privileged columns, keeping the original service_role bypass and the
-- suspension_reason / suspended_at checks intact.
--
-- Trigger rules (non-service_role, non-admin callers):
--
--   Rule A — bid_credits, free_trial_bids: NEW must be <= OLD. Any
--     increment rejects. Real credit grants come from stripe-webhook.js
--     (service_role client, bypassed) and bid-credit-reconciler-scheduled.js.
--     Browser-side increment paths in providers-bids.js / providers.js are
--     demo-mode fallbacks that only run when USE_STRIPE is false; they will
--     start failing loudly after this migration, which is intentional.
--
--   Rule B — role: only allowed transition is OLD IN (NULL, 'member') ->
--     NEW = 'pending_provider'. This preserves the existing-member ->
--     provider signup upgrade path in signup-provider.js:314. Every other
--     role change (member -> admin, member -> provider directly, etc.)
--     rejects and must go through server-side admin endpoints.
--
--   Rule C — is_also_member, total_bids_used, total_bids_purchased:
--     monotonic. is_also_member allowed false/null -> true only.
--     total_bids_* allowed NEW >= OLD only (increment-only counters). All
--     three are written from legitimate browser flows (member->provider
--     upgrade and bid submit) but must not be resettable, which would let
--     a provider hide their bidding history or downgrade their dual-role.
--
--   Rule D — reject any change to the following columns (denylist):
--     * identity/trust: account_type, is_also_provider, application_status,
--       verification_status, is_verified, provider_verified,
--       identity_verified, identity_verified_at, stripe_identity_session_id,
--       phone_verified, phone_verified_at, sales_partner_verified,
--       bgc_badge_verified
--     * money/credits: bid_credits_unlimited, platform_fee_exempt,
--       pos_enabled, stripe_customer_id, stripe_account_id
--     * founder/referral attribution: is_founding_provider, is_founding_member,
--       founding_member_joined_at, referred_by, referred_by_code,
--       referred_by_founder_id, referred_by_provider_id, referred_by_member_id,
--       member_referral_code, provider_referral_type, team_provider_id,
--       preferred_provider_id
--     * enforcement: suspended, strikes
--       (suspension_reason and suspended_at are preserved from 20260428e)
--     * background check: background_check_status, background_check_cleared_at,
--       background_check_id, bgc_total_employees, bgc_compliant_employees,
--       bgc_compliance_pct, bgc_last_computed_at
--     * security: two_factor_secret, two_factor_enabled,
--       two_factor_expires_at, two_factor_verified_at, qr_code_token,
--       phone_login_method
--     * system: id, email, created_at, outreach_lead_id, outreach_source,
--       outreach_converted_at
--
-- Explicitly NOT in the denylist (self-editable — user preferences and
-- profile data): full_name, phone, address, city, state, zip_code,
-- street_address, lat, lng, business_name, business_address, provider_alias,
-- description, services_offered, years_experience, years_in_business,
-- certifications, insurance_info, business_hours, is_24_seven, can_tow,
-- emergency_enabled, emergency_radius, emergency_services, emergency_settings,
-- booking_guidance, preferred_language, directory_opt_in, directory_slug,
-- qr_checkin_enabled, sms_notifications, sms_bid_received, sms_work_completed,
-- sms_new_message, sms_bidding_ending, sms_consent, sms_consent_date,
-- sms_opt_out, sms_opt_out_at, tos_accepted, tos_accepted_at, utm_source,
-- utm_medium, utm_campaign, utm_content, utm_term, referral_source,
-- dealership_name, dealer_license, brands_carried, sales_settings,
-- is_sales_partner, updated_at, commission_opt_out (self-service preference,
-- not a fraud vector — moved from the audit REJECT list per browser-write
-- cross-check).
--
-- Bypasses (added):
--   * public.is_admin() — used by prod policies profiles_select_admin and
--     vehicles_all_admin; body lives in prod (predates the migrations
--     folder) and is documented in docs/audit/2026-09-18-profiles-vehicles-policies.sql.
--
-- INSERT-time restrictions are OUT OF SCOPE for this trigger (BEFORE UPDATE
-- only). Every signup path INSERTs a fresh profile row with role from the
-- browser; whether the live INSERT policy already restricts role will be
-- confirmed against #469 query C output. If it does not, a follow-up will
-- add a BEFORE INSERT trigger with the same rules.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restrict_profile_suspension_writes()
RETURNS trigger AS $$
BEGIN
  -- Bypass 1: caller is anything other than the PostgREST-managed anon or
  -- authenticated role. PostgREST SET ROLEs to anon / authenticated /
  -- service_role per request, so this branch bypasses service_role
  -- uniformly *and* covers the postgres superuser, pg_cron jobs, the
  -- Supabase SQL editor, and any CLI / one-off script — fixing the
  -- 20260428e OPERATOR NOTE limitation where auth.role() returned NULL
  -- for non-JWT sessions and (unintentionally) hit the guarded checks.
  -- Callers we want the rules to APPLY to are exactly anon/authenticated.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- Bypass 2: caller is an admin (per public.is_admin(), defined in prod).
  -- Covers any surviving admin browser writes that still go through the
  -- authenticated role. Every audited admin write should be moving to
  -- service_role via a Netlify function eventually.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  ----------------------------------------------------------------------------
  -- Preserved from 20260428e: block direct writes to suspension columns.
  -- Every legitimate suspend/activate flows through
  -- netlify/functions/provider-admin.js (service-role client).
  ----------------------------------------------------------------------------
  IF NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    RAISE EXCEPTION 'profiles.suspension_reason can only be modified via the provider-admin server endpoint'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
    RAISE EXCEPTION 'profiles.suspended_at can only be modified via the provider-admin server endpoint'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- Rule A — bid_credits / free_trial_bids: decrement or unchanged only.
  ----------------------------------------------------------------------------
  IF NEW.bid_credits IS DISTINCT FROM OLD.bid_credits
     AND COALESCE(NEW.bid_credits, 0) > COALESCE(OLD.bid_credits, 0) THEN
    RAISE EXCEPTION 'profiles.bid_credits can only be decremented from browser writes; increments must go through the Stripe webhook or an admin endpoint'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.free_trial_bids IS DISTINCT FROM OLD.free_trial_bids
     AND COALESCE(NEW.free_trial_bids, 0) > COALESCE(OLD.free_trial_bids, 0) THEN
    RAISE EXCEPTION 'profiles.free_trial_bids can only be decremented from browser writes'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- Rule B — role: only NULL/member -> pending_provider is allowed.
  ----------------------------------------------------------------------------
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT (
      (OLD.role IS NULL OR OLD.role = 'member')
      AND NEW.role = 'pending_provider'
    ) THEN
      RAISE EXCEPTION 'profiles.role changes must go through an admin endpoint; only the signup upgrade (member -> pending_provider) is allowed from a browser'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- Rule C — monotonic columns.
  ----------------------------------------------------------------------------
  IF NEW.is_also_member IS DISTINCT FROM OLD.is_also_member
     AND NOT (COALESCE(OLD.is_also_member, false) = false AND NEW.is_also_member = true) THEN
    RAISE EXCEPTION 'profiles.is_also_member can only transition false/null -> true from browser writes'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.total_bids_used IS DISTINCT FROM OLD.total_bids_used
     AND COALESCE(NEW.total_bids_used, 0) < COALESCE(OLD.total_bids_used, 0) THEN
    RAISE EXCEPTION 'profiles.total_bids_used is monotonic non-decreasing from browser writes'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.total_bids_purchased IS DISTINCT FROM OLD.total_bids_purchased
     AND COALESCE(NEW.total_bids_purchased, 0) < COALESCE(OLD.total_bids_purchased, 0) THEN
    RAISE EXCEPTION 'profiles.total_bids_purchased is monotonic non-decreasing from browser writes'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- Rule D — reject any change (denylist).
  -- Grouped by category, IS DISTINCT FROM handles NULL transitions correctly.
  ----------------------------------------------------------------------------

  -- identity/trust
  IF NEW.account_type              IS DISTINCT FROM OLD.account_type              THEN RAISE EXCEPTION 'profiles.account_type is server-managed'              USING ERRCODE = '42501'; END IF;
  IF NEW.is_also_provider          IS DISTINCT FROM OLD.is_also_provider          THEN RAISE EXCEPTION 'profiles.is_also_provider is server-managed'          USING ERRCODE = '42501'; END IF;
  IF NEW.application_status        IS DISTINCT FROM OLD.application_status        THEN RAISE EXCEPTION 'profiles.application_status is server-managed'        USING ERRCODE = '42501'; END IF;
  IF NEW.verification_status       IS DISTINCT FROM OLD.verification_status       THEN RAISE EXCEPTION 'profiles.verification_status is server-managed'       USING ERRCODE = '42501'; END IF;
  IF NEW.is_verified               IS DISTINCT FROM OLD.is_verified               THEN RAISE EXCEPTION 'profiles.is_verified is server-managed'               USING ERRCODE = '42501'; END IF;
  IF NEW.provider_verified         IS DISTINCT FROM OLD.provider_verified         THEN RAISE EXCEPTION 'profiles.provider_verified is server-managed'         USING ERRCODE = '42501'; END IF;
  IF NEW.identity_verified         IS DISTINCT FROM OLD.identity_verified         THEN RAISE EXCEPTION 'profiles.identity_verified is server-managed'         USING ERRCODE = '42501'; END IF;
  IF NEW.identity_verified_at      IS DISTINCT FROM OLD.identity_verified_at      THEN RAISE EXCEPTION 'profiles.identity_verified_at is server-managed'      USING ERRCODE = '42501'; END IF;
  IF NEW.stripe_identity_session_id IS DISTINCT FROM OLD.stripe_identity_session_id THEN RAISE EXCEPTION 'profiles.stripe_identity_session_id is server-managed' USING ERRCODE = '42501'; END IF;
  IF NEW.phone_verified            IS DISTINCT FROM OLD.phone_verified            THEN RAISE EXCEPTION 'profiles.phone_verified is server-managed'            USING ERRCODE = '42501'; END IF;
  IF NEW.phone_verified_at         IS DISTINCT FROM OLD.phone_verified_at         THEN RAISE EXCEPTION 'profiles.phone_verified_at is server-managed'         USING ERRCODE = '42501'; END IF;
  IF NEW.sales_partner_verified    IS DISTINCT FROM OLD.sales_partner_verified    THEN RAISE EXCEPTION 'profiles.sales_partner_verified is server-managed'    USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_badge_verified        IS DISTINCT FROM OLD.bgc_badge_verified        THEN RAISE EXCEPTION 'profiles.bgc_badge_verified is server-managed'        USING ERRCODE = '42501'; END IF;

  -- money/credits
  IF NEW.bid_credits_unlimited     IS DISTINCT FROM OLD.bid_credits_unlimited     THEN RAISE EXCEPTION 'profiles.bid_credits_unlimited is server-managed'     USING ERRCODE = '42501'; END IF;
  IF NEW.platform_fee_exempt       IS DISTINCT FROM OLD.platform_fee_exempt       THEN RAISE EXCEPTION 'profiles.platform_fee_exempt is server-managed'       USING ERRCODE = '42501'; END IF;
  IF NEW.pos_enabled               IS DISTINCT FROM OLD.pos_enabled               THEN RAISE EXCEPTION 'profiles.pos_enabled is server-managed'               USING ERRCODE = '42501'; END IF;
  IF NEW.stripe_customer_id        IS DISTINCT FROM OLD.stripe_customer_id        THEN RAISE EXCEPTION 'profiles.stripe_customer_id is server-managed'        USING ERRCODE = '42501'; END IF;
  IF NEW.stripe_account_id         IS DISTINCT FROM OLD.stripe_account_id         THEN RAISE EXCEPTION 'profiles.stripe_account_id is server-managed'         USING ERRCODE = '42501'; END IF;

  -- founder/referral attribution
  IF NEW.is_founding_provider      IS DISTINCT FROM OLD.is_founding_provider      THEN RAISE EXCEPTION 'profiles.is_founding_provider is server-managed'      USING ERRCODE = '42501'; END IF;
  IF NEW.is_founding_member        IS DISTINCT FROM OLD.is_founding_member        THEN RAISE EXCEPTION 'profiles.is_founding_member is server-managed'        USING ERRCODE = '42501'; END IF;
  IF NEW.founding_member_joined_at IS DISTINCT FROM OLD.founding_member_joined_at THEN RAISE EXCEPTION 'profiles.founding_member_joined_at is server-managed' USING ERRCODE = '42501'; END IF;
  IF NEW.referred_by               IS DISTINCT FROM OLD.referred_by               THEN RAISE EXCEPTION 'profiles.referred_by is server-managed'               USING ERRCODE = '42501'; END IF;
  IF NEW.referred_by_code          IS DISTINCT FROM OLD.referred_by_code          THEN RAISE EXCEPTION 'profiles.referred_by_code is server-managed'          USING ERRCODE = '42501'; END IF;
  IF NEW.referred_by_founder_id    IS DISTINCT FROM OLD.referred_by_founder_id    THEN RAISE EXCEPTION 'profiles.referred_by_founder_id is server-managed'    USING ERRCODE = '42501'; END IF;
  IF NEW.referred_by_provider_id   IS DISTINCT FROM OLD.referred_by_provider_id   THEN RAISE EXCEPTION 'profiles.referred_by_provider_id is server-managed'   USING ERRCODE = '42501'; END IF;
  IF NEW.referred_by_member_id     IS DISTINCT FROM OLD.referred_by_member_id     THEN RAISE EXCEPTION 'profiles.referred_by_member_id is server-managed'     USING ERRCODE = '42501'; END IF;
  IF NEW.member_referral_code      IS DISTINCT FROM OLD.member_referral_code      THEN RAISE EXCEPTION 'profiles.member_referral_code is server-managed'      USING ERRCODE = '42501'; END IF;
  IF NEW.provider_referral_type    IS DISTINCT FROM OLD.provider_referral_type    THEN RAISE EXCEPTION 'profiles.provider_referral_type is server-managed'    USING ERRCODE = '42501'; END IF;
  IF NEW.team_provider_id          IS DISTINCT FROM OLD.team_provider_id          THEN RAISE EXCEPTION 'profiles.team_provider_id is server-managed'          USING ERRCODE = '42501'; END IF;
  IF NEW.preferred_provider_id     IS DISTINCT FROM OLD.preferred_provider_id     THEN RAISE EXCEPTION 'profiles.preferred_provider_id is server-managed'     USING ERRCODE = '42501'; END IF;

  -- enforcement
  IF NEW.suspended                 IS DISTINCT FROM OLD.suspended                 THEN RAISE EXCEPTION 'profiles.suspended is server-managed'                 USING ERRCODE = '42501'; END IF;
  IF NEW.strikes                   IS DISTINCT FROM OLD.strikes                   THEN RAISE EXCEPTION 'profiles.strikes is server-managed'                   USING ERRCODE = '42501'; END IF;

  -- background check
  IF NEW.background_check_status    IS DISTINCT FROM OLD.background_check_status    THEN RAISE EXCEPTION 'profiles.background_check_status is server-managed'    USING ERRCODE = '42501'; END IF;
  IF NEW.background_check_cleared_at IS DISTINCT FROM OLD.background_check_cleared_at THEN RAISE EXCEPTION 'profiles.background_check_cleared_at is server-managed' USING ERRCODE = '42501'; END IF;
  IF NEW.background_check_id       IS DISTINCT FROM OLD.background_check_id       THEN RAISE EXCEPTION 'profiles.background_check_id is server-managed'       USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_total_employees       IS DISTINCT FROM OLD.bgc_total_employees       THEN RAISE EXCEPTION 'profiles.bgc_total_employees is server-managed'       USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_compliant_employees   IS DISTINCT FROM OLD.bgc_compliant_employees   THEN RAISE EXCEPTION 'profiles.bgc_compliant_employees is server-managed'   USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_compliance_pct        IS DISTINCT FROM OLD.bgc_compliance_pct        THEN RAISE EXCEPTION 'profiles.bgc_compliance_pct is server-managed'        USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_last_computed_at      IS DISTINCT FROM OLD.bgc_last_computed_at      THEN RAISE EXCEPTION 'profiles.bgc_last_computed_at is server-managed'      USING ERRCODE = '42501'; END IF;

  -- security (2FA / phone-login)
  IF NEW.two_factor_secret         IS DISTINCT FROM OLD.two_factor_secret         THEN RAISE EXCEPTION 'profiles.two_factor_secret is server-managed'         USING ERRCODE = '42501'; END IF;
  IF NEW.two_factor_enabled        IS DISTINCT FROM OLD.two_factor_enabled        THEN RAISE EXCEPTION 'profiles.two_factor_enabled is server-managed'        USING ERRCODE = '42501'; END IF;
  IF NEW.two_factor_expires_at     IS DISTINCT FROM OLD.two_factor_expires_at     THEN RAISE EXCEPTION 'profiles.two_factor_expires_at is server-managed'     USING ERRCODE = '42501'; END IF;
  IF NEW.two_factor_verified_at    IS DISTINCT FROM OLD.two_factor_verified_at    THEN RAISE EXCEPTION 'profiles.two_factor_verified_at is server-managed'    USING ERRCODE = '42501'; END IF;
  IF NEW.qr_code_token             IS DISTINCT FROM OLD.qr_code_token             THEN RAISE EXCEPTION 'profiles.qr_code_token is server-managed'             USING ERRCODE = '42501'; END IF;
  IF NEW.phone_login_method        IS DISTINCT FROM OLD.phone_login_method        THEN RAISE EXCEPTION 'profiles.phone_login_method is server-managed'        USING ERRCODE = '42501'; END IF;

  -- system
  IF NEW.id                        IS DISTINCT FROM OLD.id                        THEN RAISE EXCEPTION 'profiles.id is immutable from browser writes'          USING ERRCODE = '42501'; END IF;
  IF NEW.email                     IS DISTINCT FROM OLD.email                     THEN RAISE EXCEPTION 'profiles.email is server-managed'                     USING ERRCODE = '42501'; END IF;
  IF NEW.created_at                IS DISTINCT FROM OLD.created_at                THEN RAISE EXCEPTION 'profiles.created_at is immutable from browser writes'  USING ERRCODE = '42501'; END IF;
  IF NEW.outreach_lead_id          IS DISTINCT FROM OLD.outreach_lead_id          THEN RAISE EXCEPTION 'profiles.outreach_lead_id is server-managed'          USING ERRCODE = '42501'; END IF;
  IF NEW.outreach_source           IS DISTINCT FROM OLD.outreach_source           THEN RAISE EXCEPTION 'profiles.outreach_source is server-managed'           USING ERRCODE = '42501'; END IF;
  IF NEW.outreach_converted_at     IS DISTINCT FROM OLD.outreach_converted_at     THEN RAISE EXCEPTION 'profiles.outreach_converted_at is server-managed'     USING ERRCODE = '42501'; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger definition unchanged from 20260428e — we're just extending the
-- function body. Keep DROP IF EXISTS + CREATE for idempotency.
DROP TRIGGER IF EXISTS trg_restrict_profile_suspension_writes ON public.profiles;
CREATE TRIGGER trg_restrict_profile_suspension_writes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.restrict_profile_suspension_writes();


-- ============================================================================
-- BEFORE INSERT guard
--
-- The live `profiles_insert_self` policy (docs/audit/2026-09-18-profiles-
-- vehicles-policies.sql) is `WITH CHECK (auth.uid() = id)` with no column
-- restriction, so any signed-in user could INSERT their own new profile
-- row with privileged columns set — role='admin', bid_credits=99999,
-- verification_status='verified', etc. — completing the escalation this
-- migration's UPDATE trigger closes on the other side.
--
-- Rule (non-service_role, non-is_admin() callers):
--   For each guarded column, NEW.col must satisfy
--     NEW.col IS NULL  OR  NEW.col IS NOT DISTINCT FROM <column default>
--   with a small set of shape-based exceptions listed below. Defaults were
--   pulled verbatim from pg_attrdef on 2026-09-18 (Task #469 item 4).
--
-- Shape-based exceptions:
--   1) role — allow the observed signup values only:
--        ('member', 'pending_provider', 'provider', 'pending_driver')
--      Verified reachable in browser code today. The 'provider' value is
--      the auto-create fallback in providers-core.js / providers.js —
--      verified intentional (verification_status is the real bidding gate;
--      see Task #474 investigation notes). The 'pending_driver' value is
--      set by signup-driver.html — driver flow is still live (drivers.html
--      links to it in two places).
--   2) is_also_member — allow NULL / false / true unrestricted. It's a
--      dual-role convenience flag, not a privilege, so its INSERT-time
--      value doesn't matter. The UPDATE trigger enforces monotonic
--      false/null -> true once the row exists.
--   3) referred_by_provider_id — allow any UUID. Set client-side today by
--      signup-loyal-customer.html:806 from a server-validated lookup
--      (lookupProvider(refCode)). Task #477 will migrate this fully
--      server-side.
--   4) is_founding_member / founding_member_joined_at — either both set
--      (is_founding_member=true AND founding_member_joined_at NOT NULL) or
--      both absent. Mismatched inserts (e.g. only one true, only one set)
--      reject. Set client-side today by onboarding-member.html when the
--      URL param ?founding=1 is present. There is NO eligibility check
--      today — anyone with the URL param becomes a founding member. Task
--      #476 will migrate this server-side with a real eligibility check.
--   5) is_verified / platform_fee_exempt — allow true only when
--      referred_by_provider_id IS NOT NULL in the same row (loyal-customer
--      signup shape). Either flag true WITHOUT a referrer rejects. Set
--      client-side today by signup-loyal-customer.html:806. Task #477
--      moves this server-side; until then the shape check limits the
--      escalation surface to callers who present a resolved provider ref.
--
-- Follow-up tasks referenced in the exceptions above:
--   #476 — Migrate onboarding-member founding path server-side, gate
--          is_founding_member on a real eligibility check (window, cap,
--          or invitation — not currently defined; the browser-only gate
--          today is just ?founding=1).
--   #477 — Migrate signup-loyal-customer server-side, validate the
--          provider refCode + apply is_verified / platform_fee_exempt /
--          referred_by_provider_id via a Netlify function using the
--          service-role client.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restrict_profile_insert_privileged_writes()
RETURNS trigger AS $$
BEGIN
  -- Bypass 1: caller is anything other than PostgREST-managed anon or
  -- authenticated. Same reasoning as the UPDATE trigger: bypasses
  -- service_role, postgres, pg_cron, SQL editor, and CLI uniformly.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- Bypass 2: caller is admin. Inside BEFORE INSERT, is_admin() reads
  -- profiles.role by auth.uid() — which is a DIFFERENT row from the one
  -- being inserted (a new user hasn't inserted their profile yet at this
  -- point), so it returns true iff the caller already has an admin
  -- profile. A fresh user cannot satisfy this by inserting role='admin'
  -- in the same statement, because is_admin() reads the pre-insert state
  -- (no row for auth.uid() yet -> returns false). See
  -- docs/audit/2026-09-18-profiles-vehicles-policies.sql for the body.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  ----------------------------------------------------------------------------
  -- Rule 1 — role must be an observed browser-signup value.
  ----------------------------------------------------------------------------
  IF NEW.role IS NOT NULL
     AND NEW.role NOT IN ('member', 'pending_provider', 'provider', 'pending_driver') THEN
    RAISE EXCEPTION 'profiles.role INSERT must be one of member/pending_provider/provider/pending_driver; got %', NEW.role
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- Rule 4 — is_founding_member / founding_member_joined_at pair check.
  -- Enforce this BEFORE the strict "NULL or default" rules on those two
  -- columns so a legitimate paired INSERT (both set) passes.
  ----------------------------------------------------------------------------
  IF (NEW.is_founding_member IS TRUE) <> (NEW.founding_member_joined_at IS NOT NULL) THEN
    RAISE EXCEPTION 'profiles.is_founding_member and founding_member_joined_at must be set together at INSERT (or both absent); got is_founding_member=%, founding_member_joined_at=%',
      NEW.is_founding_member, NEW.founding_member_joined_at
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- Rule 5 — is_verified / platform_fee_exempt only allowed true when the
  -- INSERT also sets referred_by_provider_id (loyal-customer shape).
  ----------------------------------------------------------------------------
  IF NEW.is_verified IS TRUE AND NEW.referred_by_provider_id IS NULL THEN
    RAISE EXCEPTION 'profiles.is_verified=true is only allowed at INSERT alongside referred_by_provider_id (loyal-customer signup shape)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.platform_fee_exempt IS TRUE AND NEW.referred_by_provider_id IS NULL THEN
    RAISE EXCEPTION 'profiles.platform_fee_exempt=true is only allowed at INSERT alongside referred_by_provider_id (loyal-customer signup shape)'
      USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------------------
  -- Strict "NULL or default" rules for every remaining guarded column.
  -- Defaults sourced from pg_attrdef 2026-09-18.
  ----------------------------------------------------------------------------

  -- money/credits (defaults from pg_attrdef)
  IF NEW.bid_credits             IS NOT NULL AND NEW.bid_credits             IS DISTINCT FROM 0     THEN RAISE EXCEPTION 'profiles.bid_credits INSERT must be NULL or 0'                       USING ERRCODE = '42501'; END IF;
  IF NEW.free_trial_bids         IS NOT NULL AND NEW.free_trial_bids         IS DISTINCT FROM 3     THEN RAISE EXCEPTION 'profiles.free_trial_bids INSERT must be NULL or 3'                   USING ERRCODE = '42501'; END IF;
  IF NEW.bid_credits_unlimited   IS NOT NULL AND NEW.bid_credits_unlimited   IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.bid_credits_unlimited INSERT must be NULL or false'         USING ERRCODE = '42501'; END IF;
  IF NEW.total_bids_used         IS NOT NULL AND NEW.total_bids_used         IS DISTINCT FROM 0     THEN RAISE EXCEPTION 'profiles.total_bids_used INSERT must be NULL or 0'                   USING ERRCODE = '42501'; END IF;
  IF NEW.total_bids_purchased    IS NOT NULL AND NEW.total_bids_purchased    IS DISTINCT FROM 0     THEN RAISE EXCEPTION 'profiles.total_bids_purchased INSERT must be NULL or 0'              USING ERRCODE = '42501'; END IF;

  -- identity/trust (is_verified and platform_fee_exempt are Rule 5 above)
  IF NEW.account_type            IS NOT NULL AND NEW.account_type            IS DISTINCT FROM 'individual' THEN RAISE EXCEPTION 'profiles.account_type INSERT must be NULL or ''individual'''  USING ERRCODE = '42501'; END IF;
  IF NEW.is_also_provider        IS NOT NULL AND NEW.is_also_provider        IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.is_also_provider INSERT must be NULL or false'              USING ERRCODE = '42501'; END IF;
  IF NEW.application_status      IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.application_status INSERT must be NULL'                     USING ERRCODE = '42501'; END IF;
  IF NEW.verification_status     IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.verification_status INSERT must be NULL'                    USING ERRCODE = '42501'; END IF;
  IF NEW.provider_verified       IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.provider_verified INSERT must be NULL'                      USING ERRCODE = '42501'; END IF;
  IF NEW.identity_verified       IS NOT NULL AND NEW.identity_verified       IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.identity_verified INSERT must be NULL or false'             USING ERRCODE = '42501'; END IF;
  IF NEW.identity_verified_at    IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.identity_verified_at INSERT must be NULL'                   USING ERRCODE = '42501'; END IF;
  IF NEW.stripe_identity_session_id IS NOT NULL                                                     THEN RAISE EXCEPTION 'profiles.stripe_identity_session_id INSERT must be NULL'             USING ERRCODE = '42501'; END IF;
  IF NEW.phone_verified          IS NOT NULL AND NEW.phone_verified          IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.phone_verified INSERT must be NULL or false'                USING ERRCODE = '42501'; END IF;
  IF NEW.phone_verified_at       IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.phone_verified_at INSERT must be NULL'                      USING ERRCODE = '42501'; END IF;
  IF NEW.phone_login_method      IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.phone_login_method INSERT must be NULL'                     USING ERRCODE = '42501'; END IF;
  IF NEW.sales_partner_verified  IS NOT NULL AND NEW.sales_partner_verified  IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.sales_partner_verified INSERT must be NULL or false'        USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_badge_verified      IS NOT NULL AND NEW.bgc_badge_verified      IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.bgc_badge_verified INSERT must be NULL or false'            USING ERRCODE = '42501'; END IF;

  -- money system (stripe ids)
  IF NEW.pos_enabled             IS NOT NULL AND NEW.pos_enabled             IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.pos_enabled INSERT must be NULL or false'                   USING ERRCODE = '42501'; END IF;
  IF NEW.stripe_customer_id      IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.stripe_customer_id INSERT must be NULL'                     USING ERRCODE = '42501'; END IF;
  IF NEW.stripe_account_id       IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.stripe_account_id INSERT must be NULL'                      USING ERRCODE = '42501'; END IF;

  -- founder/referral attribution
  IF NEW.is_founding_provider    IS NOT NULL AND NEW.is_founding_provider    IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.is_founding_provider INSERT must be NULL or false'          USING ERRCODE = '42501'; END IF;
  -- is_founding_member / founding_member_joined_at: paired check in Rule 4 above.
  IF NEW.referred_by             IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.referred_by INSERT must be NULL'                            USING ERRCODE = '42501'; END IF;
  IF NEW.referred_by_founder_id  IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.referred_by_founder_id INSERT must be NULL'                 USING ERRCODE = '42501'; END IF;
  -- referred_by_provider_id: allow any UUID (Rule 3 exception).
  IF NEW.referred_by_member_id   IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.referred_by_member_id INSERT must be NULL'                  USING ERRCODE = '42501'; END IF;
  IF NEW.member_referral_code    IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.member_referral_code INSERT must be NULL'                   USING ERRCODE = '42501'; END IF;
  IF NEW.provider_referral_type  IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.provider_referral_type INSERT must be NULL'                 USING ERRCODE = '42501'; END IF;
  IF NEW.team_provider_id        IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.team_provider_id INSERT must be NULL'                       USING ERRCODE = '42501'; END IF;
  IF NEW.preferred_provider_id   IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.preferred_provider_id INSERT must be NULL'                  USING ERRCODE = '42501'; END IF;

  -- enforcement
  IF NEW.suspended               IS NOT NULL AND NEW.suspended               IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.suspended INSERT must be NULL or false'                     USING ERRCODE = '42501'; END IF;
  IF NEW.suspended_at            IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.suspended_at INSERT must be NULL'                           USING ERRCODE = '42501'; END IF;
  IF NEW.suspension_reason       IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.suspension_reason INSERT must be NULL'                      USING ERRCODE = '42501'; END IF;
  IF NEW.strikes                 IS NOT NULL AND NEW.strikes                 IS DISTINCT FROM 0     THEN RAISE EXCEPTION 'profiles.strikes INSERT must be NULL or 0'                           USING ERRCODE = '42501'; END IF;

  -- background check
  IF NEW.background_check_status    IS NOT NULL                                                     THEN RAISE EXCEPTION 'profiles.background_check_status INSERT must be NULL'                USING ERRCODE = '42501'; END IF;
  IF NEW.background_check_cleared_at IS NOT NULL                                                    THEN RAISE EXCEPTION 'profiles.background_check_cleared_at INSERT must be NULL'            USING ERRCODE = '42501'; END IF;
  IF NEW.background_check_id     IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.background_check_id INSERT must be NULL'                    USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_total_employees     IS NOT NULL AND NEW.bgc_total_employees     IS DISTINCT FROM 0     THEN RAISE EXCEPTION 'profiles.bgc_total_employees INSERT must be NULL or 0'               USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_compliant_employees IS NOT NULL AND NEW.bgc_compliant_employees IS DISTINCT FROM 0     THEN RAISE EXCEPTION 'profiles.bgc_compliant_employees INSERT must be NULL or 0'           USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_compliance_pct      IS NOT NULL AND NEW.bgc_compliance_pct      IS DISTINCT FROM 0     THEN RAISE EXCEPTION 'profiles.bgc_compliance_pct INSERT must be NULL or 0'                USING ERRCODE = '42501'; END IF;
  IF NEW.bgc_last_computed_at    IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.bgc_last_computed_at INSERT must be NULL'                   USING ERRCODE = '42501'; END IF;

  -- security (2FA)
  IF NEW.two_factor_enabled      IS NOT NULL AND NEW.two_factor_enabled      IS DISTINCT FROM false THEN RAISE EXCEPTION 'profiles.two_factor_enabled INSERT must be NULL or false'            USING ERRCODE = '42501'; END IF;
  IF NEW.two_factor_secret       IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.two_factor_secret INSERT must be NULL'                      USING ERRCODE = '42501'; END IF;
  IF NEW.two_factor_expires_at   IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.two_factor_expires_at INSERT must be NULL'                  USING ERRCODE = '42501'; END IF;
  IF NEW.two_factor_verified_at  IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.two_factor_verified_at INSERT must be NULL'                 USING ERRCODE = '42501'; END IF;
  IF NEW.qr_code_token           IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.qr_code_token INSERT must be NULL'                          USING ERRCODE = '42501'; END IF;

  -- outreach (server-set)
  IF NEW.outreach_lead_id        IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.outreach_lead_id INSERT must be NULL'                       USING ERRCODE = '42501'; END IF;
  IF NEW.outreach_source         IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.outreach_source INSERT must be NULL'                       USING ERRCODE = '42501'; END IF;
  IF NEW.outreach_converted_at   IS NOT NULL                                                        THEN RAISE EXCEPTION 'profiles.outreach_converted_at INSERT must be NULL'                  USING ERRCODE = '42501'; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_restrict_profile_insert_privileged_writes ON public.profiles;
CREATE TRIGGER trg_restrict_profile_insert_privileged_writes
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.restrict_profile_insert_privileged_writes();
