// ============================================================================
// _accrue-commission
//
// One commission-accrual path for packs AND plans, replacing the old
// record_bid_pack_commission RPC. Insert a commission_ledger row when a
// referred provider pays for a pack or plan invoice.
//
// Referrer identity is standardized to profiles.id (equivalent to
// member_founder_profiles.user_id when the founder exists in that table)
// per docs/specs/provider-subscriptions-build-notes.md (Phase 2 decisions).
//
// **Two-step resolver** (see the notes doc for full trace):
//   1. LEFT JOIN founder_referrals ON referred_user_id = providerId
//      → founder_id = member_founder_profiles.id
//        → member_founder_profiles.user_id = referrer_user_id
//   2. Fallback: LEFT JOIN provider_referrals ON referred_user_id = providerId
//      → provider_id column already stores user_id directly
//        (provider_referral_codes.provider_id = the founder's user_id)
//   3. Whichever hits, take earliest created_at as referred_at.
//
// **Short-circuits** (all return null and record nothing):
//   - Provider has profiles.commission_opt_out = true.
//   - No referrer resolvable.
//   - paidAt ≥ referred_at + 12 months, unless override.window_months is null.
//
// **Rate**:
//   commission_overrides.rate for the referrer, else 0.50.
//   window_months from override; null = perpetual. Missing override = 12.
//
// **Idempotency**: caller uses invoice_id as the natural key. Callers
// SHOULD check commission_ledger for an existing (referrer_id, invoice_id)
// row before invoking — accrueCommission itself does not dedupe.
// ============================================================================

const STANDARD_RATE          = 0.50;
const STANDARD_WINDOW_MONTHS = 12;

function _addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Resolve the referrer for a given referred provider.
 *
 * Returns { referrer_user_id, referred_at } or null.
 */
async function resolveReferrer(sb, providerId) {
  if (!providerId) return null;

  // Step 1 — member-founder path (founder_referrals + member_founder_profiles).
  const { data: fr } = await sb
    .from('founder_referrals')
    .select('founder_id, created_at')
    .eq('referred_user_id', providerId)
    .eq('referred_type', 'provider')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fr && fr.founder_id) {
    // Filter status='active' — inactive founders don't earn. Same
    // invariant the old record_bid_pack_commission RPC enforced.
    const { data: mfp } = await sb
      .from('member_founder_profiles')
      .select('user_id')
      .eq('id', fr.founder_id)
      .eq('status', 'active')
      .maybeSingle();
    if (mfp && mfp.user_id) {
      return { referrer_user_id: mfp.user_id, referred_at: fr.created_at };
    }
    // Member-founder path is intended primary; if the join misses (or
    // the founder is inactive) we still try the provider-founder
    // fallback below.
  }

  // Step 2 — provider-founder fallback (provider_referrals from
  // provider_referral_codes). provider_referrals.provider_id stores
  // the code owner's user_id directly (see referral-process.js).
  const { data: pr } = await sb
    .from('provider_referrals')
    .select('provider_id, created_at')
    .eq('referred_user_id', providerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pr && pr.provider_id) {
    return { referrer_user_id: pr.provider_id, referred_at: pr.created_at };
  }

  return null;
}

/**
 * accrueCommission — insert a commission_ledger row if the referred
 * provider's paidAt falls within the referrer's active window.
 *
 * @param {object} sb            — Supabase service-role client
 * @param {object} args
 * @param {string} args.providerId    — profiles.id of the paying provider
 * @param {string} args.invoiceId     — stripe invoice id (or session id for packs)
 * @param {number} args.grossAmount   — dollars (NUMERIC — Stripe's amount_total / 100)
 * @param {string} args.paidAt        — ISO timestamp (invoice.status_transitions.paid_at, or now())
 * @param {string} args.productType   — 'pack' | 'plan'
 * @returns {Promise<{
 *   inserted?: {id: number, amount: number},
 *   skipped?: string
 * }>}
 */
async function accrueCommission(sb, { providerId, invoiceId, grossAmount, paidAt, productType }) {
  try {
    if (!providerId || !invoiceId || !grossAmount || grossAmount <= 0) {
      return { skipped: 'invalid_args' };
    }
    if (!['pack','plan'].includes(productType)) {
      return { skipped: 'invalid_product_type' };
    }

    // commission_opt_out short-circuit — Phase 2 decision, preserves the
    // behavior of the old record_bid_pack_commission v2 body.
    const { data: profile } = await sb
      .from('profiles')
      .select('commission_opt_out')
      .eq('id', providerId)
      .maybeSingle();
    if (profile && profile.commission_opt_out === true) {
      return { skipped: 'commission_opt_out' };
    }

    // Resolve referrer via two-step resolver.
    const referral = await resolveReferrer(sb, providerId);
    if (!referral) return { skipped: 'no_referrer' };

    // Rate + window from commission_overrides, else standard 50%/12mo.
    const { data: override } = await sb
      .from('commission_overrides')
      .select('rate, window_months')
      .eq('referrer_id', referral.referrer_user_id)
      .maybeSingle();
    const rate = (override && override.rate != null) ? Number(override.rate) : STANDARD_RATE;
    // window_months: override wins (null in DB = perpetual). No override
    // → standard 12 months from referred_at.
    let windowEnd = null;
    if (override) {
      if (override.window_months != null) {
        windowEnd = _addMonths(new Date(referral.referred_at), override.window_months);
      }
    } else {
      windowEnd = _addMonths(new Date(referral.referred_at), STANDARD_WINDOW_MONTHS);
    }
    const paidAtDate = new Date(paidAt);
    if (windowEnd && paidAtDate >= windowEnd) {
      return { skipped: 'past_window_end', window_end: windowEnd.toISOString() };
    }

    const amount = Math.round(Number(grossAmount) * rate * 100) / 100;

    const { data: row, error } = await sb
      .from('commission_ledger')
      .insert({
        referrer_id: referral.referrer_user_id,
        provider_id: providerId,
        invoice_id:  invoiceId,
        product_type: productType,
        gross_amount: grossAmount,
        rate,
        amount,
        earned_on:   paidAt,
        status:      'payable',
      })
      .select('id, amount')
      .single();
    if (error) {
      console.error('[accrue-commission] insert failed:', error.message);
      return { skipped: 'insert_failed', details: error.message };
    }

    return { inserted: row };
  } catch (e) {
    // No throw path — commission accrual is best-effort and cannot break
    // the money-flow it hangs off of.
    console.error('[accrue-commission] exception:', e.message);
    return { skipped: 'exception', details: e.message };
  }
}

module.exports = { accrueCommission, resolveReferrer };
