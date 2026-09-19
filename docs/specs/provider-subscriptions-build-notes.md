# Build notes — Provider Subscriptions (CC working notes)

Companion to `provider-subscriptions-build-spec.md`. The spec is Jordan's
source of truth (edited in Downloads and re-synced here). This file holds
Claude Code's preflight findings, decision records, and traces that are
part of the build history but shouldn't ride along inside the spec (so
future spec overwrites from Downloads don't clobber them).

Kept as a running log — append new sections; do not overwrite.

---

## Addendum — Phase 1 preflight resolutions + Phase 2 decisions (2026-09-19)

### Phase 1 preflight — answers

**20260918c caller detection.** The BEFORE UPDATE trigger function `restrict_profile_suspension_writes` is `SECURITY INVOKER` (verified via `pg_proc.prosecdef=false`). It gates on `current_user NOT IN ('anon','authenticated')` → `RETURN NEW` at the top. A new `SECURITY DEFINER` trigger owned by `postgres` on `credit_ledger` AFTER INSERT sets `current_user=postgres` when it emits `UPDATE profiles`, so the 20260918c guard sees `postgres` (not `anon`/`authenticated`) and bypasses cleanly. Precedent: `place_plan_bid` (SECURITY DEFINER, owner postgres) has been updating `profiles.bid_credits` in prod today without being rejected — same pattern the ledger trigger will use.

**Referral date column.** `public.founder_referrals.created_at` (timestamptz, default `now()`) is the referral date for the member-founder path. Set on INSERT inside `register_provider_referral` RPC via column default. The alternative `provider_referrals.created_at` covers the provider-founder path (see Chris trace below). Both are populated by `netlify/functions/referral-process.js` on `/api/provider-referral/process`.

**Backfill counts (2026-09-19, prod).** 65 profiles total: 15 provider, 5 pending_provider, 44 member, 1 admin. 64 have non-zero credits. Aggregate: `sum(bid_credits)=60,717`, `sum(free_trial_bids)=176`. The Phase 1 backfill asserts, per profile: `sum(ledger.delta) = profiles.bid_credits + profiles.free_trial_bids`. All 64 non-zero profiles are backfilled (not just providers) so the invariant holds regardless of future role transitions.

### Phase 2 decisions (2026-09-19, do not act until Phase 2)

1. **Identity across the commission path = `profiles.id`.**
   - `commission_overrides.referrer_id` and `commission_ledger.referrer_id` are `profiles.id` (equivalent to `member_founder_profiles.user_id` when the founder exists in that table).
   - `founder_referrals.founder_id` stays as-is (points at `member_founder_profiles.id`) so existing founder-dashboard queries don't break.
   - `accrueCommission` resolves referrer via `member_founder_profiles.user_id` when reading through `founder_referrals`. The existing `record_bid_pack_commission` bug — v2 body looks up `member_founder_profiles WHERE user_id = <profiles.referred_by_founder_id>`, but `register_provider_referral` writes `member_founder_profiles.id` into that column, so the join never matches for standard founders — is retired when the RPC is replaced by `accrueCommission`. Migration header must note this.
2. **`profiles.commission_opt_out` short-circuit preserved.** `accrueCommission` returns early with no ledger row when the referred provider's `commission_opt_out = true`, same behavior as the current v2 RPC. No `commission_ledger` write, no override lookup, no throw.
3. **`member_founder_profiles.total_commissions_earned` becomes a trigger-maintained cache.** Same pattern as `profiles.bid_credits` in Phase 1: an AFTER INSERT/UPDATE trigger on `commission_ledger` recomputes `total_commissions_earned` for the referrer as `SUM(amount) FILTER (status IN ('payable','paid')) - SUM(reversal amounts)`. The ledger is authoritative; the cache exists for read paths (founder dashboard, admin) that already query the column.

### Chris trace — end-to-end (2026-09-19)

Chris uses **both** referral paths depending on which endpoint fires. `accrueCommission` needs to check both.

