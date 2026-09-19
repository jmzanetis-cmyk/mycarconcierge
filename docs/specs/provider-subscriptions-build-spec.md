# Build spec: Provider Subscriptions (for CC)

Source: `MCC Provider Subscriptions — Spec Draft v1` (Jordan, 2026-09-19) as amended by `provider-subscriptions-spec-review.md`. Decisions locked 2026-09-19:

- Commission basis: **gross** (`amount_total`), matching today's `record_bid_pack_commission`.
- Annual prepay: **commissioned monthly as earned**, via future-dated ledger rows.
- Pro / Shop release: **held**, trigger instrumented from day one.
- Founder overrides: **Chris Agrapidis only** (90%, perpetual). Rossy Mateo is *not* agreed — see Phase 0.
- Standard founders: 50% for 12 months from referral date. This is a **change from current behavior** (today: no window).

Four phases, each its own branch and draft, each independently shippable. Phase 1 is the prerequisite for everything and carries most of the risk. Do not start Phase 2 until Phase 1 has been live on production for at least a few days with no ledger/cache drift.

Standing rules from the original spec apply throughout: floor of $3.00/bid; `FEATURE_WALLET` stays false; plans sold on the web only; subscription status is never an input to matchmaker invite selection.

**Two ways to pay, one balance (clarified 2026-09-19).** Plans are *added alongside* bid packs, not in place of them:

- The four existing packs keep their prices, their checkout, and their behavior. Pack credits never expire. A provider who never picks a plan sees no change in any phase except one new, ignorable card.
- A subscriber gets a monthly allotment at a lower per-bid price and can still buy packs (at 10% off) as top-ups.
- **The provider sees one credit balance, not two wallets.** The portal header and every "Your Bid Credits" figure show the single total from the ledger cache. Spend order (founder → subscription → pack) is invisible to the provider; an optional breakdown ("10 plan · 25 pack · 3 free") may appear on hover or in the Credits & Plans section, never as separate balances.
- Nothing in Phase 1 changes what a provider sees or how packs work; it only changes where the number is stored.

---

## Phase 0 — Records (do first, trivial)

1. `docs/CAR_CLUB_COMPLETION_PLAN.md` §"Founder commission models": change Rossy Mateo's row and the paragraph below it to **"PROPOSED — not agreed as of 2026-09-19. Do not implement."** Change the implementation flag from "three founder tiers" to "overrides are data (`commission_overrides`), never code; only Chris is seeded."
2. Add the two spec docs (`provider-subscriptions-spec-review.md` and this file) to the `docs/` index if one exists.

---

## Phase 1 — Credit ledger (no user-visible change)

**Goal:** balance becomes derived from an append-only ledger; every existing read path keeps working through a trigger-maintained cache; every writer is migrated.

### 1.1 Schema (migration `2026MMDDa_credit_ledger.sql`)

```
credit_ledger
  id            bigserial pk
  provider_id   uuid not null references profiles(id)
  delta         integer not null            -- +grant / -spend / -expiry
  source        text not null check (source in ('opening','founder','trial','pack','subscription','bonus','admin','bid','refund','expiry','reversal'))
  lot_id        bigint null references credit_ledger(id)   -- spend/expiry rows point at the grant they consume
  expires_at    timestamptz null            -- grants only; null = never
  invoice_id    text null                   -- Stripe invoice / checkout session id
  ref_type      text null, ref_id text null -- e.g. ('plan_bid', <bid id>) for spends
  created_at    timestamptz default now()
```

- Index on `(provider_id, created_at)`, and a partial index on grants with remaining balance for lot selection (`where delta > 0`).
- RLS: provider SELECT own rows; no client INSERT/UPDATE at all (`TO service_role` only). Admin SELECT via `is_admin()`.
- **Cache:** keep `profiles.bid_credits` and `profiles.free_trial_bids` as materialized caches. A `SECURITY DEFINER` trigger on `credit_ledger` AFTER INSERT recomputes both for that provider (`free_trial_bids` = sum of `founder`/`trial` lots remaining; `bid_credits` = everything else remaining). The 20260918c trigger on `profiles` must **allow writes originating from this trigger** — check how it detects context; if it keys on `auth.role()`, the ledger trigger runs as the table owner and passes. Verify, don't assume.

### 1.2 Backfill (same migration)

