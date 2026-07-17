# Phase 1 Findings — Money Paths

**Started:** 2026-07-17
**Method:** per the MCC_AUDIT_PLAN.md Phase 1 spec — walk every dollar (care-plan escrow lifecycle, stripe-webhook's 13 event handlers, wallet load/spend, driver tips/cashouts/payouts, bid-credit purchase, founder commissions + clawbacks, member credits/referrals). Reference workflow: the 2026-07-13 PROOF entry in CAR_CLUB_COMPLETION_PLAN.md — code trace → controlled small-dollar live transaction → DB verify → Stripe dashboard cross-check.
**Register class:** findings ranked CRITICAL (would break real money flow if hit) → HIGH (silent data issues) → MEDIUM (hygiene/noise) → LOW (cleanup).

Findings from the Phase 0 automated sweep that touched money paths are cross-referenced here from `PHASE0_FINDINGS.md` — see the escrow "migrate or retire package escrow" bullet already logged in `CAR_CLUB_COMPLETION_PLAN.md` §5 Phase 1 area, which surfaces the maintenance_packages escrow orphan (30 rows, four months).

---

## Summary counts

| Severity | Count | Status |
|---|---|---|
| CRITICAL | 1 | 1 fixed (Finding #1) |
| HIGH | 1 | latent — Finding #2 unfixed |
| MEDIUM | 1 | dark-feature — Finding #3 unfixed |
| LOW | 0 | — |

---

## Finding #1 — CRITICAL · FIXED 2026-07-17 · Escrow stuck at `requires_payment` on card path

**Reproduction:** none needed. Found by code-trace **before any live dollar was spent** on the pilot's card path. Would have burned the first real Chris transaction if it had shipped as-is.

**Symptom (theoretical):** every card-paid care plan stuck forever at `payment_status = 'requires_payment'`. `handleComplete` returned 409 (Funds not in held state). Providers could never be paid. Auth holds silently expired at Stripe's ~7-day cap.

**Root cause:** the "authorize card → mark held" transition **existed nowhere on the card path**.

- Only writer of `'held'` in the code: the wallet/credits-covers-all branch (`handleAccept` when total covered by wallet + credits).
- No `/api/payment/confirm` endpoint or equivalent — the client's `stripe.confirmCardPayment()` succeeded and left PI at `requires_capture`, but the server never learned.
- `netlify/functions/stripe-webhook.js` has 13 event handlers; none handle `payment_intent.amount_capturable_updated`, which is the event Stripe fires when a **manual-capture authorization** succeeds. (The webhook does handle `payment_intent.succeeded` — but that fires on CAPTURE, not authorization, and capture never happened because release was blocked by the guard at `handleComplete` seeing `payment_status !== 'held'`. Classic deadlock.)

**Fix (`fix(care-plans): escrow stuck at requires_payment on card path — lazy reconcile against Stripe`):**

`reconcileHeldFromStripe(sb, plan)` — lazy server-side heal at `netlify/functions/care-plans.js:122-166`:

- Retrieves the PaymentIntent from Stripe (source of truth).
- If `pi.status === 'requires_capture'`, flips DB `payment_status: 'requires_payment' → 'held'`.
- Conditional UPDATE guarded by `.eq('payment_status', 'requires_payment')` — idempotent under concurrent heals; only one wins.
- Audit row written as `escrow_held_reconciled` with the PI id + before/after state for the paper trail.
- Non-fatal on Stripe retrieve failure (logs, returns original plan) — degradation, not breakage.

Wired into two call sites:

1. `handleGetOne` at `:180` — plan detail load reconciles before the two-query stitch, so the member's UI shows the healed status immediately after they authorize.
2. `handleComplete` at `:486` — heal-then-release order, so a member who authorized but had their DB row never updated can still complete their release when they tap Mark Complete.

**Why lazy vs webhook:** a proper `payment_intent.amount_capturable_updated` handler in stripe-webhook.js would be faster (heals within seconds of Stripe firing the event, not at member's next visit). Adding one is a future improvement — but this reconcile is the safety net that catches every path Stripe events might miss (delivery failure, webhook downtime, race conditions), so it stays regardless.

**Verification:** review-only fix; no live-transaction verification yet. Will be exercised end-to-end when the dress rehearsal resumes at the payment-authorization step (see `CAR_CLUB_COMPLETION_PLAN.md` ⏸ REHEARSAL PAUSED — 2026-07-16 section). The reconcile is expected to fire on the member's next `/api/care-plans/:id` GET after they authorize the card, flipping the plan to `'held'` and enabling `handleComplete` → `payment_intent.capture` → `payment_intent.succeeded` webhook → the earn/redeem chain that already proved out in the 2026-07-13 PROOF sim.

**Blast radius before fix:** every card-paid plan in prod. Wallet-paid plans (rare — requires full coverage from wallet + credits) unaffected. Zero real card-path transactions have completed successfully — this class of bug was 100% failure rate on the card path.

**Follow-up (deferred, non-blocking):** add `payment_intent.amount_capturable_updated` handler to `stripe-webhook.js` as the primary path; the reconcile becomes the fallback. Log as Phase 1 improvement, not a bug.

---

## Finding #2 — HIGH · LATENT (unfixed) · `redeem_credits_for_payment` cap check inert

**Symptom (theoretical, not yet observed in prod):** a member could apply MORE `member_credits` than the accepted bid's dollar value against a care plan, over-drawing the credit pool relative to the actual charge. Would show up as a member paying $0 (or a negative-fee state) for a bid larger than their credit balance — a class the code THINKS is prevented by the cap check but silently isn't.

**Root cause:** `redeem_credits_for_payment` RPC compares the requested-credit amount against `care_plans.escrow_amount` as the cap. But `handleAccept` calls the RPC **before** setting `escrow_amount` on the plan row — so at RPC-call time, `escrow_amount IS NULL`. In Postgres, any comparison against NULL evaluates to NULL (not true, not false). The cap check `IF requested > escrow_amount THEN RAISE` therefore **never raises** — the guard is inert. Every credit request passes the cap regardless of amount.

**Why it hasn't fired in prod:** the credit-apply UI presumably caps its own input at plan value on the client side, and no attacker has probed the direct RPC. Also, most redemptions are for smaller values than the bid, so the inert cap has been shadowed by the natural distribution of usage. Latent — not exercised, not exploited, but present.

**Fix (proposed, not yet shipped):** pass the bid amount as an explicit RPC parameter — `p_max_credit_cents int` — and compare against that, not against the plan row's `escrow_amount` (which is NULL at call time by call-order). The caller (`handleAccept`) already has the bid amount available. Change is one parameter added, one comparison substituted; migration only touches the RPC body, not any table.

**Blast radius:** every card-path acceptance that involves credits. Pilot volume so far: near-zero — the pilot flow captured hasn't exercised member credits alongside a card charge. Would become material once real members with earned referral credits start accepting bids.

**Cross-reference:** the `escrow_amount` NULL-at-call-time timing was surfaced during the Finding #1 investigation of the escrow lifecycle. Same ordering issue, different consequence — Finding #1 broke the escrow-hold transition, Finding #2 breaks the credit-cap check. Both trace to `handleAccept` not writing the terminal plan state before invoking downstream RPCs.

**Follow-up:** ship the parameter fix in the next money-path batch. Also worth an integration test that asserts the RPC RAISEs on over-cap (currently would pass silently — no test would have caught this).

---

## Finding #3 — MEDIUM · DARK FEATURE (unfixed) · `wallet_load` lacks per-PI idempotency

**Symptom (theoretical):** a Stripe `payment_intent.succeeded` webhook redelivery for a wallet-load PI would credit the member's wallet twice. Stripe redelivery happens on: gate errors (5xx from our webhook handler), timeout, and manual replay from the Stripe dashboard. The fail-open gate design means gate-error replay is a known-real class, not just theoretical.

**Root cause:** `wallet_load` (the wallet load handler in `stripe-webhook.js`) writes credits into `wallet_ledger` without a unique constraint or upsert on `ref_id` (the PI id). The webhook-idempotency gate (which prevents duplicate processing for events with the same `stripe_event_id`) is deliberately fail-open on gate error — so if the gate write itself errors (network, DB), the handler runs anyway to avoid dropping real payments. That fail-open design is right, but it means the downstream write MUST be independently idempotent — and `wallet_load` isn't.

**Fix (proposed, not yet shipped):** unique partial index on `wallet_ledger` scoped to load entries:
```sql
CREATE UNIQUE INDEX wallet_ledger_load_ref_unique
  ON wallet_ledger (ref_id)
  WHERE entry_type = 'load' AND ref_id IS NOT NULL;
```
Partial (WHERE) so it doesn't collide with `spend` entries that may not have a ref_id or may share one across split transactions. Handler catches the 23505 unique-violation and treats it as "already loaded, no-op" — proper idempotency without changing the fail-open gate.

**`wallet_spend` audited clean:** the spend path uses `SELECT ... FOR UPDATE` on the wallet row + a FIFO consumption of `wallet_bonus_lots` inside the same transaction, with explicit balance guards before any INSERT. No double-spend surface even under concurrent calls. Only the load path is the gap.

**Why "dark feature":** wallet load isn't in the pilot money path (Chris's flow is care-plan escrow via PI → capture → provider payout, not wallet top-up). Wallet UI is present but light usage — hence dark. Priority is real but not blocking.

**Blast radius:** any wallet-load PI whose webhook gets redelivered. Stripe's own retry behavior means this happens on our 5xx or on any temporary DB error at the gate. Not observed in prod (no reports of double-credited wallets), but the gate design guarantees this will fire eventually.

**Follow-up:** ship the migration + the 23505 catch in the next money-path batch. Simpler fix than Finding #2 (single migration, single catch block).