**Live prod state:**
- `provider_referral_codes.CHRIS` row exists: `id=6928813e…, code_type='provider', provider_id=dbb15523… (Chris's user_id), platform_fee_exempt=true, skip_identity_verification=true, is_active=true, uses_count=0`.
- `member_founder_profiles` row for Chris exists: `id=21837a02…, user_id=dbb15523…, full_name='Chris Agrapidis', commission_rate=0.90, referral_code='CHRIS', status='active'`. Same `user_id` links both.

**When a provider signs up with `?ref=CHRIS`, two code paths write different things:**

- **`register_provider_referral(p_referral_code, p_provider_user_id, p_provider_email)` RPC** (SECURITY DEFINER, called from Flow A onboarding and Flow B signup): looks up `member_founder_profiles.referral_code='CHRIS'`, inserts a `founder_referrals` row (`founder_id=member_founder_profiles.id`), writes `profiles.referred_by_founder_id = member_founder_profiles.id` (the synthetic PK, **NOT** user_id).
- **`POST /api/provider-referral/process` → `_processProviderCode`** in `netlify/functions/referral-process.js` (fires post-finalize for analytics logging): finds CHRIS in `provider_referral_codes` first, inserts a `provider_referrals` row, writes `profiles.referred_by_founder_id = codeData.provider_id = user_id` (Chris's user_id), **THEN** because `codeData.provider_id` is set, also inserts a `founder_referrals` row.

**Race outcome**: `/api/provider-referral/process` fires after `register_provider_referral`, so it overwrites `profiles.referred_by_founder_id` from `member_founder_profiles.id` → `user_id`. That's the value `record_bid_pack_commission` v2 then reads and successfully joins against `member_founder_profiles.user_id`. **Chris's commission path works today by this accidental second overwrite.**

**Standard founders** don't have a `provider_referral_codes` row, so only `register_provider_referral` fires. Their `profiles.referred_by_founder_id` ends up as `member_founder_profiles.id` (not user_id). `record_bid_pack_commission`'s join `WHERE user_id = <that value>` never matches. **Standard founders have never been paid.**

**Implication for Phase 2 `accrueCommission`:** look up the referrer with a two-step resolver:

```
1. LEFT JOIN founder_referrals ON referred_user_id = <provider_id>
   → founder_id (member_founder_profiles.id)
2. Resolve to user_id: SELECT user_id FROM member_founder_profiles WHERE id = <founder_id>
3. If step 1 empty, LEFT JOIN provider_referrals ON referred_user_id = <provider_id>
   → provider_id column (which stores user_id directly for provider-founder codes)
4. Take earliest created_at across whichever hits; that's referred_at
```

The resolver returns a canonical `referrer_user_id` (`profiles.id`) — matches the Phase 2 decision above (identity = profiles.id). Fixing the underlying `profiles.referred_by_founder_id` inconsistency is out of scope for `accrueCommission`; the ledger doesn't care what's in that column once the resolver runs.

**Not fixed in Phase 2**: the race between the two write paths for `profiles.referred_by_founder_id`. A followup could either drop the column (with backfill) or standardize both writers on user_id. The subscriptions build works without touching this if `accrueCommission` uses the resolver above.

**One more note**: `commission_overrides` seeded with Chris will be redundant with `member_founder_profiles.commission_rate = 0.90` for the same user. The spec treats `commission_overrides` as authoritative; `member_founder_profiles.commission_rate` becomes derived/legacy (kept for now, deprecated later). Migration header should call this out.

---

## Phase 1 in-flight notes (2026-09-19, feat/credit-ledger)

**Spec contradiction — §1.3 `redeem_credits_for_payment`.** The spec says "same treatment for redeem_credits_for_payment (care-plans.js)" but that RPC operates on member `member_credits` (in cents, wallet_accounts) — NOT on provider `bid_credits`. It's a wallet-side redemption used when a member applies loyalty credits against escrow at pay-time. Different ledger, different table, different concept. Skipping the redeem_credits_for_payment part of §1.3.

**Migrations added on branch:**
- `20260919g_credit_ledger.sql` — table + indexes + RLS + cache trigger (SECURITY DEFINER, owner postgres) + backfill (opening + founder/trial rows) + sum-equals-cache assertion. Idempotent.
- `20260919h_place_plan_bid_ledger.sql` — DROP + CREATE `place_plan_bid` with lot-selection body (advisory-lock per provider, ORDER BY source-priority → expires_at → created_at). Signature and return shape unchanged; callers untouched.

**Cache trigger semantics** (see 20260919g header for why this works with 20260918c):
- `bid_credits = SUM(delta) WHERE source NOT IN ('founder','trial')` — includes opening, pack, subscription, bonus, admin, bid, refund, expiry, reversal.
- `free_trial_bids = SUM(delta) WHERE source IN ('founder','trial')` — includes founder allotments (Chris) and trial grants (per-signup 3).
- Consequence: Phase 1 changes storage only. Display paths (portal header, admin table, `remaining_bid_credits` in plan-bids.js) all keep reading from the same `profiles` cache columns. Nobody sees a difference.

**Writer migrations pending (§1.4):**
- `stripe-webhook.js` — pack purchase, refund, dispute
- `create-bid-checkout-mobile.js` — mobile pack checkout
- `provider-admin.js` — admin signed adjust
- `car-clubs.js`, `agent-fleet-admin.js`, `ai-ops-admin.js` — bonus grants
- `provider-onboarding.js` finalize — trial (3) / founder (999999) initial grant
- Refund/dispute — add `refund` row that reverses unspent remainder of the refunded lot (never below zero spent)

---

## Phase 1 addendum (2026-09-19 evening) — pack reset, Chris founder state, backfill correction

**Pack catalog reset (20260919i).** All 19 legacy packs deactivated (never deleted — bid_credit_purchases FK preservation). Reactivated Jumper Cables under the name "Single" with sort_order=1; inserted Starter / Standard / Pro / Shop with sort_order 2..5. All five active packs honor the $3.00/bid floor (Single $10, Starter $10, Standard $9, Pro $8, Shop $7 per bid). `price_per_bid` converted from plain column to GENERATED STORED with the corrected formula `price / (bid_count + COALESCE(bonus_bids,0))` — old column stored `price / bid_count` and undersold packs with bonus_bids > 0.

**Chris's founder state (20260919j).** `profiles.is_founding_provider = true` set. His 60,000 opening ledger row reclassified as `source='founder'` so it spends first per §4.3. Balance unchanged (60,000 in the ledger, cache reads 60,003 = 60,000 + 3 trial). Amount kept at 60,000 intentionally — do not "correct" to 999,999.

**Backfill bug + correction (20260919k).** 20260919g's original backfill had a bug: two separate INSERTs in the same transaction, cache trigger fires on first INSERT and zeroes free_trial_bids in the cache (nothing in the ledger yet with source founder/trial), then the second INSERT's `SELECT free_trial_bids FROM profiles WHERE > 0` misses those rows because MVCC per-statement snapshots see the just-zeroed cache. Two profiles lost their trial rows: Chris (3 credits) + Reviewer Provider (5 credits) — matching the 60,893 → 60,885 gap seen post-migration.

- 20260919k inserted the missing trial rows in prod, restoring the state to 60,893 total (Chris 60,003, Reviewer 15).
- 20260919g fixed in-tree to snapshot cache values into a temp table before the first INSERT, and both INSERTs read from the snapshot. Fresh clones apply cleanly.

**Spend-path verification (2026-09-19).** Called `place_plan_bid` for Elizabeth Kim (sim-provider-05, balance 141, single opening lot id=4) against a "Brakes" care_plan for the MCC Demo member. RPC returned `bid_id=f6bf4dd7…, consumed_source='credits', remaining_free=0, remaining_credits=140`. Ledger row id=67 landed with delta=-1, source='bid', lot_id=4, ref_type='plan_bid', ref_id=bid_id. Cache went 141 → 140. Lot pick correct: only lot available; 'opening' is class-3 in the spend order which maps to consumed_source='credits' for caller compatibility. Reversed with an admin +1 row (ref_type='phase1_verification_reversal'); Elizabeth restored to 141, plan_bids row deleted.