One `opening` row per provider with `delta = bid_credits`, and one `founder` row with `delta = free_trial_bids` where > 0 (`expires_at` null). Run inside a transaction; assert `sum(ledger) = profiles.bid_credits + profiles.free_trial_bids` for every provider before commit. Report the provider count and total credits.

### 1.3 Spend: rewrite `place_plan_bid` (migration `..._plan_bid_ledger.sql`)

Replace the two-step counter decrement in `20260619_plan_bid_rpc.sql` with lot selection in this order: **founder/trial lots → subscription lots (earliest `expires_at`, then oldest) → pack/bonus/admin lots (oldest)**. Insert a `-1` spend row with `lot_id` pointing at the consumed grant. Keep the function's signature and return shape identical — `plan-bids.js`, `auto-bid-engine-scheduled.js`, `auto-bid-prefill.js`, `auto-bid-prefill-notify-scheduled.js` call it and must not change. Same treatment for `redeem_credits_for_payment` (`care-plans.js`).

### 1.4 Writers → ledger inserts

Replace each direct `profiles.update({ bid_credits: ... })` with a ledger insert (service role):

| File | Today | Ledger source |
|---|---|---|
| `stripe-webhook.js` ~L274 (pack checkout) | `+ totalBids` | `pack`, `invoice_id` = session id |
| `create-bid-checkout-mobile.js` ~L150 | `+ totalBids` | `pack` |
| `provider-admin.js` ~L408 | admin adjust | `admin` (negative allowed) |
| `car-clubs.js` ~L1216, `agent-fleet-admin.js` ~L836, `ai-ops-admin.js` ~L575 | `+ BONUS_CREDITS` | `bonus` |
| `provider-onboarding.js` ~L342 (finalize) | `bid_credits: 0`, `free_trial_bids: 3` / 999999 | `trial` 3 or `founder` 999999 |

Refund/dispute in `stripe-webhook.js`: add a `refund` row that reverses the unspent remainder of the refunded lot (never below zero spent).

### 1.5 Guardrails

- **Floor-guard test** `netlify/functions-tests/credit-price-floor.test.js`: reads `bid_packs` fixture (+ `subscription_plans` once Phase 2 exists), asserts every `price / credits` and every discounted combination ≥ $3.00. Runs in `npm test`.
- **Drift check** `scripts/check-credit-ledger-drift.sql` + a scheduled function (daily) that compares `sum(ledger)` to the cache per provider and alerts admin on any mismatch. This is the Phase 1 exit criterion.

**Verification:** draft deploy; Claude places a bid as a test provider on the draft and confirms one spend row with the right `lot_id`, cache decremented, `remaining_bid_credits` in the API response unchanged in shape. Drift check returns zero rows.

---

## Phase 2 — Monthly plans (Starter, Standard)

### 2.1 Stripe

Two Products, monthly Prices only for now ($89, $199). Metadata on the Price and stamped onto the Subscription at checkout: `product=provider_plan`, `plan_key=starter|standard`, `credits_per_month=10|25`. **Every provider-plan webhook handler gates on `metadata.product === 'provider_plan'`** — `handleSubscriptionStatusSync` already gates on `white_label` and must not see these.

Register `invoice.paid` and `invoice.payment_failed` on the production webhook endpoint (the others in the spec are already registered). Reuse the existing event-ID idempotency in `stripe-webhook.js`.

### 2.2 Schema (`..._provider_subscriptions.sql`)

```
subscription_plans        plan_key pk, name, credits_per_month, stripe_price_monthly, stripe_price_annual null, is_active, sort_order
provider_subscriptions    id, provider_id, plan_key, stripe_subscription_id unique, stripe_customer_id, status, billing_interval ('month'|'year'),
                          current_period_start, current_period_end, cancel_at_period_end bool, canceled_at, ended_at, created_at
credit_exhausted_events   id, provider_id, subscription_id, occurred_at     -- Pro/Shop trigger instrumentation
```

Seed `subscription_plans` with all four (Pro and Shop `is_active = false`).

### 2.3 Grants and rollover (`invoice.paid`, `billing_reason` in `subscription_create` | `subscription_cycle`)

1. Compute `carry = min(remaining subscription-lot credits for this provider, plan.credits_per_month)`.
2. Expire the excess: for any subscription-lot balance above `carry`, insert `expiry` rows oldest-first until remaining = `carry`.
3. Insert the new grant: `source='subscription'`, `delta=credits_per_month`, `expires_at = null` while active (set on cancellation — see 2.5), `invoice_id` = invoice id.
4. Assert subscription-lot balance ≤ 2 × allotment after the grant.

