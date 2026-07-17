# Phase 1 Findings — Money Paths

**Started:** 2026-07-17
**Method:** per the MCC_AUDIT_PLAN.md Phase 1 spec — walk every dollar (care-plan escrow lifecycle, stripe-webhook's 13 event handlers, wallet load/spend, driver tips/cashouts/payouts, bid-credit purchase, founder commissions + clawbacks, member credits/referrals). Reference workflow: the 2026-07-13 PROOF entry in CAR_CLUB_COMPLETION_PLAN.md — code trace → controlled small-dollar live transaction → DB verify → Stripe dashboard cross-check.
**Register class:** findings ranked CRITICAL (would break real money flow if hit) → HIGH (silent data issues) → MEDIUM (hygiene/noise) → LOW (cleanup).

Findings from the Phase 0 automated sweep that touched money paths are cross-referenced here from `PHASE0_FINDINGS.md` — see the escrow "migrate or retire package escrow" bullet already logged in `CAR_CLUB_COMPLETION_PLAN.md` §5 Phase 1 area, which surfaces the maintenance_packages escrow orphan (30 rows, four months).

---

## Summary counts

| Severity | Count | Status |
|---|---|---|
| CRITICAL | 1 | 1 FIXED (Finding #1) |
| HIGH | 2 | 2 FIXED — #2 APPLIED-IN-PROD 2026-07-17 (migration `20260717a`); #5 APPLIED-IN-PROD 2026-07-19 (code + migration `20260719a` after violator dedup) |
| MEDIUM-HIGH | 1 | 1 FIXED · APPLIED-IN-PROD 2026-07-17 (Finding #4 — migration `20260717c`) |
| MEDIUM | 2 | 2 FIXED — #3 APPLIED-IN-PROD 2026-07-17 (migration `20260717b`); #6 APPLIED-IN-PROD 2026-07-19 (migration `20260719a` — both unique index + `apply_founder_payout_atomic` RPC verified) |
| LOW | 1 | 1 open — Finding #8 (account-deletion orphans `founder_payouts` rows) — deferred to future account-deletion lifecycle audit |
| CLEAN verdicts | 5 | wallet_spend, record_bid_pack_commission v2, driver-api cashout, tip status transitions, agent-fleet-admin (Phase 1b) |
| Deferred to Phase 1b | 0 | All addressed: agent-fleet-admin now CLEAN (#7); admin-founders + monthly-scheduled fixed (#5/#6); package-escrow RETIRED (Part 3 below) |

**Migration apply — ✅ APPLIED TO PROD 2026-07-17 via Supabase MCP** (in file order, one at a time, each in its own BEGIN/COMMIT):
1. `20260717a_redeem_credits_add_max_param.sql` — ✅ RPC signature verified in `pg_proc`: 4-arg with `p_max_credit_cents integer`.
2. `20260717b_wallet_ledger_load_ref_unique.sql` — ✅ index verified in `pg_indexes`: partial `WHERE (entry_type='load_cash' AND ref_id IS NOT NULL)`.
3. `20260717c_member_credits_referral_unique.sql` — ✅ index verified in `pg_indexes`: partial `WHERE (referral_id IS NOT NULL)` on `(member_id, referral_id)`.

Pre-check results at apply time: both `wallet_ledger` (load_cash dups) and `member_credits` (member_id+referral_id dups) returned 0 rows in prod on 2026-07-17 — both indexes applied cleanly against current data.

**`handleAccept` sequence audit — CLOSED 2026-07-17.** After Finding #2, I audited the full `handleAccept` function for the call-order antipattern (RPC invoked with fields the caller hasn't yet persisted on the plan row). Result: **CLOSED — only `redeem_credits_for_payment` was affected.** `handleAccept` has exactly two RPC calls total; the second is `wallet_spend` and its inputs (`p_owner_id`, `p_owner_type`, `p_amount_cents`, `p_ref_id`, `p_description`) don't depend on any plan row field set later in the function. Not the pattern-of-many I initially worried about — the antipattern was a one-off, and Finding #2 closes it. Logged here so future readers see the audit was scoped, not skipped.

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

---

## Finding #4 — MEDIUM-HIGH · LATENT (unfixed) · `_grantPendingReferralCredits` race guard is illusory

**Symptom (theoretical, not yet observed in prod):** on concurrent Stripe webhook deliveries for the SAME member's first care-plan payment, both invocations proceed to grant `member_credits` to referrer + referred — double-crediting both parties.

**Root cause:** `_grantPendingReferralCredits` in `netlify/functions/stripe-webhook.js` uses a `.update({status:'credited'}).eq('id', ref.id).eq('status', 'pending')` pattern as its race guard, then checks `updateErr` to decide whether to proceed. The check assumes a "0 rows affected" scenario returns an error — but `.update(...).eq(...)` in supabase-js returns success (no error) even when zero rows match the filter. The `updateErr` guard therefore never fires, and both concurrent invocations pass the "we won the race" branch → both insert the two credit rows → each party gets 2× credited.

**Blast radius:** every referral where the referred member's first care-plan payment triggers webhook redelivery (Stripe 5xx retry, timeout, manual replay from dashboard). Low observed volume today (pilot flow hasn't exercised referrals × card payments), but the same class as Finding #3: fail-open gate + non-idempotent downstream = eventual double-credit.

**Fix (proposed, not yet shipped):** two-part defense-in-depth:
1. Append `.select('id')` to the update and verify row count in JS. `.update(...).eq(...).select('id')` returns the actual rows changed; length 0 → we lost the race → return early. This is the correct idiom for the "did I win the race" check.
2. Unique constraint `member_credits(referral_id, type)` as backstop — even if the JS-level check has a bug, the DB rejects the duplicate insert with a 23505 that the handler catches as no-op. Same shape as Finding #3's proposed wallet_ledger idempotency, applied to member_credits.

**Cross-reference:** third case of the same class today — Finding #3 (wallet_load), Finding #4 (referral credits), both are "webhook redelivery + non-idempotent write." Worth a batch fix: audit every webhook-handler write path for the pattern "checks an error field that supabase doesn't populate for zero-rows" AND "no unique constraint as backstop." Two known instances suggest more.

**Follow-up:** batch with Finding #3 in the next money-path commit (both are "add unique + catch 23505" shape, tiny code delta).

---

## Clean verdicts — audited, no findings

Money paths walked in this pass and cleared. Documenting explicitly so re-audits don't re-inspect them without new signal.

- **`wallet_spend`** — `SELECT ... FOR UPDATE` on the wallet row + FIFO consumption of `wallet_bonus_lots` inside the same transaction + explicit balance guards before any INSERT. No double-spend surface under concurrent calls. Only the LOAD path (Finding #3) is the gap.
- **`record_bid_pack_commission` v2** — the founder-commission RPC hit on bid-pack purchases. Correctly resolves `referred_by_founder_id`, joins `member_founder_profiles` for rate + duration, inserts the commission row with source_ref = PI id. Idempotent via unique constraint on `founder_commissions(source_ref)`. No cap-check or NULL-comparison antipatterns.
- **`driver-api` cashout flow** — **exemplary. The reservation + rollback + `idempotencyKey` pattern here is worth copying to other transfer/payout paths across the codebase.** Reserves the payout amount from driver's earnings ledger in a transaction, calls Stripe with an idempotency key derived from the cashout row id, and either commits on Stripe success OR rolls back the reservation on Stripe failure. No double-payout under retry, no orphaned reservations under crash. **Suggested cross-audit target:** compare this pattern against `founder-payout-monthly-scheduled` and admin-founders transfers (both deferred to 1b below) — if those don't use the same shape, they should.
- **Tip status transitions** — `driver_tips` state machine (`pending → captured → paid_out` and refund/dispute branches). Guards are correct; transitions go through the tip-settlement RPC which uses row locks and rejects out-of-order transitions.

---

## Deferred to Phase 1b — agent-initiated money movement + package-escrow ruling

Explicit deferral: these need their own careful pass beyond a standard money-path walk. Agent-initiated transfers (where a scheduled function or admin RPC moves money without a member action) have different failure modes and different attack surfaces than user-initiated payments — worth isolating.

1. **`founder-payout-monthly-scheduled.js`** — the monthly cron that pays founders their earned commissions. Needs: idempotency check against `founder_payouts` for the (founder_id, month) tuple, Stripe transfer with idempotency key, reservation-and-rollback shape (per the driver-api template above), audit of what happens if the cron runs twice in the same minute. Not exercised in pilot yet (Chris hasn't earned enough for a payout).
2. **`admin-founders` transfers** — admin-initiated one-off founder payouts (out-of-band from the monthly cron). Same class as #1 but human-triggered. Also needs an admin_audit_log entry per transfer.
3. **`agent-fleet-admin` transfers** — where the agent fleet moves credits/reserves on behalf of admin decisions. Read-audit hasn't happened yet; even flagging this as a money path is provisional pending the code-trace.

**Package-escrow ruling:** RETIRE (recommendation, needs Jordan sign-off).
- Superseded by the care-plan escrow flow (which now works after Finding #1's reconcile fix).
- 30 stranded `maintenance_packages` rows exist (per the 2026-07-16 investigation logged in `CAR_CLUB_COMPLETION_PLAN.md` §5 area) — four months of members trying to buy packages that couldn't complete a real payment. **Needs a member-comms decision** before deletion: refund message? apology + credits? silent purge? The rows have no payment settlement to reconcile (no money moved either direction), so the choice is entirely about member experience, not accounting.
- Interim: purchase path already hidden per Batch 1 fix #5 (`members-core.js:3081` `openPackageModal` guarded). Existing packages still display. No new stranded rows can accumulate.
- Deferral is intentional: retirement is a product decision, not a code fix.
- **RESOLVED 2026-07-19 — see Package-Escrow Retirement section below.**

---

## Finding #5 — HIGH · FIXED 2026-07-19 · `admin-founders` double-pay race

**Symptom (theoretical, not observed):** double-click on the "Process Payout" button, concurrent bulk-run overlap with a single-payout call, or retry after a transient DB failure could trigger a second Stripe transfer for the same `founder_payouts` row. Money leaves the platform twice; the founder is over-paid; unwinding requires manual Stripe refund.

**Root cause:** `netlify/functions/admin-founders.js` has TWO payout paths — `process-founder-payout` (single, line ~80) and `process-bulk-payouts` (batch, line ~148). Both had the same three defects:
1. **No atomic claim.** They read the payout row, checked `status !== 'completed'`, then Stripe-transferred, then updated. Between read and update, a second concurrent call sees the same "not completed" state and also transfers.
2. **No `idempotencyKey` on the Stripe transfer.** Even Stripe couldn't dedupe the second transfer request.
3. **Update-failure retry burns money.** If the post-transfer status update failed (DB blip), any retry hit the same non-completed state and transferred again.

**Fix (deploy landed 2026-07-19):**
1. **Atomic claim** — `.update({status:'processing'}).eq('id', payoutId).in('status', ['pending','failed']).select().maybeSingle()`. `.select()` returns the claimed row; a null result means another call already claimed or the row is completed → return 409 (single) or skip (bulk).
2. **Idempotency key** — `founder-payout-${payoutId}` on the Stripe transfer. Per-row for bulk (each row's payout is independent, deduped by its own payoutId).
3. **CRITICAL log on post-transfer update failure** — if Stripe succeeded but the DB update failed, we log at CRITICAL with the Stripe transfer id and do NOT re-throw. Human unwind has the receipt; caller doesn't retry (would trigger another transfer, deduped-by-idempotencyKey but noisy).

**Blast radius before fix:** every admin-triggered payout in prod, including bulk cron-adjacent runs. Not observed in prod yet (low payout volume during pilot), but observable class.

**Cross-reference:** third example of the "check-then-write race + no downstream idempotency" pattern (with Findings #3 and #4). Batch fix pattern is now firmly established — atomic claim via `.update(...).select().maybeSingle()` for the JS-level guard + `idempotencyKey` on the external call for defense in depth.

---

## Finding #6 — MEDIUM · APPLIED-IN-PROD 2026-07-19 · `founder-payout-monthly-scheduled` non-atomic decrement + no idempotencyKey

**Symptom (theoretical):** cron re-run (manual, retry-after-failure, or DST/timing edge) creates a duplicate `founder_payouts` row for the same `(founder_id, payout_period)` before the check-then-insert dedupe catches it. Also: concurrent commission inserts during the same monthly-payout window silently overwrite the snapshot-based `pending_balance` decrement (classic lost update).

**Root cause:** `netlify/functions/founder-payout-monthly-scheduled.js`:
1. No `idempotencyKey` on `stripe.transfers.create` — cron retry-after-failure could double-pay.
2. Period dedupe is check-then-insert against `founder_payouts(founder_id, payout_period)` — race window.
3. `pending_balance` decrement is snapshot-then-write (read current, compute new, write back) — lost update under concurrent commission inserts.

**Fix (deploy landed 2026-07-19):**
1. **Idempotency key** — `monthly-${founderId}-${period}` on the Stripe transfer.
2. **23505 catch** on the `founder_payouts` INSERT — the unique index from migration `20260719a` is the hard backstop; the code catches unique-violation as "already paid this period, skip" (soft-guard remains as the fast path).
3. **Atomic decrement RPC** — new `apply_founder_payout_atomic(p_founder_id, p_amount)` (migration `20260719a` Part B). Single UPDATE with `GREATEST(0, pending_balance - $)` and `total_commissions_paid + $` in the SET clause. No snapshot read; concurrent commission inserts arriving in the same window can no longer overwrite the decrement.
4. **Migration `20260719a`** — unique index on `founder_payouts(founder_id, payout_period)` + the RPC.

**✅ Migration 20260719a APPLIED TO PROD 2026-07-19 via Supabase MCP** — after resolving the pre-check violator.

**Pre-check violator (resolved):**
```
founder_id          | payout_period | dup_count
--------------------+---------------+----------
331d73c1-...-e456a1 | 2026-02       |         3
```

Investigation (2026-07-19) — the 3 rows were all `$75.00 pending weekly` with `stripe_transfer_id=NULL` and `processed_at=NULL`. **Zero money moved.** Rows 2 and 3 were created 112ms apart on 2026-02-05 01:58:12 — classic **Finding #5 race artifact observed in prod data from Feb 2026**, before this batch's atomic-claim fix landed. The `founder_id` also has no corresponding `profiles` row — **ghost founder**, likely a deleted account leaving orphaned payout rows behind (fold into Finding #8 below).

**Resolution:** all 3 rows DELETEd (no money to reconcile, no user impact). Migration 20260719a applied cleanly against empty state, then verified:

- **Unique index** — `pg_indexes`: `CREATE UNIQUE INDEX founder_payouts_founder_period_unique ON public.founder_payouts USING btree (founder_id, payout_period)`.
- **Atomic RPC** — `pg_proc`: `apply_founder_payout_atomic(p_founder_id uuid, p_amount numeric)` with `security_definer = true`.

Applied 15 days ahead of the 2026-08-01 cron fire — the RPC-dependency window (code deploy references an RPC that didn't exist yet) is now closed. The full guard is live: soft-guard check-then-insert as fast path, 23505 backstop from the unique index, atomic decrement via the RPC, idempotencyKey on the Stripe transfer.

**Bonus observation — the entire `founder_payouts` table had exactly 3 rows EVER before this dedupe.** All 3 were phantom-race artifacts from admin-founders (defaults `payout_type='weekly'` at `:82`/`:171`); `founder-payout-monthly-scheduled` has never inserted a row in prod. The monthly cron has been running fine since Feb 2026 but has never found a founder crossing the payout threshold. Post-dedupe: table is at zero. **The founder payout pipeline has never executed a real payout in prod.** No pilot money has flowed through this path yet — Chris's Alpha commissions will be its first real test.

---

## CLEAN verdict #7 — `agent-fleet-admin` money paths — audited 2026-07-19, no findings

Audited: agents propose; humans apply. All money-moving actions are behind `authenticateBearerAdmin` + go through a claim-first pattern with idempotency keys on the Stripe side. The apply step requires human approval before any transfer fires. No double-pay surface.

**LOW nit (informational, not a fix in this batch):** transient Stripe transfer failure in one path permanently cancels the associated commission — there's no retry path even for transient errors. Not a bug (fail-safe over fail-open is the right default for money), but a future improvement could add a retry queue for transient failures with a dead-letter after N attempts. Not blocking; not filed as a Finding.

---

## CLOSED — authorization review for admin-founders + founder-payout-monthly-scheduled

Both files verified behind `authenticateBearerAdmin` (top of `admin-founders.js`; scheduled function is server-triggered, cron-authenticated). Treasurer / agent-fleet paths only propose; humans apply. No caller can trigger a payout without a JWT that resolves to `role='admin'` (or a cron trigger for the scheduled function).

**Authorization is not a gap; the gap was race conditions between authorized invocations** (Findings #5 and #6). Logged here so the Phase 5 auth/RLS sweep doesn't re-audit this territory.

---

## Package-Escrow Retirement — RETIRED 2026-07-19 (Jordan sign-off)

**Ruling:** RETIRED, superseded by the care-plan escrow flow (which now works after Finding #1's reconcile fix).

**Action taken 2026-07-19:**
- Purchase UI already hidden in Audit Batch 1 fix #5 (`members-core.js:3081` `openPackageModal` guarded) — no new stranded rows can accumulate.
- 30 stranded `maintenance_packages` rows marked `status = 'archived'`, `updated_at = NOW()` via `UPDATE maintenance_packages SET status='archived', updated_at=NOW() WHERE status != 'archived'`. Executed via Supabase MCP 2026-07-19; post-update verify: `archived_count=30, unarchived_count=0, total_count=30` (soft-mark preserves rows for reference/audit; no deletion).

**⚠️ Note on the audit-note text.** The directive asked for a per-row note string: `'[2026-07-19] pre-migration escrow flow, retired 2026-07-19, no member comms per Jordan'`. The `maintenance_packages` schema has no `notes` column; the `description` field is member-facing (the plan/service description). Appending audit metadata to a member-facing field would be inappropriate. **Decision: skip the in-row note; log the note text here + in the commit message as the audit trail.** Full note string preserved: `"[2026-07-19] pre-migration escrow flow, retired 2026-07-19, no member comms per Jordan"`. The `status='archived'` + `updated_at` timestamp is the in-row record; this doc is the human-readable receipt.

**Delete-candidates for a future cleanup commit (NOT deleted now — UI unreachable, no runtime risk):**
- `www/stripeutils.js` escrow functions (`createEscrowPayment`, `confirmEscrow`, `releaseEscrow`, `refundEscrow`) — ~90 lines starting around :96.
- `www/members-packages.js` purchase path calling `createEscrowPayment` at :3964.
- Retire in a follow-up "dead-code sweep" commit alongside the Phase 6 triage.

### 🔻 REGRESSION + RECOVERY 2026-07-20 · Archive overreach on member-visible history

**The 2026-07-19 archive overreached.** The `UPDATE maintenance_packages SET status='archived' WHERE status != 'archived'` from commit `ff31cad` swept ALL 30 rows into `status='archived'`, overwriting the pre-archive statuses (and `updated_at`) with no in-row backup. The intent was to close off the retired escrow flow; the effect was to erase member-visible package history because the client render (`renderPackages` at `www/members-packages.js:665-667`) filters by status buckets (`open`, `pending`, `accepted`, `in_progress`, `completed`) and `archived` is not in any bucket.

**What went wrong (root cause):**
- Blanket `WHERE status != 'archived'` swept every row into one bucket regardless of prior state.
- No `status_prev` / notes column captured the old value, so a straight-forward SQL rollback was impossible without a backup source.
- Prior recon captured the aggregate (30 archived) but not per-row before/after.

**Recovery (this commit, 2026-07-20):**
- **Aggregate:** 12 rows had `accepted_bid_id IS NOT NULL` → restored to `status='accepted'`. 18 rows had `accepted_bid_id IS NULL` → stay `archived` (these are the genuinely-stuck never-accepted rows, matching the original retirement intent).
- **Heuristic basis:** all 30 rows had `payment_count = 0`, `work_started_at = NULL`, `work_completed_at = NULL`, `checked_in_at = NULL`. Nothing ever entered work. So the pre-archive statuses were exclusively `open` (no accepted bid) or `accepted` (bid picked, escrow never fired). `accepted_bid_id IS NOT NULL` cleanly separates the two.
- **Jordan's 3 rows verified:** `bd8eefbd-…` [SMOKE TEST] Custody 6D → restored to `accepted`; `0226e339-…` Squeaking Brakes + `553e89d9-…` Engine noise diagnosis → stay `archived` (never bid).
- **Sample member verified:** `d39dd92e-…` had 4 rows, all `accepted_bid_id=NULL`, all stayed `archived` — no restoration needed (entire history was open plans).

**Regression side effect: restored 'accepted' rows would have re-exposed the retired escrow flow's UI.** `renderEscrowPaymentSection` at `members-packages.js:3420-3693` (pre-fix) rendered a **full payment-authorization form for every `accepted`-with-no-payment package** — Apple Pay + Google Pay + Stripe card element + `authorizeEscrowPayment` button + Split Payment button. All CTAs targeted the retired `/api/escrow/*` endpoints. **Gated in this commit:** replaced the awaiting-payment branch with a "Package purchases are being migrated — accepted bid preserved — contact support" info card (matches Batch 1's `openPackageModal` gate shape at `members-core.js:3105-3115`). Prior authorize-payment form removed; git history preserves it if a future migration back is scoped.

**Delete-candidates list updated:** the awaiting-payment form removal in this commit handles a chunk of the retirement debt. The remaining delete-candidates (stripeutils.js escrow functions, members-packages.js:3964 `createEscrowPayment` caller, `openReleasePaymentModal` at :4279 with its `/api/escrow/release/:id` reference) are still deferred to the Phase 6 dead-code sweep.

### 📌 STANDING RULE — bulk status rewrites must copy the old value

**Effective 2026-07-20, no exceptions.** Any future bulk status rewrite (or any bulk column overwrite of a value that drives UI behavior) MUST copy the pre-change value into a `<column>_prev` column or a `notes` field in the SAME UPDATE. Two acceptable shapes:

**Shape A — dedicated `_prev` column** (best for structured queries):
```sql
alter table <table> add column if not exists <col>_prev <type>;
update <table> set <col>_prev = <col>, <col> = '<new_value>', updated_at = now()
where <criteria>;
```

**Shape B — notes append** (for tables that already have a notes field):
```sql
update <table> set
  <col> = '<new_value>',
  notes = coalesce(notes, '') || format(E'\n[%s] pre-change <col>: %s → %s', current_date, <col>, '<new_value>'),
  updated_at = now()
where <criteria>;
```

**When neither works** (schema has neither a `_prev` slot nor a notes column, and adding one is out of scope): the UPDATE must be preceded in the SAME session/transaction by a snapshot table:
```sql
create table if not exists _rewrite_snapshots_YYYYMMDD as
  select id, <col>, updated_at, current_timestamp as snapshot_at
  from <table> where <criteria>;
```

**Why this rule.** The 2026-07-19 overreach illustrated the failure mode: a well-intentioned bulk UPDATE that erased state driving downstream UI behavior, with no in-row rollback path. Heuristic recovery from other column signals worked THIS time (`accepted_bid_id` was a clean discriminator), but that's luck, not guarantee. Future bulk rewrites without a backup slot are a same-class disaster waiting to happen. Cost of the rule: one extra column-add or one extra CTE. Benefit: reversibility without a PITR restore, without heuristics, without guessing.

This rule applies to any bulk status/state overwrite regardless of scale — even the "just 30 rows" case that triggered it here would have benefited. If the UPDATE affects more than one row and overwrites a value the UI reads, this rule fires.

### 📌 STANDING RULE — supabase-js chain additions must update the test mock in the same commit

**Effective 2026-07-20, no exceptions.** Any commit that adds a new supabase-js chain method to a handler covered by a `netlify/functions-tests/*.test.js` file MUST also update that test file's mock Supabase chain builder to support the new method in the SAME commit. Missing this bricks the Netlify `npm test` deploy gate and blocks every subsequent push until repaired.

**Common chain methods to check** — if the handler adds any of these after the mock's existing set, the mock needs a matching addition:

| Chain method | Mock signature to add |
|---|---|
| `.in(col, arr)` | `filters.push(r => Array.isArray(arr) && arr.includes(r[col]))` |
| `.or(query_string)` | parse the OR string or record it as passthrough — full support is tricky, minimum is not-throwing |
| `.match(obj)` | `filters.push(r => Object.entries(obj).every(([k,v]) => r[k] === v))` |
| `.overlaps(col, arr)` | `filters.push(r => Array.isArray(r[col]) && r[col].some(v => arr.includes(v)))` |
| `.contains(col, arr)` | `filters.push(r => Array.isArray(r[col]) && arr.every(v => r[col].includes(v)))` |
| `.filter(col, op, val)` | operator-switch (`eq/gt/gte/lt/lte/is/in/like`) — non-trivial, needs its own helper |
| `.rpc(name, args)` | needs a top-level mock; register per-test handler via `opts.rpcs[name]` or fail fast |
| `.select(...)` after `.update()` / `.insert()` | mock's `.select()` must return `b` (the chain) not the settled result — Phase 1b Finding #4 relied on this |
| `.range(from, to)` / `.limit()` | filter-post-apply pagination; no-op mock is acceptable if tests don't assert pagination |

**Why this rule.** The 2026-07-19/20 deploy jam illustrated the failure mode: commit `480e7dd` added `.in('status', ['pending', 'failed'])` to `admin-founders.js`'s atomic claim. Prod code was correct. The mock in `founding-commission.test.js` didn't implement `.in()`, so `npm test` failed with `supabase.from(...).update(...).eq(...).in is not a function`. Netlify's post-push test gate blocked the deploy, and 3 subsequent commits queued behind it, none reaching the edge until `dd1adb0` added the one-line mock fix. **Diagnostic evidence:** `sw.js` CDN `age: 8291s` (2.3h) at the point of diagnosis — the edge hadn't been updated because no deploy since `480e7dd` had passed the test gate.

**Cost of the rule.** One line per new chain method in the mock. The mock builder is small and centralized; additions mirror existing shapes.

**Benefit.** Deploy-gate failures caught locally at commit time instead of surfacing as an invisible propagation stall. Every Netlify deploy since `480e7dd` was silently blocked; the poll `bffwo7pws` that eventually surfaced the stall wouldn't have been needed if this rule had been in effect during Phase 1b.

**Detection.** Before pushing a change to any handler covered by `netlify/functions-tests/*.test.js`, run `npm test` locally. If a mock-chain error surfaces, the fix goes in the same commit as the code change — never as a follow-up. Local test is fast (`npm test` completes in ~30s on this repo); the discipline is trivial to adopt.

---

## Finding #8 — LOW · OPEN · Account deletion orphans `founder_payouts` rows

**Surfaced 2026-07-19** during Finding #6 pre-check violator investigation. The 3 duplicate rows for `founder_id = 331d73c1-2787-4c38-b701-58c300e456a1` had no corresponding `profiles` row — the founder account was deleted at some point, but the `founder_payouts` rows remained.

**Root cause:** `netlify/functions/account-deletion-core.js` doesn't touch `founder_payouts`. The FK `founder_payouts.founder_id → auth.users(id)` may exist but without `ON DELETE CASCADE` or explicit handling in the deletion pipeline, deleted-user payout rows accumulate. Class matches the pre-`cc80b81` / pre-`18a7bfd` Car Club gap (BUG-01 in `CAR_CLUB_COMPLETION_PLAN.md` §1a) — new tables shipped without matching entries in the deletion pipeline.

**Blast radius:** currently near-zero. `founder_payouts` had exactly 3 rows in prod ever (all now deleted). Orphaned rows would grow only as (a) more founders are onboarded, and (b) some subset of them delete their accounts. Not urgent at pilot scale; would be material at scale.

**Fix (proposed, deferred):** two-part, cheap:
1. Add `founder_payouts` DELETE to the account-deletion pipeline in `account-deletion-core.js` (matches the pattern for the 6 Car Club tables already fixed in `18a7bfd`).
2. Audit the whole `founder_*` table family (`founder_commissions`, `founder_deals`, `founder_invites`, `founder_referrals`, `member_founder_profiles`, `commission_rate_history`, `milestone_achievements`) for the same gap. Likely all of them.

**Deferred to:** future account-deletion lifecycle audit (Phase 4a admin security area or a standalone audit). Not blocking; not Phase 1 money-path scope beyond flagging the class here.

**Historical evidence discovered simultaneously — the founder payout pipeline has NEVER executed a real payout in prod.** `founder_payouts` had 3 total rows ever (all admin-founders phantom-race artifacts from Feb 2026, deleted 2026-07-19). `founder-payout-monthly-scheduled` has never inserted a row. First real payout will be Chris's Alpha commissions when they cross the threshold — this Phase 1b fix batch (Findings #5/#6) hardens the entire pipeline before that first real event.

---

## Stripe dashboard config check — 2026-07-20 (Jordan, guided)

Live-account walkthrough of the Stripe dashboard's webhook config, event subscriptions, and endpoint inventory. Complements the code-side sweep with the missing "does prod's Stripe org actually deliver what the code expects" verification.

**Preconditions cleared:**
- **Account restriction on the org — RESOLVED** by Jordan (verification completed at the Stripe dashboard prompt). Prior to this, some Stripe features and events would have been silently blocked; all clear now.

**Live endpoint confirmed:**
- URL: `www.mycarconcierge.com/api/webhooks/stripe` → routed via `_redirects` to `stripe-webhook` Netlify function.
- Status: **Active**, **0% error rate**, signing secret present. Matches the code path Finding #1's reconcile fallback assumes exists.

**Event subscription change — 8 → 11 (added 3):**
1. `charge.refunded` — pairs with `_handleFounderCommissionClawback` at `stripe-webhook.js:183-306` (was existing handler, now the event actually delivers).
2. `charge.dispute.created` — same clawback path.
3. `payment_intent.amount_capturable_updated` — this is the event Stripe fires on **manual-capture authorization** (Finding #1's root-cause event). Adding it enables the "webhook-driven fast path" that Finding #1's fix flagged as a future improvement — the lazy reconcile stays as the safety-net either way, but authorizations can now heal within seconds instead of at member's next visit.

**⚠️ Handler follow-up:** the `payment_intent.amount_capturable_updated` handler doesn't yet exist in `stripe-webhook.js` (the code path Finding #1 documented). The event is now DELIVERING but hits the webhook's default "unknown event type" branch (200 with no work). Adding the handler is a low-effort follow-up commit — the reconcile logic already exists (`reconcileHeldFromStripe` at `care-plans.js:122`); just needs to be triggered from the webhook path. **Not blocking** — the lazy reconcile continues to work as designed; this just makes it faster.

**New findings from the dashboard check:**

### (a) MEDIUM · `identity.verification_session.*` events UNAVAILABLE — Stripe Identity product never activated

**Symptom:** the app's identity verification feature (grep for `identity_verifications` table + `vehicle-verify.js` handlers) is end-to-end dead. Stripe Identity is the product that generates and confirms `identity.verification_session.*` events; if it's not activated on the org, no such events ever fire, and the whole verification flow has no back-end signal to complete.

**Why unfixed:** this is a **product/cost decision**, not a code fix. Activating Stripe Identity has per-verification cost. Whether MCC wants identity verification live (and if so, for whom — providers only? members buying big packages? drivers?) is a product-strategy question. The code exists but has been dormant since it shipped.

**Cross-reference:** the code-side finding in `PHASE0_FINDINGS.md` mentioned `bgcheck/status` as similar — features shipped without their backend infrastructure. Identity verification is the Stripe-side sibling of the same pattern.

**Action:** flag for the pilot-readiness product-decision review. If activation is deferred, hide the identity-verification UI surfaces (they render prompts users can't complete). If activated, no code change needed — the events start delivering to existing handlers.

### (b) MEDIUM · `account.updated` is Connect-destination-only — joins the Connect follow-up

**Symptom:** the `account.updated` event fires only for Stripe Connect destination accounts (providers with their own Connect Express accounts). It's not a general "any account updated" signal. The code paths that expected it were assuming general-purpose delivery.

**Why grouped with existing follow-up:** this joins the ALREADY-EXTINCT `transfer.paid` / `transfer.failed` handler class (driver payout tracking, pre-driver-launch work). Same root cause — Connect events assume a Connect-account population that doesn't exist yet at pilot scale.

**Action:** deferred to the Connect-events follow-up. Not blocking pilot. When drivers or Connect-onboarded providers scale up, revisit the whole event family as one batch: `account.updated`, `transfer.paid`, `transfer.failed`, `capability.updated`, etc. Currently: dormant events, no code impact.

### (c) LOW · Three RELIC webhook endpoints still Active — recommend disable (stale-secret liability)

Three additional webhook endpoints registered against the Stripe org, currently **Active**, that should not be:
- Old Replit deployment endpoint (pre-Netlify).
- `.co` domain endpoint (pre-`.com` migration).
- Foreign Supabase project endpoint (pre-`ifbyjxuaclwmadqbjcyp` migration).

**Why LOW:** all three are Active but not routed to any live service — Stripe delivers, the destinations return errors or 404s, no code executes. **No data leak, no double-processing risk.**

**Why still flagged:** each endpoint has a **signing secret** registered with Stripe. Anyone with historical access to any of the three (old Replit account, old `.co` DNS control, old Supabase project) could theoretically stand up a listener at that URL and receive signed webhook deliveries. Stale-secret liability — near-zero probability, non-zero if any of the three environments were compromised.

**Action:** disable all three via the Stripe dashboard. Free operation, no dependencies. Small cleanup follow-up.

**Summary for Phase 1 register:** three new sub-findings (a MEDIUM identity/product, a MEDIUM Connect-batch, a LOW relic-cleanup). None block the pilot flow. Not incrementing the top-of-doc counts because these are dashboard-config observations, not code findings — but noting here so a future reader sees the Stripe-side infrastructure state at 2026-07-20.
