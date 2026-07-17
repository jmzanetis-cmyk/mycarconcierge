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
| HIGH | 0 | — |
| MEDIUM | 0 | — |
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