### 2.4 Checkout and portal

- Web only. New "Plans" card in the existing Bid Credits section (`providers.html`, `data-section="subscription"`), inside `.web-purchase-only`. Native sees nothing new; the existing "Buy on our website" card copy must not mention plan pricing.
- `POST /api/provider/plan-checkout` creates a Stripe Checkout Session in subscription mode with the metadata above; `POST /api/provider/plan-portal` returns a Stripe Billing Portal session for cancel/downgrade (portal configured: cancel at period end, downgrade at period end, upgrade immediate with proration).
- Subscriber top-up discount: `create-bid-checkout.js` applies 10% when the provider has an active subscription (Stripe coupon, not a client-side price).
- Rename the section label from "Bid Credits" to "Credits & Plans" — one string.

### 2.4a Free until first customer (added 2026-09-19, Jordan)

**Rule:** a provider on a plan pays nothing until a member accepts one of their bids. Wording on the Plans card: *"Free until your first customer — up to N bids on us."*

- **Subscription starts in trial with no fixed end.** `plan-checkout` creates the Checkout Session in subscription mode with `subscription_data.trial_end` = now + 730 days (Stripe's practical ceiling) and `trial_settings.end_behavior.missing_payment_method = 'cancel'`. Card is collected at checkout. No invoice is generated at creation.
- **Trial credits:** on `customer.subscription.created` (status `trialing`, `metadata.product = provider_plan`), insert one `subscription` lot of `credits_per_month` with `ref_type = 'trial_grant'`, `invoice_id` null. One trial per provider, ever: `provider_subscriptions.trial_started_at` set once; a second trialing subscription for the same provider is refused at checkout (`409 trial_used`) and offered the paid plan instead.
- **Conversion hook:** on the event that marks a provider's bid as accepted by a member (trace it — likely the accept path in `plan-bids.js` or an `accept_bid` RPC; report which), if the provider has a `trialing` subscription: call `stripe.subscriptions.update(id, { trial_end: 'now', proration_behavior: 'none' })`. Stripe issues the first invoice immediately; the existing `invoice.paid` handler grants the month's allotment with rollover, so unspent trial credits carry (capped by the 2× rule). Record `converted_at` and `converting_bid_id` on `provider_subscriptions`. Idempotent: if the subscription is no longer `trialing`, do nothing.
- **Exhausted without a win:** trial lot at zero, still trialing → the Plans card shows "You've used your N free bids. Buy a pack to keep bidding, or your plan starts when you land your first customer." Packs remain purchasable. No automatic charge.
- **Abandoned trials:** the daily scheduler (Phase 3) cancels trialing subscriptions with no bid activity for 180 days and expires their trial lot. Until Phase 3 ships, leave them.
- **The 3 free signup bids stay** for providers who never pick a plan; they're `trial` lots and spend first, so a plan-trial provider spends those 3 before touching the plan's trial lot.
- **Commission:** none accrues during trial (no invoice). The 12-month window still runs from the referral date, so a long trial eats into a standard founder's window — that's accepted; overrides (Chris) are unaffected.
- **Grant-on-`invoice.paid` (2.3) keys on `metadata.product` and `amount_paid > 0`**, not on `billing_reason`, so the conversion invoice (`subscription_update`) and normal cycles (`subscription_cycle`) both grant.

### 2.5 Lifecycle

- `customer.subscription.updated`: sync `status`, period, `cancel_at_period_end`, plan changes. On upgrade mid-period: grant `new_allotment − old_allotment` now; rollover cap uses the new allotment.
- `customer.subscription.deleted`: set `ended_at`; set `expires_at = ended_at + 60 days` on every remaining subscription lot for that provider.
- `invoice.payment_failed`: no grant; `status = past_due`. Document the Stripe dashboard Smart Retries + "cancel after final attempt" setting as a launch prerequisite.

### 2.6 Commission — one path for packs and plans

Replace the direct RPC call in `stripe-webhook.js` with a single `accrueCommission({ providerId, invoiceId, grossAmount, paidAt, productType })` used by both the pack checkout handler and the new `invoice.paid` handler.

```
referral   = referral record for provider (trace: register_provider_referral RPC → which table/columns hold referrer + referred_at; report before coding)
if none → return
override   = commission_overrides row for referrer (Chris seeded: rate 0.90, window_months null)
rate       = override.rate ?? 0.50
window_end = override ? null : referral.referred_at + 12 months
if window_end and paidAt >= window_end → return
insert commission_ledger (referrer_id, provider_id, invoice_id, product_type, gross_amount, rate, amount = round(gross*rate,2), earned_on = paidAt, status='payable')
```

`commission_overrides` (`referrer_id pk, rate, window_months null, note`) seeded with Chris only. Refund/dispute: existing void/negative-entry logic in `stripe-webhook.js` moves onto `commission_ledger`. Founder dashboard and `total_commissions_earned` read from the ledger.

**Instrumentation:** in `place_plan_bid`, when a spend takes the provider's subscription-lot balance to zero and they have an active subscription, insert a `credit_exhausted_events` row (once per period). Add a "Interested in a larger plan?" link on the Plans card that records `plan_interest` with the plan key.

**Verification:** draft with Stripe test mode. Claude subscribes a test provider to Starter, confirms 10-credit grant on `invoice.paid`, replays the same event (no double grant), advances the clock via Stripe test clocks to confirm rollover cap, cancels and confirms the 60-day `expires_at` stamps. Commission row appears for a referred test provider and does not for an unreferred one.

---

## Phase 3 — Annual plans and the scheduler

- Add annual Prices ($890, $1,990) and `stripe_price_annual` to the two live plans.
- **Scheduled function `plan-cycle-scheduled.js` (daily):**
  1. For each active annual subscription whose monthly anniversary (of `current_period_start`) falls today and hasn't been granted: run the 2.3 rollover + grant, with `invoice_id` = the annual invoice and a `cycle_month` marker to make it idempotent.
  2. Expire any lot with `expires_at < now()` (insert `expiry` rows).
  3. Run the drift check from 1.5.
- **Annual commission as earned:** on the annual `invoice.paid`, insert **12** `commission_ledger` rows, `earned_on` = each month's start, `amount = round(gross/12 × rate, 2)` (last row absorbs rounding). Only months with `earned_on < window_end` are inserted for standard founders. The payout job must skip rows where `earned_on > now()`. Refund: void rows with `earned_on` after the refund date; negative entry for already-paid rows.

**Verification:** Stripe test clock advanced through three monthly anniversaries — three grants, rollover honored, commission rows dated correctly, nothing granted twice.

---

## Phase 4 — Admin and founder surfaces

- Admin: "Provider Plans" section (distinct from the white-label "SaaS Subscriptions" section) — plan list with `is_active` toggle, subscriptions table (provider, plan, status, period end, lot balance), commission ledger view with payable/paid filters, `credit_exhausted_events` and `plan_interest` counts with the Pro/Shop release rule shown against them.
- Founder dashboard: commission ledger with `earned_on`, status, and product type; 12-month window end shown for standard founders.
- Provider-facing terms page section (spec §7): price, auto-renewal, cancel-anytime, no cash value, 60-day expiry, rollover cap in plain numbers. Counsel reviews the NJ auto-renewal wording before Phase 2 goes to production — flag this as a Phase 2 launch blocker in the report.

---

## Acceptance (carried from the original spec, amended)

- Floor guard passes for every plan × interval × top-up combination.
- Subscribing never changes invite eligibility or ordering.
- Credits appear only on `invoice.paid` (or the scheduler for annual months); replaying an event grants nothing.
- Subscription-lot balance never exceeds 2× allotment.
- Spend order: founder → subscription (earliest expiry) → pack.
- Referral at month 11 + annual purchase → commission rows for in-window months only.
- Chris's referrals accrue at 90% with no window; everyone else stops at 12 months.
- Refund produces the correct void/negative entries.
- Ledger sum equals cache for every provider, every day.
- No plan pricing or purchase path reachable from the iOS app.
- A trialing provider is never invoiced until a bid is accepted; the accepted-bid hook converts exactly once; a provider cannot start a second trial.
- Trial credits carry into the first paid month under the rollover cap.

---

## Reporting rules for CC

Before writing Phase 1 code, report: how 20260918c detects the caller (so the ledger trigger is allowed to write the cache), and the exact table/columns that hold the referral date. Before Phase 2, report the Stripe dashboard retry settings currently in place. Stop and say so if anything in this document contradicts what's in the repo.
