# Review: MCC Provider Subscriptions — Spec Draft v1

Reviewed 2026-09-19 against `main` (post signup-consolidation). Verdict up front: the commercial model is sound and the numbers check. Before it goes to CC, five things in the spec don't match what's actually in the codebase or the repo's own decision record, and one mechanic can't work as written. Fix those, answer the three open decisions, and it's buildable.

---

## A. Things the spec must change

### A1. The repo's decision record claims a third founder tier that was never agreed

The spec models a standard tier (50%, 12 months) and Chris Agrapidis (90%, perpetual). The repo's `docs/CAR_CLUB_COMPLETION_PLAN.md` §"Founder commission models" lists a third — **Rossy Mateo, 75%, perpetual** — marked "CONFIRMED FINAL 2026-07-10", with an implementation flag telling whoever builds commission logic to handle three tiers.

**Jordan's ruling (2026-09-19): Rossy has not agreed to anything. Leave her out.** Chris is the only override at launch. The doc is wrong and must be amended to "proposed, not agreed — do not implement" so CC never builds it in from that file. The `commission_overrides` table stays generic (`referrer_id, rate, window_months`) so a future agreement is a row insert, not code; §5's pseudocode should still describe overrides generically rather than naming Chris.

### A2. Today's commission code is gross-basis with no window — the spec changes existing behavior, not just new behavior

Current implementation (`netlify/functions/stripe-webhook.js` → `record_bid_pack_commission` RPC, migration `20260515b`): commission = `session.amount_total` (gross) × `member_founder_profiles.commission_rate` (default 0.50). **No 12-month window exists anywhere in code.** Standard founders are currently earning in perpetuity, and everyone earns on gross.

So two of the spec's rules — the 12-month window and (if adopted) the net basis — are changes to bid-pack commission as it runs today, not subscription-only rules. Both need to be applied to packs and plans uniformly (one commission path, two product types), and both are term changes founders will notice. See decision #1 below.

### A3. Annual plans can't grant monthly on `invoice.paid` — there is no monthly invoice

§4.1: "credits are granted on `invoice.paid`… Annual plans still grant monthly." An annual Stripe subscription produces **one** invoice per year. Nothing fires monthly. Same problem for §5's "annual prepay commissioned monthly as earned."

Two ways out:

- **(a) Scheduled function** (the repo already has the pattern — `auto-bid-engine-scheduled.js` and friends): a daily job that, for each active annual subscription, grants the monthly tranche on the monthly anniversary of `current_period_start`, applies rollover, and accrues that month's commission. The same job handles the 60-day expiry sweep (§4.4) — which also needs a scheduler and the spec doesn't say so.
- **(b) Bill annual plans monthly at the discounted rate** via a 12-month Stripe subscription schedule ($74.17/mo for Starter). Then `invoice.paid` fires monthly and everything in §4/§5 works as written — but it's no longer a prepay, and cash flow changes.

Recommend **(a)**. It keeps the prepay economics and the scheduler is needed for expiry anyway. The spec should state it: one scheduled function owns annual grants, rollover, expiry, and annual commission accrual.

### A4. Balance today is a mutable counter with ten writers — the ledger is the right model but it's the biggest job in the spec

§6 says "balance is always derived from `credit_ledger`; do not keep a separate mutable counter." Today the balance **is** a mutable counter: `profiles.bid_credits` (plus `free_trial_bids`), decremented atomically inside the `place_plan_bid` RPC (`20260619_plan_bid_rpc.sql`) and incremented by at least nine other writers: `stripe-webhook.js`, `create-bid-checkout-mobile.js`, `provider-admin.js`, `car-clubs.js`, `agent-fleet-admin.js`, `ai-ops-admin.js`, `provider-onboarding.js`, plus the auto-bid engine and prefill jobs via `place_plan_bid`, and `care-plans.js` via `redeem_credits_for_payment`. The 20260918c trigger enforces "browser can only decrement."

The ledger is correct — it's the only way to do lots, expiry, and spend order. But it's a refactor of every writer above, and the spec should say so and phase it. Recommended shape: `credit_ledger` becomes the source of truth; `profiles.bid_credits` stays as a **materialized cache maintained by a database trigger on the ledger**, so every read path (portal header, admin tables, `remaining_bid_credits` in `plan-bids.js`) keeps working untouched while writers are migrated one at a time. Backfill: one opening-balance ledger row per provider from the current counter.

### A5. Spend order omits founder / free bids

§4.3 says subscription credits first, then pack credits. `place_plan_bid` today spends `free_trial_bids` first — and Chris has 999,999 of them (his "unlimited free bids" from §5). The order must be **free/founder bids → subscription credits (oldest lot first) → pack credits**, and free bids should live in the ledger too (source `founder` or `trial`, no expiry) so there's one spend path, not two.

### A6. Two things already in the codebase the spec should name explicitly

- **The white-label product already uses `customer.subscription.*` webhooks.** `handleSubscriptionStatusSync` acts only on subscriptions with `metadata.product === 'white_label'` and syncs `white_label_tenants.status`. The provider-plan handlers must stamp and gate on `metadata.product === 'provider_plan'` (name TBD) so the two products never see each other's events. Admin also already has a "SaaS Subscriptions" section for white-label — the provider-plan admin view needs a distinct name.
- **Web-only purchase is already enforced by a pattern.** `providers.html` hides `.web-purchase-only` on native and `openWebPurchase()` hands off via `@capacitor/browser` (shipped this week). The plan UI goes in the same section (`data-section="subscription"` — currently labeled "Bid Credits") under the same class. The native "Buy on our website" card must not mention plan prices — Apple 3.1.1 permits pointing to the web only if the app doesn't advertise the offer.

---

## B. Answers to the three open decisions

**1. Commission basis — recommend gross.** Three reasons: it's what the code does today; the grandfathered agreements say "90% / 75% of bid-credit pack revenue," and changing the basis on grandfathered founders is a term change worth avoiding; the difference is ~3% (on a Starter plan, $2.59/month per Chris-referred subscriber). Refunds and chargebacks are already clawed back by the existing webhook (void + negative entry), so "net of refunds" is already true in effect. If Jordan wants net-of-Stripe for *new* standard founders only, that's defensible, but it means two bases in one commission path — not worth it at this volume. Revisit when Stripe fees are a line item that matters.

**2. Annual commission monthly as earned — yes**, contingent on A3(a). Implement as future-dated `commission_ledger` rows (`earned_on` = each month's start) written at purchase time, with the payout job refusing rows where `earned_on > now()`. That's simpler than accruing month by month and makes refunds clean: void every row with `earned_on` after the refund date. Matches the existing `status = payable` pattern in the webhook.

**3. Pro/Shop release trigger — yes, but instrument it now.** "5 providers exhaust 25 credits in two consecutive months" is unmeasurable without a signal. Add a `credit_exhausted` ledger event (balance hit zero with an active subscription) from day one, and put a "Notify me about larger plans" link on the plans page so demand is measured directly, not inferred. Release when either condition is met.

---

## C. Smaller notes

- **Upgrade mid-period** (§4.6): specify that the rollover cap uses the *new* allotment, and that the prorated grant is `new_allotment − old_allotment` for the current period, not a full new allotment.
- **Failed payment** (§4.8): "after Stripe's final retry" depends on the dashboard's Smart Retries + "cancel subscription after final attempt" setting. Document the setting as a launch prerequisite; the webhook handles `customer.subscription.deleted` either way.
- **Idempotency** (§6): the existing webhook already dedupes on Stripe event ID — reuse it, don't add a second mechanism.
- **Floor guard** (§4): put it in `netlify/functions-tests/` reading `bid_packs` + `subscription_plans` fixtures so it runs on every push, not only on price changes. Math checks: lowest is Shop annual at $4.99; subscriber top-up on Starter pack is $9.00. All above $3.00.
- **Rollover** (§4.2): formula is right; the 2× cap holds.
- **Terms** (§7): NJ's automatic renewal statute requires clear-and-conspicuous disclosure and an online cancel path — the spec already has both. Counsel confirms wording.
- **Stripe fee table** (§5): every figure verified — $2.88 / $6.07 fees, $43.06 / $96.47 standard commission, $77.51 / $173.64 at 90%.

---

## D. Suggested build phases (for the CC spec that follows this)

1. **Ledger refactor, no user-visible change.** `credit_ledger` + trigger-maintained `profiles.bid_credits` cache + opening-balance backfill + migrate all writers + `place_plan_bid` spends from lots in the order in A5. Floor-guard test lands here.
2. **Monthly plans.** Stripe products/prices (Starter, Standard), checkout on the web, `invoice.paid` grant, rollover on renewal, subscriber top-up discount, `provider_subscriptions` table, `metadata.product` gating. Commission path generalized: one function for packs and plans, overrides table seeded with Chris and Rossy, 12-month window for standard.
3. **Annual + scheduler.** Annual prices, the daily scheduled function (annual tranches, rollover, expiry, future-dated commission accrual), failed-payment handling.
4. **Admin + founder surfaces.** Plans and subscriptions admin (distinct from white-label "SaaS Subscriptions"), commission ledger in the founder dashboard, `credit_exhausted` instrumentation, Pro/Shop waitlist link.

Each phase ships independently; 1 is the prerequisite for everything and is where most of the risk lives.
