# Car Club — Completion Plan

**Date:** 2026-07-03 · **v1.2** (final — two-pass CC cross-check)
**Status:** Feature flag-gated OFF globally. Ships nothing to members/reviewers in current state.
**Flag:** `platform_settings.car_club_programs_enabled` — `{"enabled":false,"test_users":["8ea2bc19-…" (Jordan)]}` — fail-closed, no admin bypass (verified 2026-07-03).
**Schema source of truth:** migrations `20260703a–h` (commit `04b947b`) — verified column-by-column against production. All column names in new code MUST be checked against this set, not inferred.
**Working agreements (unchanged):** CC proposes first, never commits without Jordan's diff review; Jordan applies all SQL in Supabase Studio; browser verification against the deployed artifact is the acceptance standard; flags fail closed; any change to a JS file in SW `STATIC_ASSETS` ships with a `CACHE_NAME` bump in `sw.js`.

**See also:** [MCC_AUDIT_PLAN.md](MCC_AUDIT_PLAN.md) — the 7-phase whole-app audit (added 2026-07-14). Car Club is the reference implementation for the Phase 1 money-path audit method; the 2026-07-13 PROOF entry below is the workflow template. Findings from any audit phase that touch Car Club specifically get logged here in §1a (real bugs) or §9a (post-pilot debt).

---

## 🔀 DIRECTION CHANGE — 2026-07-13 · Car Club earn model redesign

**Confirmed with Jordan:** the real Car Club earn model is **points-per-dollar-spent**, awarded automatically from MCC's real transactions (bids/jobs/payments). Member spends $X on service with a provider → earns X points (rate TBD) → redeems points against catalog rewards in `club_rewards`. **NOT a punch card.** The pilot design captured in D2 / D5 / D7 and the punch-card build in §4 Slice 2 + §5 provider screen were a wrong-turn framing; this section is the correction of record.

**What's CORRECT and stays (do NOT undo):**
- `redeem_reward_for_member` RPC (`20260706a` / `20260707a`) — right paradigm: reads `club_rewards`, deducts from balance in `club_points_ledger`, issues voucher atomically. Last week's hardening (advisory lock + FOR UPDATE + voucher-first-then-ledger + `pgcrypto` schema-qualify) was correct work against the right target.
- `club_rewards` table (`20260703h:120-131`) — catalog schema with `point_cost` / `inventory_qty` / `active` / `kind`. Right shape for a spend-and-redeem model. The `createReward` / `patchReward` / `listRewards` handlers already exist (see the 2026-07-13 usage map audit).
- `/api/car-club/validate-voucher` — voucher-fulfillment surface is unchanged.
- `club_points_ledger` + `club_points_balance` — right ledger primitive for a points economy.

**What's a WRONG TURN and needs rethinking (do NOT keep as-is):**
- `POST /api/car-club/punch` (`car-clubs.js:440-…`) — flat +1 per scan is punch-card mechanics, not points-per-dollar. The endpoint's shape (scan Check-In QR → +1 delta_points) does not map to spend.
- `club_reward_rules` table (`20260703d`) — punch-threshold model (`punches_required`, `reward_type='punch_card'`). Not the pilot model. `/my-rewards` handler at `car-clubs.js:308` reads it; `car-club-member.html:1103` renders it. All this stack is on the wrong track.
- `provider-club.html` PUNCH column — the QR-scan-→-confirm-→-award-one-punch UX is punch-card, not spend-based.
- Alpha's provisioned reward "Free Detail" @ 10 punches (`club_reward_rules.id = 11835db0-…`, per §1b / §5) — recorded against the wrong model. Needs re-provisioning as a `club_rewards` catalog row (`point_cost` = TBD once the earn rate lands).

**What's NOT BUILT (the actual gap this redesign addresses):**
- The **earn mechanic itself**. There is currently NO code path in the repo that reads MCC transactions (bids / jobs / payments) and translates them into `club_points_ledger` credits. The whole spend → points integration is unwritten. That is the pilot-blocking work.

**NEXT STEP = INVESTIGATION, not build.** Before designing the earn integration, map how MCC transactions currently work — which tables hold spend amounts, what marks a transaction complete, whether an existing hook can be attached to, how refunds are represented. Investigation launched 2026-07-13 in parallel with this log entry; results append below as they land.

**OPEN DESIGN QUESTIONS — decide after the investigation returns:**
1. **Award trigger:** on job-completion, on payment-confirmed, or on bid-acceptance? (Depends on which stage has a clean confirmed-dollar-amount signal.)
2. **Refunds / cancellations:** claw back awarded points? If so, at what stage of the refund lifecycle, and what if the points have already been redeemed?
3. **Granularity:** per-job, per-payment-amount, or per-line-item? (E.g., a $500 job with a $50 tip — is the earn base $500 or $550?)
4. **Marketplace interaction:** how does the earn logic interact with the bid/marketplace flow? (Bid credits are provider-side; points are member-side — no direct collision, but the payment-completion signal may be shared.)
5. **Rounding:** integer points only? Truncate, round-half-up, or bank-round on fractional cents?
6. **Pilot bootstrap mode:** full auto-from-transactions from day one with Chris, or interim provider-manual amount entry (Chris types "$150 today" on `provider-club.html`) to de-risk while auto-integration is designed? Manual mode ships faster but adds a second earn path that has to be retired later.

**Pilot readiness impact — RESET:**
- The §6a Stage-1 → Stage-2 verification protocol (12-step run) is invalidated as written — it exercises punch-scan → +1 → threshold-punch-count → redeem. Rewrite once the earn integration lands.
- §5 provider screen (`provider-club.html`) — PUNCH column is on the wrong model. VALIDATE column is fine (voucher fulfillment paradigm is correct). Redesign PUNCH once the earn trigger is decided (may become "record a transaction," may disappear entirely if earn is fully auto-from-payments).
- §4 Slice 2 (points engine) — earn side needs full redesign; redeem/validate sides are correct.
- §1b branding polish for Alpha — still valid, non-blocking, do after this redesign settles.
- §1b test residue cleanup — still valid, do independently.
- Decisions D2 (pilot earn mechanic — "punch Check-In QR"), D5 (pilot scope — "join → punch → progress → redeem"), and D7 (pilot reward types) all inherit revision from this direction change and need re-recorded once the redesign lands.

**Impact on BUG-02 (redeem RPC / reward-table mismatch, filed 2026-07-13):** the observation in BUG-02 is still accurate — the RPC reads `club_rewards`, not `club_reward_rules` — but the resolution framing is **superseded**. The fix is NOT "mirror rules into rewards" or "rewrite the RPC to read rules." The fix is: retire the punch-card earn side entirely and build the points-per-dollar earn side against the already-correct `club_rewards` + redeem-RPC target. Chris's Alpha reward gets re-provisioned as a `club_rewards` row with a `point_cost` derived from the earn-rate design. BUG-02's technical detail is preserved below for history; its "three resolution options" are dropped in favor of this section.

### 🔻 CORRECTION — 2026-07-13 (later same day) · earn side is NOT "already wired and firing"

**Retraction.** An interim finding earlier this session — based on a read-only code-map — claimed that points-per-dollar earn is "fully wired and firing in production today," pointing at `stripe-webhook.js:381-384` calling `_accrueCarClubPoints`, which invokes `accrue_points` at `20260703h:163-176` (INSERT into `club_points_ledger` with `reason='earn_spend'` and `dollars_spent_cents` populated). **That claim is not supported by the data.** The code exists; there is no evidence it has ever run against a real MCC transaction.

**DB evidence (Jordan, 2026-07-13):** `SELECT reason, COUNT(*) FROM club_points_ledger GROUP BY reason` returns:
- `earn_spend` — 11 rows
- `redeem` — 1 row
- (nothing else)

All 12 rows are test activity from 2026-07-07 through 2026-07-11 — the smoke-test window. The 11 `earn_spend` rows correspond to the `/punch` flat-+1 mechanic exercised during testing, not real member payments. **No real member-transaction data has ever flowed into `club_points_ledger`.**

**Reason-value collision to disambiguate.** The `accrue_points` RPC writes `reason='earn_spend'` (quoted above). The `/punch` handler presumably also writes `reason='earn_spend'` given the ledger content matches punch-test volume 1:1 and there is no other `earn_*` reason in the observed data. If both paths use the same reason, the reason column alone cannot distinguish real-dollar accrual from a punch. The disambiguating column is `dollars_spent_cents` — `accrue_points` populates it from `pi.amount`; whatever `/punch` writes almost certainly leaves it NULL. **Next-session investigation must confirm which reason value `/punch` writes and quote it.**

**Status of the earn side after this correction:**
- **Code plumbing exists** — the chain `stripe-webhook.js:381 → _accrueCarClubPoints → accrue_points RPC → club_points_ledger` is real and quotable.
- **Executability is unproven** — three gates would each block execution in prod today: (a) `car_clubs.points_enabled = true` (default `false`, no pilot club has flipped it); (b) a `club_points_config` row exists for the paying club (no code path creates it during `createClub`); (c) an active `club_memberships` row for the paying member. Absent any of the three, `_accrueCarClubPoints` returns early without writing.
- **Whether the code path is reachable at all under a correctly-provisioned club has never been demonstrated end-to-end in prod.** The plumbing is dormant; whether it works when unblocked is unknown.

**Pilot status:** **NOT ready.** The points-per-dollar earn side — the core of the redesigned Car Club model — has never processed a real transaction. Everything the earlier direction-change block above says about "what stays" (redeem RPC, `club_rewards`, ledger, validate-voucher) is still correct as *code that exists*. But the earn side going from "code that exists" to "code that has ever worked once against a real MCC payment" is the pilot-blocking gap, and it is bigger than a provisioning fix.

**NEXT-SESSION PRIORITY (updated):** investigate — plain-text output only, no build — whether the spend→points code path is actually reachable via a real MCC transaction, and why the ledger shows zero real earn data. Specifically:
- Which `reason` value does `/punch` write? Quote the INSERT.
- Does the accrue chain (`stripe-webhook.js:381` → `_accrueCarClubPoints` → `accrue_points`) get exercised by any existing integration test, smoke test, or manual QA path?
- Are the three gates (`points_enabled`, `club_points_config` row, active `club_memberships`) provisioned for any club in prod today, and if not — is there a documented reason?
- Has any Stripe PaymentIntent in prod ever carried `metadata.care_plan_id + member_id + provider_id` simultaneously? (This is the branch condition at `stripe-webhook.js:382`; if none has, the accrue call has never even been *attempted*.)
- Does the `payment/release` flow set those three metadata fields on the PI at creation time, or only on capture? Quote the metadata write.

**Do NOT build until this investigation confirms whether the code is reachable and what's blocking it.** The earlier "reset" impact section still holds — punch-card side is still a wrong turn, §6a still needs a rewrite, Alpha still needs re-provisioning against `club_rewards` — but do not act on any of that until the earn-side reachability question is answered.

**Downgrade of the earlier interim "80-85% done" verbal estimate:** unsupported by data. Revised estimate: unknown. Could be 80% if the accrue chain is reachable and only provisioning is missing; could be much less if there are additional integration gaps (metadata not written, care-plan flow not attached, etc.) that the investigation surfaces. Do not use a completion percentage in decisions until the investigation returns.

---

### ✅ PROOF — 2026-07-13 (even later same day) · earn + redeem chains proven end-to-end in prod

**The CORRECTION's "unproven / never fired" claim is resolved for the accrue chain path.** Both earn and redeem sides have now been exercised end-to-end against prod with real writes to `club_points_ledger` and `club_points_redemptions`. Every state hypothesized in the CORRECTION is confirmed by observation, not code-reading.

**Earn side — signed-webhook simulation** (`scripts/simulate-club-earn-webhook.js`, added same day). Simulated a Stripe `payment_intent.succeeded` event with a valid HMAC signature and metadata mirroring `care-plans.js:335-347` exactly (`care_plan_id`, `bid_id`, `member_id`, `provider_id`). Sent to `https://mycarconcierge.com/.netlify/functions/stripe-webhook`. Result:
- Signature verification passed.
- Idempotency gate passed (new `stripe_event_id`).
- `_accrueCarClubPoints` (`stripe-webhook.js:459-507`) reached all four gates:
  - Gate A `points_enabled=true` on Alpha — ✅ passed.
  - Gate B `club_points_config` row for Alpha (`points_per_dollar=1`) — ✅ passed.
  - Gate C active `club_memberships` for Jordan on Alpha — ✅ passed (Jordan self-joined via the app at 2026-07-13 18:42 UTC).
  - Gate D PI metadata carries `member_id + provider_id + care_plan_id` — ✅ satisfied by the simulation payload.
- `accrue_points` RPC (`20260703h:163-176`) fired. **`club_points_ledger` row landed: `delta_points=2`, `reason='earn_spend'`, `dollars_spent_cents=200`, `source_ref='pi_sim_1783970179534'`.**

This is the first ever `dollars_spent_cents`-populated row in `club_points_ledger` in prod. The chain works.

**What this proves and what it doesn't** (verbatim from the script's header):
- ✅ Proves: signature verification → idempotency gate → `handlePaymentIntentSucceeded` → `_accrueCarClubPoints` (all four gate checks) → `accrue_points` RPC → ledger row with `dollars_spent_cents` populated.
- ❌ Doesn't prove: Stripe's own event delivery / endpoint registration, and the real PI-creation + capture flow (`care-plans.js` piParams.metadata → PI create → `member-release-payment.js` capture → real Stripe webhook to our endpoint). Those remain code-verified only until the first real member↔Chris transaction.

**Redeem side — member UI, real user session** (2026-07-13 20:15 UTC). With Jordan's balance sitting at +2 from the sim, Jordan redeemed the "Free basic wash" reward through `car-club-member.html`. `club_rewards.point_cost` was temporarily lowered to 1 for the test (restored to 50 after cleanup). Result:
- `redeem_reward_for_member` RPC completed cleanly (voucher-first-then-ledger ordering, `FOR UPDATE` on the reward row, advisory-xact-lock).
- **`club_points_redemptions` row landed: `voucher_code='B9B07A56'`, `status='issued'`, `point_cost=1`.**
- **`club_points_ledger` row landed: `delta_points=-1`, `reason='redeem'`, `source_ref='84fda88d-…'` (reward id).**
- Balance post-redemption: `2 - 1 = 1`. Correct arithmetic on live ledger `SUM(delta_points)`.

**Related fixes deployed same day** (both live on prod after `git push`):
- `d038749 fix(car-club-member): use supabaseClient not bare supabase for auth` — resolves the login-bounce bug (bare `supabase` identifier resolved to the CDN UMD namespace, not the initialized client). Without this, Jordan couldn't have completed the redeem — the page bounced logged-in users to `members.html`.
- `4fcdd90 fix(car-club): program-flexible copy + reward_count on browse cards` — "How It Works" + empty-state copy rewritten to be program-flexible (points/punches/coupons/comp services); `listBrowse` now annotates `reward_count` from `club_rewards`, resolving half of the §9a "0 rewards" browse-card gap.

**Cleanup applied post-verify** (2026-07-13 later same day). Test rows removed:
- `club_points_redemptions.voucher_code='B9B07A56'` — deleted.
- `club_points_ledger` rows: `source_ref='pi_sim_1783970179534'` (earn sim) + `reason='redeem'` matching the reward id — deleted.
- `webhook_events.stripe_event_id='evt_sim_1783970179534'` — deleted.
- `club_rewards.point_cost` restored to 50 on `84fda88d-…`.

Prod state after cleanup — confirmed via `SELECT COUNT(*)`:
- `club_points_ledger` — 0 rows.
- `club_points_redemptions` — 0 rows.
- `webhook_events` (sim rows only, filtered `stripe_event_id LIKE 'evt_sim_%'`) — 0 rows.
- `car_clubs` (Alpha) — 1 row, intact.
- `club_rewards` (Free basic wash) — 1 row, `point_cost=50` restored.
- `club_points_config` — 1 row, `points_per_dollar=1` intact.
- `club_memberships` (Jordan on Alpha) — 1 row, `is_active=true` intact.
- `platform_settings.car_club_programs_enabled` — `enabled=false`, `test_users` still contains Jordan + Chris + `0bb98854-…`.

**Remaining for Stage-2 pilot flag-on (concrete list — this is the sequenceable Chris-imminent checklist):**

1. **Real Stripe transaction with Chris.** Provider-side care-plan payment flow must actually run end-to-end: member accepts Chris's bid → PI created with `metadata.{care_plan_id, member_id, provider_id}` → member calls `POST /api/payment/release` → PI captured → real `payment_intent.succeeded` webhook fires from Stripe (not simulated) → accrue chain executes. Everything up to the simulated webhook is now proven; the runtime PI creation + real Stripe delivery is not. First actual Chris transaction is the last unverified link.
2. **Provider-side voucher validation.** `provider-club.html` VALIDATE column + `POST /api/car-club/validate-voucher` — voucher fulfillment loop. Was in scope for §5 pilot-minimal but not yet exercised against a real issued voucher.
3. **"My Rewards" voucher visibility.** Slice 2 line-item. When a member redeems, they need to see their issued voucher code in the app to present it to the provider. Verify the client renders the voucher after redeem — the RPC returns it in the response, but the UI wire needs a live-verify.
4. **www→apex forced redirect.** Cosmetic but user-visible: some flows land users on `www.mycarconcierge.com` where session state differs from `mycarconcierge.com`. Force redirect to apex before the pilot invites go out.
5. **Era-mismatch cosmetics.**
   - `car-club-member.html` shows "No reward rules set up yet" as an empty-state — punch-card era copy. Should read "No rewards available yet" (or similar) matching the points-per-dollar model.
   - Provider uuid displaying raw somewhere in the UI (probably on `provider-club.html`) instead of business name. Small render-side fix.

None of the five items block the earn/redeem loop's correctness — they're the polish and the one runtime-verification gap. Not build-heavy; likely a single next-session block.

---

### ⏸ REHEARSAL PAUSED — 2026-07-16 · Test provider dress rehearsal paused at payment authorization (member cash-flow timing)

**State captured at pause:**
- Test plan `db0397ec-783f-4f34-b96d-9b61abc37fff` ("Test oil check") — status **"Awaiting Payment."**
- Test provider bid `c91f229c-f3fd-43c6-9e81-2f5bc8e66dbc` — status **`accepted`**, amount $2.00.
- Bid window extended earlier same day to `2026-07-18 15:06:21 UTC` (48h) so nothing expires under the pause.
- PaymentIntent **pending authorization** on the member's card — bid accepted but card not yet authorized (member cash-flow timing).
- All other rehearsal stages green up to this point: plan created via SQL, bid submitted through provider UI, member saw the bid (after the FK-embed fix in `6b57fde`), bid accepted through member UI.

**Resume path** (in order):
1. Authorize the card on the pending PI (member action).
2. Member marks the job Complete → `POST /api/payment/release` → `stripe.paymentIntents.capture(pi)` → **real** `payment_intent.succeeded` webhook.
3. **Verify `club_points_ledger` earn row** — expected shape: `delta_points=2` (at 1 pt/$), `reason='earn_spend'`, `dollars_spent_cents=200`, `source_ref` starting with `pi_` (NOT `pi_sim_`). This is the last unverified link the 2026-07-13 PROOF section left open (real Stripe delivery + PI-creation runtime vs the signed-webhook simulation).
4. Member redeems the "Free basic wash" reward (`club_rewards.id = 5ae2e2fc-…`, `point_cost=2` currently — matches the $2 earn exactly, so a full earn→redeem cycle should just work; adjust `point_cost` down if the balance-after-earn isn't a clean multiple).
5. Provider validates the issued voucher through `provider-club.html` VALIDATE column.

**What the pause proves already:** the FK-embed fix (`6b57fde`) unblocked the member bid list — the pause happened *after* the member saw and accepted the bid, so that class of bug is confirmed dead in the live flow. The remaining unknown is exclusively the runtime Stripe path (item 3 above), not the Car Club code paths.

**Cleanup after successful resume:** the earn ledger row + redemption row + webhook_events row will be real prod data, not sim data — the `pi_sim_*` cleanup pattern from the 2026-07-13 PROOF doesn't apply here. Decide at that point whether the test-provider club (`531409f5-…`) stays as a dress-rehearsal fixture or gets retired alongside the sim-cleanup pattern's real-data equivalent.

---

**Status flag on this log entry:** captures the direction change at the moment of decision, followed by the same-day correction, followed by the same-day proof, followed by the 2026-07-16 rehearsal pause. Update this section as the next-session investigation returns, design questions get answered, and D2/D5/D7 get re-recorded. Do NOT prune it once resolved — it's the single-source-of-truth reference for anyone reading the plan later and wondering why punch-card mechanics were built, why points-per-dollar was assumed live and then disproven, and how the confusion was walked back.

---

## 0. Framing

Car Club is a provider-side loyalty-program layer: providers run branded punch/points programs inside MCC; members browse, join, earn, and redeem. Strategic value is **provider acquisition** ("bring your loyalty program to MCC") and member retention — it should be built pilot-first around one real provider, not feature-complete in the dark.

Key inversion discovered during launch-hardening: **the member client is largely built** (`car-club-member.html`, dozens of live call sites) while **the server side is mostly missing**. The work below is primarily endpoints, RLS, and provider/admin surfaces.

**Sequencing note:** this plan competes with the Path B matchmaker build (push invites — currently unbuilt while the provider pitch describes it as existing). D6 decided 2026-07-04: **Car Club first, matchmaker second.** Consequence carried forward in the pitch (Sprint 15/16 deck + walk-in script): soften "invited quotes" language to pull-based browse until matchmaker actually ships. **Slice 0** (schema capture, routing, the flag-gated `my-clubs` handler) shipped during launch-hardening; **Slice 1** completed 2026-07-04 (browse + join + leave + my-rewards + Q3 catalog filter, all flag-gated); **Slice 2 (points engine) is the active track.**

---

## 1. Current state — done and verified (as of 2026-07-03)

- **Schema:** all 15 tables (7 base + 8 program) captured and committed (`20260703a–h`); production drift corrected (missing columns, phantom `is_public`, wrong FK targets, missing CHECKs).
- **RPC:** `redeem_reward_for_member` corrected and applied live — real column set is `delta_points` / `source_ref` / `point_cost` / `voucher_code`.
- **Gate:** `data-feature` gating on nav item + teaser section, `applyMccFeatureGates()` fail-closed; server check `isFeatureEnabledForUser()` honors global flag or `test_users` only. No admin bypass. Verified with flag row + profile query.
- **Routing:** `/api/car-clubs`, `/api/car-clubs/*`, and `/api/car-club/*` (singular catch-all, commit `e07c8a8`) all reach `netlify/functions/car-clubs.js`; function path regex accepts both forms.
- **First member endpoint:** `GET /my-clubs` handler (commit `4541f8a`) — flag-OFF returns `200 {clubs:[],memberships:[]}`; balances currently **stubbed** (aggregate single entry, `reward_rule_id: null`, counts 0).
- **Verification matrix so far:** unauth curl → 401 JSON ✅; flag-off gating (demo-member eyes) — pending tonight's check; flag-on authed `my-clubs` 200-empty — pending tonight's direct-URL check.

**Known defects parked (fix inside slices below):**
- "Browse Car Clubs" anchor on the members.html teaser dead-clicks (test cohort only; no source-level interceptor found; live-DOM `outerHTML` probe pending).
- `loadModule()` is vestigial — every target already direct-`<script>`-loaded; re-injection parse-fails on `let` redeclaration (`_mccLeafletPromise`; `currentEscrowElements` same class).
- Native shells (`ios/App/App/public/_redirects`, `android/.../public/_redirects`) lack the singular `/api/car-club/*` rule.
- `www/_redirects:247` (`/api/car-club/free-bids`) is redundant after the catch-all — remove in first Slice 1 commit.
- **`car-club-member.html` logged-in bounce to `members.html`** — confirmed NOT server-side (curl 200) and NOT in any code (file + shared scripts + inline init all read exhaustively, clean). localStorage on the origin holds `mcc_portal=member` plus `mcc_vid`, `sb-auth-token`, etc. Bounce is browser-state-driven, not a redirect. Page renders fine logged-out; endpoints all work (4x 401). NOT a real-user path (members reach Car Club via in-app link). Flag-off, non-blocking. **At pilot: test with a clean profile / demo member account; if it recurs, trace what reads `mcc_portal` / session state on the members↔car-club navigation.**

---

## 1a. Real bugs — must fix before pilot flag-on (NOT post-pilot debt)

> **🔀 SUPERSEDED (2026-07-13, later same day): BUG-02's "table mismatch" framing is folded into the earn-model redesign** at the top of the doc (see the "🔀 DIRECTION CHANGE — 2026-07-13" section above §0 Framing). The RPC reads the right table; the punch-card earn stack was the wrong turn. Read the direction-change block for the current status; BUG-02's technical detail below is preserved for history but its "three resolution options" (mirror / rewrite / auto-issue) no longer apply. **Top next-session priority is now the transaction-lifecycle investigation** (in flight as of this section update) leading into the points-per-dollar earn integration design.

### BUG-02 · Redeem RPC ↔ reward-table mismatch — 🔀 SUPERSEDED 2026-07-13 (observation preserved, resolution reframed)

**Filed:** 2026-07-13 (found during live redeem-loop testing). **Superseded same day** by the earn-model redesign — see top-of-doc direction-change section for current status. The section below is history.

**Symptom:** `redeem_reward_for_member` returns `status = 'no_reward'` for a reward that demonstrably exists and is active. Reproduced against BMW's reward `club_reward_rules.id = 5fc64d26-…` (`punches_required = 1`, `reward_type = 'punch_card'`, `is_active = true`, on club `31e07510-…`). Direct RPC call → `'no_reward'`.

**Root cause:** the earn side and the redeem side read two different tables. The pilot punch-threshold model lives in `club_reward_rules`; the redeem RPC is hard-wired to `club_rewards`.

- RPC row-type declaration at `supabase/migrations/20260707a_fix_redeem_rpc_pgcrypto_schema.sql:78`:
  ```sql
  r public.club_rewards%ROWTYPE;
  ```
- RPC reward-lookup SELECT at `20260707a:98-103`:
  ```sql
  SELECT * INTO r
      FROM public.club_rewards
      WHERE id = p_reward_id
        AND club_id = p_club_id
        AND active = true
      FOR UPDATE;
  ```
- Zero-row SELECT falls through to `:105-110` → `status := 'no_reward'; RETURN NEXT; RETURN;`

**Two reward models, structurally distinct:**

| Aspect | `club_reward_rules` (`20260703d`) | `club_rewards` (`20260703h:120-131`) |
|---|---|---|
| Semantic model | *Reach N punches → earn* (punch-threshold) | *Spend N points → get catalog item* (points-catalog) |
| Threshold / cost column | `punches_required int` | `point_cost int` |
| Kind / type column | `reward_type text DEFAULT 'punch_card'` | `kind club_reward_kind DEFAULT 'merch'` |
| Active flag | `is_active boolean` | `active boolean` |
| Name column | `reward_name text` | `title text` |
| Inventory | *(none)* | `inventory_qty int` |
| Used by | Pilot punch-card mode (D2/D5) | Points-store catalog (Slice 5 territory) |

The pilot writes and displays punch-card rewards on the `club_reward_rules` side; the redeem RPC reads on the `club_rewards` side; nothing bridges the two.

**Blast radius — all pilot rewards affected, not just the BMW test row:**
- Chris's Alpha "Free Detail" @ 10 punches (`club_reward_rules.id = 11835db0-…` per §1b/§5) has the same defect. Chris cannot redeem the pilot reward as currently wired.
- Any other punch-card reward defined in `club_reward_rules` by any provider using self-service create/edit (`car-club-provider.html` → `/api/car-club/create|update`) inherits the same defect.

**Partially known before today.** The comment at `20260707a:33-35` reads:
> *"Neither RPC has EVER produced a live voucher in production. The pilot was blocked here before we tripped over the missing club_rewards row for Chris (the OTHER gap from 2026-07-06)."*

So the gap was noticed 2026-07-06 but never resolved. Alpha's reward was still created in `club_reward_rules` (11835db0-… per the §5 DECISION 2026-07-10 log), meaning the earn→redeem loop has been broken continuously from 2026-07-06 through today's confirmation.

**Three resolution shapes — DECIDE NEXT SESSION with fresh eyes (architecture call, do not rush):**

1. **Mirror punch-threshold rules into `club_rewards`.** Every `club_reward_rules` row gets a companion `club_rewards` row with `point_cost = punches_required`, `title = reward_name`, `active = is_active`. Pilot invariant: 1 punch = 1 point (already the earn-side default in `/punch`). Cheapest — no RPC surgery, no /punch changes — but leaves two tables to keep in sync going forward (self-service create/edit would need to write both, or a trigger would need to mirror).
2. **Rewrite the RPC to read `club_reward_rules` (or either table).** Cleanest semantically. Most work — the RPC has been revised four times already (`20260703h`, `20260706a`, `20260707a`, and the schema-qualify patch inside `20260707a`). Column-name delta means the RPC body has to change too (`is_active` vs `active`, `reward_name` vs `title`, no `inventory_qty` on rules side means the inventory-guard branch needs conditional handling, no `point_cost` on rules side means substituting `punches_required` end-to-end).
3. **Auto-issue voucher at punch-threshold in the `/punch` handler.** Skip the redeem RPC entirely for punch-card mode: when `/punch` sees cumulative `delta_points ≥ punches_required` on any active `club_reward_rules` for the club, insert a `club_points_redemptions` row directly. Bypasses the RPC's atomicity/locking work; changes the earn-side contract (voucher issuance is now provider-initiated, not member-initiated); re-audits the pilot design (no "redeem" button on the member side — voucher just appears).

**Recommended lean (subject to next-session review):** **Option 1** for fastest working pilot given Chris is imminent — mirroring the row is a one-shot INSERT against Chris's existing `11835db0-…` rule, and gets the earn→redeem loop working with zero code change. Then **Option 2** as post-pilot cleanup, folded into the full Slice 3 portal build so the RPC rewrite lands alongside the reward-rule editor UI. Do NOT ship Option 3 — the earn-side contract is already understood by Chris; changing it introduces surprise the pilot doesn't need.

**Exit criteria for BUG-02 to close:** a member with sufficient punches on Chris's Alpha club can redeem the "Free Detail" reward end-to-end in the browser, provider validates the voucher in `provider-club.html`, second validate rejects — the §6a verification protocol Steps 10-12 pass live, not just theoretically.

### BUG-01 · Account-deletion PII gap on Car Club tables — ✅ RESOLVED 2026-07-04

**Filed:** 2026-07-04 (discovered during Item 4 schema audit).
**Fixes:**
- `cc80b81` — renamed legacy `car_club_members` → `club_memberships` (closed 1 of 6 tables).
- `18a7bfd` — added the 5 missing DELETE calls for `club_points_ledger`, `club_points_redemptions`, `club_coupon_redemptions`, `club_comp_service_grants`, `club_activity_log` (closed remaining 5).

**Severity reframe (discovered during fix):** this wasn't just PII hygiene — all 5 tables' `member_id` FK to `auth.users(id)` with **no ON DELETE action**, so any downstream `auth.users` deletion would have FK-failed for any user with Car Club activity. Account deletion was **broken end-to-end for affected users**, not merely leaking rows. Pre-fix, delete-my-account for any user with points/coupon/comp-service activity would error out at the auth-row deletion step. Post-fix, the pipeline completes cleanly.

**All 6 tables now deleted on account-deletion:**

| Table | Migration | Column | Status |
|---|---|---|---|
| `club_memberships` | 20260703b | `member_id` | ✅ `cc80b81` |
| `club_points_ledger` | 20260703h:106 | `member_id` | ✅ `18a7bfd` |
| `club_points_redemptions` | 20260703h:138 | `member_id` | ✅ `18a7bfd` |
| `club_coupon_redemptions` | 20260703h:234 | `member_id` | ✅ `18a7bfd` |
| `club_comp_service_grants` | 20260703h:265 | `member_id` | ✅ `18a7bfd` |
| `club_activity_log` | 20260703c | `member_id` | ✅ `18a7bfd` (currently empty; Slice 2 populates) |

**Root cause preserved for reference:** `account-deletion-core.js` docstring at `:1-10` says: *"If you add a new table that holds user data, add the matching delete here."* When migration `20260703h` shipped 8 new club tables (5 of which hold `member_id`), the corresponding deletes were never added. `car_club_members` was a separate pre-existing schema-drift bug from the 20260703b rename.

**Not in scope of this bug entry (already-clean tables):**
- `car_club_redemptions` (deleted ✅ at :131)
- `car_club_return_bonuses` (deleted ✅ at :132)
- `car_club_benefits` — provider-owned, not user PII (correctly out of the member-tables delete)
- `car_clubs` — provider-owned, not user PII (correctly out of the member-tables delete)
- `club_points_config` — provider-owned per-club config (correctly out of the member-tables delete)
- `club_rewards` / `club_coupons` / `club_comp_services` — provider-owned catalog items (correctly out)
- `club_reward_rules` — provider-owned earn-rule config (correctly out)

### BUG-01 follow-up · Drop dead legacy tables (post-fix housekeeping)

Once BUG-01's DELETE additions land, both of these tables become droppable in a follow-up migration:

- **`car_club_members`** (created by `20260526_create_car_club_members.sql`) — superseded by `club_memberships` (`20260703b`) in October 2026. After `cc80b81` this table has **zero live references anywhere in the codebase** (grepped netlify/, www/, supabase/). Dead schema. Drop-safe pending a Studio `SELECT COUNT(*)` sanity-check (if non-zero, migrate rows to `club_memberships` first).
- **`member_club_balances`** — **NOT in any migration file** (unmigrated Replit-era artifact). Confirmed **0 rows in prod** (2026-07-04). Still referenced by `account-deletion-core.js:128` (a delete that's a no-op given the empty state), `www/car-club-api.js` (old Replit Express handlers using `pg` client, not Netlify — dead code), and `www/stress-test-car-club-punch.js` (test scaffolding). Once the two live-code references are removed, the table can be dropped from prod.

Both drops go in a single follow-up migration after BUG-01 fixes land.

---

## 1b. Pre-pilot data-hygiene checklist (not bugs; must happen before Stage-2 flag-on)

Items that don't belong in §1a (real bugs) or §9a (post-pilot debt) — data cleanups that keep prod clean when the pilot flips live.

### ✅ Full Car Club data cleanup — COMPLETED 2026-07-13

**Database is now pristine — zero Car Club data in prod.** Every subsection below (seed clubs cleanup, test residue cleanup) is resolved by this pass; the earlier per-subsection guidance is retained as history but is no longer actionable.

**What was cleared, table by table:**

| Table | Cleared | Notes |
|---|---|---|
| `car_clubs` | ✅ emptied | Jordan's 3 seed clubs (Honda & Acura Club, Truck & SUV Owners, BMW Enthusiasts NJ), the `0bb98854-…` test account's 2 clubs, and Chris's earlier-provisioned Alpha rows all DELETEd. `SELECT COUNT(*) FROM car_clubs` should read 0. |
| `club_memberships` | ✅ emptied | Includes Jordan's test BMW membership (`31e07510-…`) from the 2026-07-10 provider-screen test residue list. |
| `club_points_ledger` | ✅ test entries deleted | The 12 rows observed earlier (11 `earn_spend` from `/punch` tests + 1 `redeem`), all Jul 7-11 test activity, gone. |
| `profiles.qr_code_token` (Jordan) | ✅ cleared to NULL | Sentinel value `test-token-jordan-001` removed. If a real production token is needed for Jordan later, regenerate. |
| `club_reward_rules`, `club_rewards`, `club_points_config`, `club_points_redemptions` | (implicitly empty) | Cascade from `car_clubs` deletion for the FK-linked tables; standalone tables were never populated. Verify with `SELECT COUNT(*)` on each before Stage-2 provisioning to be sure. |

**`UNIQUE(provider_id)` on `car_clubs` — applied 2026-07-13 [needs verification + migration file].** Jordan reports the index was added. Grep of `supabase/migrations/` returns no `UNIQUE(provider_id)` on `car_clubs` — the constraint is not in any tracked migration file. Two follow-ups: **(1)** verify in Studio with `\d car_clubs` (or `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'car_clubs';`) that the unique constraint / index actually exists, and **(2)** write a matching migration file (e.g. `20260713a_car_clubs_unique_provider.sql`) so replay reproduces prod. This is the same schema-drift class as `profiles.qr_code_token`, `member_founder_profiles`, and `member_club_balances` — the "DB migration tracking is not used" pattern flagged in §9a. Track this drift on that same list.

**Ready for Stage-2 provisioning — but NOT the same provisioning as the previous plan called for.** Two blockers before any provisioning happens:

1. **The earn-model question must be resolved first.** The direction-change block above §0 Framing (and its same-day CORRECTION) leaves the points-per-dollar accrual chain as *code that exists but has never fired in prod*. The next-session investigation — five specific questions listed at the end of the CORRECTION block — must answer whether the chain is actually reachable, whether the four provisioning/state gates are the only blockers, and whether any additional integration gap exists. **Do not provision Chris until the investigation returns.**
2. **Chris's reward must be provisioned in the CORRECT table.** Per the 2026-07-13 direction change: `club_rewards` with a `point_cost` column value, NOT `club_reward_rules` with a `punches_required` column value. The earlier hand-provisioned row `11835db0-…` (Free Detail @ 10 punches, punch-card model) is gone with the cleanup; the replacement must be a `club_rewards` catalog row against the points-per-dollar model. Point cost value depends on the `points_per_dollar` rate the earn-model design settles on.

**Provisioning sequence for next session (once earn-model question is answered):**
1. INSERT `car_clubs` row for Alpha (name, `provider_id = dbb15523-…`, `is_active = true`, `points_enabled = true` — do NOT leave the default `false`).
2. INSERT `club_points_config` row for the new club with the agreed `points_per_dollar` rate.
3. INSERT `club_rewards` row (`kind`, `title`, `point_cost`, `active = true`) — the real "Free Detail" or whatever reward Chris confirms.
4. Append Chris's uid to `platform_settings.car_club_programs_enabled.test_users` so he can access the flag-gated surfaces.
5. Verify `_accrueCarClubPoints` gates all open: run a real bid-accept + release-payment cycle against Alpha and check for a `dollars_spent_cents`-populated row in `club_points_ledger`.

This supersedes the earlier `docs/scripts/provision-pilot-club.sql` referenced below — that script targets `club_reward_rules` (punch-card model) and would re-introduce the same defect. Write a new provisioning script against the points-per-dollar model once the earn rate is decided.

### Seed clubs cleanup (added 2026-07-06)

**✅ RESOLVED 2026-07-13 by the full data cleanup above.** Section preserved as history; no action needed.

**Current state (2026-07-06):** `car_clubs` has **3 dev seed clubs** from the 2026-05-26 seed migration, all owned by Jordan's uid (`8ea2bc19-…`), all `is_active = true`:
- Honda & Acura Club
- Truck & SUV Owners
- BMW Enthusiasts NJ

**KEEP for now** — deliberately retained through Slice 3 build. They're useful for building/testing `provider-club.html` end-to-end as Jordan-as-provider before Chris touches the surface. `GET /api/car-club/my-provider-clubs` with Jordan's session returns these three; `clubs[0]` becomes the working club for punch/validate wire-up dry runs.

**BEFORE STAGE-2 FLAG-ON:** deactivate or delete these 3 seed clubs when Chris's real Alpha Auto Body club is admin/SQL-provisioned per D4. Production at pilot time should have **only Chris's club** so the `/my-provider-clubs` response for any accidental non-Chris caller is guaranteed empty rather than showing Jordan's dev seeds.

**Cleanup script:** `docs/scripts/deactivate-seed-clubs.sql` — canonical soft-deactivate (paste into Studio SQL Editor with Jordan's uid substituted; includes preview + verification queries + a harder `DELETE` option gated behind a confirmation of no dependent rows).

Companion provisioning script: `docs/scripts/provision-pilot-club.sql` — atomic single-transaction provision of Chris's `car_clubs` row + `club_reward_rules` row + append to `test_users`. Run this FIRST at Stage-2 flag-on time (creates Chris's real club), then run `deactivate-seed-clubs.sql` immediately after (retires Jordan's dev seeds). Both scripts are idempotent and wrapped in BEGIN/COMMIT.

### Test residue cleanup (added 2026-07-10)

**✅ RESOLVED 2026-07-13 by the full data cleanup above.** All four items below (seed-club reactivations, Jordan's BMW membership, `test-token-jordan-001`, test BMW ledger punch) were cleared as part of the pristine-DB pass. Section preserved as history; no action needed.

**Left behind by 2026-07-10 provider-screen (`provider-club.html`) testing.** All four items below must be cleared before Stage-2 flag-on so production surfaces only Chris's real Alpha club + real members. This is in addition to (not a replacement for) the seed-clubs cleanup above.

| # | Item | State to clear |
|---|---|---|
| a | 3 seed clubs reactivated during testing — Honda & Acura Club, BMW Enthusiasts NJ, Truck & SUV Owners — all currently `car_clubs.is_active = true` again | Re-deactivate (or delete — reuse `docs/scripts/deactivate-seed-clubs.sql` from Seed clubs cleanup above) |
| b | Jordan added as a test member of BMW Enthusiasts NJ (`car_clubs.id = 31e07510-…`) — row in `club_memberships` for Jordan's uid | Delete the membership row (or set `is_active = false` if ledger references require preserving it) |
| c | Test `qr_code_token = 'test-token-jordan-001'` set on Jordan's `profiles` row | Restore Jordan's real production token, or NULL and regenerate — do NOT leave the sentinel value in prod |
| d | Test punch entry in `club_points_ledger` for BMW Enthusiasts NJ (Jordan's uid, +1 delta_points, stamped as 2026-07-10 provider-screen test) | Delete the ledger row |

**KEEP as real production data (do NOT clear — these are the pilot destination state):**
- Chris's `car_clubs` row **"Alpha Auto Body & Repair"** (`id = 3a313e2d-a8aa-48e9-a3ce-751f98895828`, `provider_id = dbb15523-…`) — the real pilot club.
- Chris's `club_reward_rules` row **"Free Detail" @ 10 punches** (`id = 11835db0-…`) — the real pilot reward rule.

Both were hand-provisioned per D4 on 2026-07-10 and are the reference example for §5's DECISION. Cleanup should leave these standing while removing every item in the table above.

### Branding polish for Alpha club (added 2026-07-10, next-session, non-blocking)

**⚠️ Target-row identifier is stale.** The row at `car_clubs.id = 3a313e2d-a8aa-48e9-a3ce-751f98895828` was deleted in the 2026-07-13 full cleanup above. Whichever new UUID Alpha gets on re-provisioning (Stage-2, after the earn-model investigation returns) becomes the correct target — capture it in the same session as provisioning and update this subsection.

**Sequence unchanged:** run **AFTER** the §6a validate protocol passes and (now) after Alpha is re-provisioned on the points-per-dollar model. Still non-blocking to Stage-2 flag-on — the pilot works with the neutral defaults — but a branded Alpha club makes Chris's first-impression window tighter. Do it in the same next-session window if the calendar allows.

**Target row:** Chris's re-provisioned `car_clubs` row (new UUID, TBD 2026-07-13-or-later). The previous UUID `3a313e2d-a8aa-48e9-a3ce-751f98895828` is retired.

**Fields to populate (all via admin SQL against the row above — no self-service portal shipped yet, per §5 DECISION):**

| Column | Value source | Notes |
|---|---|---|
| `logo_url` | **HOSTED URL required** — see prerequisite below | Two acceptable sources: (1) direct-link an existing hosted logo from `alphaautobodynj.com` if one is publicly reachable; (2) upload Chris's logo to Supabase Storage (create bucket if none exists — pilot-time one-off; the full self-service upload flow is the §5 post-pilot portal item). **The screenshot Jordan currently has is NOT a hosted URL** — an in-Studio paste of a screenshot data-URI or a local file path will not render on the client. Resolve to a real HTTPS URL first |
| `theme_color` | Alpha brand hex (grab from `alphaautobodynj.com` visual or Chris's business card) | Hex string, e.g. `#123456` |
| `welcome_message` | Short line — Chris to provide, or Jordan drafts and confirms with him | Shown to newly-joined members |

**Prerequisite research (do first, before SQL):**
- **Check whether `provider-club.html` header renders `logo_url`** — currently the header pulls `car_clubs.name` (per §5 pilot-minimal spec); confirm whether logo is already wired in or whether the header will silently ignore a populated `logo_url` until the template is updated. If not wired, either add the `<img>` tag as a small pre-pilot polish edit or accept that provider-side branding lands only on the member view for pilot.
- **Check whether the member club view (`car-club-member.html`) renders `logo_url`** — same shape of question. Both surfaces need to actually consume the column for branding to be visible; populating it in the DB is necessary but not sufficient.

**Deliverables for the next-session branding pass:**
1. Confirmed hosted logo URL for Alpha.
2. Confirmed hex `theme_color`.
3. Confirmed welcome message text.
4. `provider-club.html` and `car-club-member.html` render-check results — either "already wired, populate DB and done" or "needs a template edit here + here."
5. One `UPDATE car_clubs SET logo_url = …, theme_color = …, welcome_message = … WHERE id = '3a313e2d-…'` applied in Studio.

Neutral defaults are fine if any of the above stalls — do not block Stage-2 flag-on for branding.

---

## 2. Decisions required before build (Jordan)

| # | Decision | Proposed default |
|---|----------|------------------|
| D1 | Pilot club + provider | ✅ **DECIDED 2026-07-05** — Chris Agrapidis / Alpha Auto Body (founding provider, grandfathered, motivated) |
| D2 | Pilot earn mechanic | ✅ **DECIDED 2026-07-05** — Earn = provider scans member's existing Check-In QR (`profiles.qr_code_token`); manual member-code entry as fallback |
| D3 | Points policy & terms | Points have no cash value, non-transferable, program can be modified/ended; short terms blurb required **before global enable**. Owner: **Jordan** — running the pilot without terms is a business-risk judgment, not legal advice; a lawyer glance before Stage 2 is cheap insurance and becomes **mandatory** if any reward ever carries cash-equivalent value |
| D4 | Who creates clubs | Admin/SQL-provisioned for pilot (curated — consistent with Path B philosophy); provider self-serve UI later |
| D5 | Program-surface scope for pilot | ✅ **DECIDED 2026-07-05** — Pilot scope = MINIMAL core loop only (join → punch → progress → redeem one reward). Store, testimonials, notifications DEFERRED to Slice 5 behind the existing feature-flag pattern — addable later on pilot signal, no rearchitecting needed |
| D6 | Sequencing vs matchmaker | ✅ **DECIDED 2026-07-04** — Car Club first, matchmaker second. **Consequence:** provider pitch (Sprint 15/16 deck + walk-in script) must soften "invited quotes" language until matchmaker actually ships — pull-based browse is the honest description of today's flow |
| D7 | Pilot reward types | **Service-discount vouchers only. No bid-credit rewards in pilot** — a bid-credit reward is effectively $0/bid next to the $7–$10/bid pack ladder; not a pricing-rule violation (grants ≠ pack pricing) but a farming vector. Revisit with pilot data |

*D1 footnote:* Chris's grandfathered terms (90% perpetual referral commission on bid-pack sales; unlimited free bids) don't obviously interact with Car Club — commissions key off bid-pack sales, not club-driven jobs, and a bid-credit reward is moot for an unlimited-bids account — but **confirm both explicitly during pilot setup** rather than assume. Chris's tier is only one of THREE distinct founder-deal models now on the books — see §2a for the full tier table and implementation flag.

---

## 2a. Founder-deal tiers (context for future commission logic)

Three distinct founder-commission models exist as of 2026-07-10 — none derivable from any code path yet (no commission-calc logic has been written), but all must be captured whenever that logic IS built or enforced (payouts, dashboards, statement generation, referral-attribution reads).

| Founder | Commission | Scope | Duration | Source |
|---|---|---|---|---|
| **Standard founder deal** | 50% of bid-credit pack revenue | Providers referred by the founder | First 12 months of each referred account | Baseline pilot terms |
| **Chris Agrapidis** | 90% of bid-credit pack revenue | Providers referred by Chris | Perpetual (lifetime of the referred account) | Grandfathered founding-provider terms (D1) |
| **Rossy Mateo** *(CONFIRMED FINAL 2026-07-10)* | 75% of bid-credit pack revenue | Providers referred by Rossy | Perpetual (lifetime of the referred account) | Third distinct model — differs from standard on BOTH percentage AND duration; **commission-only, NO equity** |

**Rossy Mateo — CONFIRMED FINAL (2026-07-10):** 75% of bid-credit pack revenue, for the LIFE of each referred provider account, **commission-only — NO founder equity**. Both prior open questions (final vs. negotiating; equity vs. commission-only) are answered and closed. Value is safe to encode against the confirmed terms.

**Implementation flag:** whenever commission logic is written, calculated, or enforced, it must handle **three founder tiers, not one**. Do not hard-code a single percentage or a single duration; do not assume "founder → 50% → 12 months." Any code path or DB check that assumes "one founder deal" is a defect at write time. A minimum-viable data shape carries `founder_id` + `commission_pct` + `duration_months` (with `NULL` or a sentinel meaning "perpetual") on each founder record so all three tiers are expressible without special-casing. The equity flag (Chris = yes, Rossy = no, standard = TBD) is a separate boolean on the founder record — commission-calc reads `commission_pct` / `duration_months`; equity paperwork reads the flag.

### Founder Dashboard — post-pilot / founder-features backlog

**Feature:** a member-portal view where a signed-in founder sees (a) the providers they referred, (b) each of those providers' bid-credit pack sales, (c) their resulting commission earned per the tier table above.

**Scoping update after 2026-07-10 read-only investigation — most of the data model already exists.** The dashboard is now a **UI + read-endpoint build, NOT a data-model build.** Referral tracking, per-founder commission rates, per-tier duration handling, and the commission-recording RPC are all in place; commissions are being *written*, they're just never *surfaced back* to the founder.

| Dependency | State (2026-07-10, post-investigation) | Notes |
|---|---|---|
| **Referral tracking** — link from each referred account to the founder who referred them | ✅ **SUBSTANTIALLY BUILT.** Data model exists: `member_founder_profiles` (founder rows with `commission_rate` NUMERIC(4,3), `founder_commission_end_date` nullable → perpetual, `referral_code`); `profiles.referred_by_founder_id` FK (`20260523b:45`); `?ref=CODE` signup capture at `www/signup-provider.js:143` → `/api/provider-referral/lookup/:code` → `/api/provider-referral/process` WRITES `referred_by_founder_id`; member side captured via `/api/member/referral/apply`. Chris's `commission_rate` backfilled to 0.90 in `20260428h:39` | This is a UI + read-endpoint build now, not a data-model build |
| **Commission calculation** — per-founder, spanning all three tiers, honoring per-account duration windows | ✅ **BUILT.** `record_bid_pack_commission` RPC (`20260515b:76`, v2 in `20260603b`) reads `referred_by_founder_id`, joins `member_founder_profiles` for founder id + rate, records commission row. `commission_rate_history` audit table exists (`20260428h:47-58`) | Commissions are being written on bid-pack sales today; dashboard just needs to read them back |
| **Read endpoints for the founder view** — `/api/founder/my-referrals` (list of referred providers) and `/api/founder/my-commission` (commission earned per referred provider + rollup), plus `/api/founder/campaign-stats`, `/api/founder/campaign-link-stats`, `/api/founder/payout-receipt/:id` | **NOT BUILT — confirmed by Phase 0 audit 2026-07-16.** `www/founder-dashboard.js` client already renders (payout receipt links at :505/:521, campaign-stats fetch at :1286, campaign-link-stats fetch at :1354). Client-side is present; endpoints are the only gap. Batch 1 (2026-07-16) hid the client calls so they no longer 404 — restore when endpoints ship. Commissions themselves are written but no surface reads them back to the founder. Founder-facing API surface today (`member-founder-api.js`, `admin-founders.js`, `founder-payout-monthly-scheduled.js`) does not include the my-referrals / my-commission / campaign-stats / payout-receipt reads. This is one of the two remaining build items | Provider-side referral panels at `www/providers.js:9487,9638` are NOT the founder view — do not confuse |
| **Dashboard UI** — new section in the member portal, founder-gated | **NOT BUILT.** No page found. Depends only on the two read endpoints above | Founder-gate by checking a `member_founder_profiles` row exists for `auth.uid()` |

**Verification / prep tasks — do BEFORE building the endpoints or UI:**

1. **Confirm Rossy Mateo's `member_founder_profiles` row exists** with `commission_rate = 0.75`, `founder_commission_end_date = NULL` (perpetual), and a `referral_code` assigned. If missing, insert her row first — every downstream commission write for her referred providers depends on this row being present at signup time.
2. **Audit + backfill historic Chris/Rossy referrals attributed pre-2026-05-23.** Migration `20260523b` fixed the `referred_by_founder_id` FK, but its comment states the column was NULL in prod at that time. The signup write-path only fires when a new signup uses `?ref=CODE` — anyone signed up before 2026-05-23 (or without a ref link) has `referred_by_founder_id = NULL` regardless of who actually referred them. For Chris + Rossy's historic referrals, run a `SELECT id, created_at, referred_by_founder_id FROM profiles WHERE created_at < '2026-05-23' AND …` audit, then a manual `UPDATE profiles SET referred_by_founder_id = <founder_uid> WHERE id = <provider_uid>` per confirmed referral. Every un-backfilled historic referral is a commission the founder never gets credited for.

**Schema drift flag:** `member_founder_profiles` itself has **no tracked CREATE TABLE in `supabase/migrations/`** — same Replit-era unmigrated-table class as `profiles.qr_code_token` and `member_club_balances` (both already noted in §9a). Later ALTERs (`20260428h`, `20260609a`/`b`) exist but the base CREATE does not. Same recommendation applies: write a matching CREATE TABLE that reflects prod, so replay works and the founder-features track doesn't hit the same schema audit blind spot.

**Not needed for Car Club pilot.** Build after (a) Car Club pilot is running, (b) the verification/prep tasks above are complete. The prior "commission-calc must be designed and merged first" gate is dropped — the commission calc is already merged and firing. Sequencing note: this is a founder-features track, orthogonal to the Car Club matchmaker sequencing in D6.

---

## 3. Slice 1 — Member read path (flag-ON works end-to-end, read-only)

**Goal:** a test-cohort member can load `car-club-member.html` with zero console errors, browse active clubs, join/leave, and see real reward progress.

1. **Inventory (CC, read-only, first task):** map every `apiFetch` in `car-club-member.html` → existing handler / missing handler in `car-clubs.js`. Output a table. Also state which Supabase client the function uses (service-role vs user-JWT) — this decides how much RLS work is mandatory vs defense-in-depth.
2. **RLS (Jordan applies in Studio; column names vs `20260703a–h`):** member SELECT on `car_clubs` (active AND NOT `provider_suspended`), own rows on `club_memberships` and `club_points_ledger`, `club_reward_rules` for active clubs. No member write policies — all writes go through handlers.
3. **Handlers (flag-gated per the `my-clubs` pattern):**
   - `GET /browse` — active, non-suspended clubs.
   - `POST /join` — membership insert, duplicate-membership guard, reactivate if previously left.
   - `POST /leave` — set `is_active=false` (never delete; preserves ledger).
   - `GET /my-rewards` — reward rules + member progress per rule.
   - Verify existing `free-bids` handler behavior; keep or fold in.
   - Convention: flag-OFF → GETs return 200-empty; writes return 403 with clean error (mirrors `split-guest-confirm.js` precedent). Document the divergence in comments as done for `my-clubs`.
4. **Real balances:** replace the stub — compute `punch_count` / `visit_count` / `total_spend` per reward rule from `club_points_ledger`, return per-rule entries with real `reward_rule_id` so the client's progress rendering (`car-club-member.html:880`) activates.
5. **Fix the dead Browse anchor** (root-cause via live-DOM probe; entry point for the pilot) and remove `_redirects:247` in the same commit series.

**Exit criteria (browser, deployed artifact):** unauth curl 401 on every new route; flag-off member sees nothing and GETs return 200-empty; Jordan (test user) browses, joins, leaves, rejoins, sees rule progress at 0; console clean throughout; Network rows verified per endpoint.
**Estimate:** 2–3 CC evening sessions.

---

## 4. Slice 2 — Points engine (earn + redeem loop)

### Pilot design (DECIDED 2026-07-05)

**PUNCH (earn):** provider scans member's Check-In QR (`profiles.qr_code_token`) → provider taps **Confirm** on the punch screen → positive entry to `club_points_ledger` per the club's active reward rule (from `club_reward_rules`). The Confirm tap is the earn gate — stops accidental double-punches from a re-scan without deliberate approval. Not a defense against deliberate dupes (fine for a trusted pilot provider); add a per-member/per-club N-minute dedupe window post-pilot if it becomes a scale issue.

**REDEEM:** member at/above threshold → `redeem_reward_for_member` RPC (already fixed 2026-07-03; returns `voucher_code`) → member sees the code in the app.

**VALIDATE:** provider manually types the voucher code into the validate screen → looked up in `club_points_redemptions` → marked used (`status = 'fulfilled'`, `used_at = now()`) via single conditional UPDATE. Reuse rejected atomically. Manual entry only for pilot; QR-on-voucher deferred to post-pilot.

**Endpoints to build:**
- `POST /api/car-club/punch` — provider-authenticated, Confirm-gated. Body carries `club_id` + resolved `member_id` (from QR scan or manual code).
- `POST /api/car-club/redeem` — member-authenticated. Delegates to `redeem_reward_for_member` RPC.
- `POST /api/car-club/validate-voucher` — provider-authenticated. Single conditional UPDATE, returns 200 on success, 400 on already-used/nonexistent.

**Provider surface (punch screen + validate-voucher screen):** the pilot-minimal Slice 3 piece — build alongside these endpoints, not after.

---

**Goal:** the full loyalty loop works with real accounts.

1. **Earn:** `POST /punch` (provider-authenticated): resolve member via Check-In QR token or member code + club id → insert positive `delta_points` (and visit) per the club's reward rules. **Idempotency guard** (reject duplicate punch for same member/club within N minutes) to prevent double-scan.
2. **Redeem:** member `POST /redeem` → calls `redeem_reward_for_member` (fixed 2026-07-03) → returns `voucher_code`; client displays voucher. Verify the RPC enforces `point_cost ≤ balance`; if not, add the check via migration (Jordan applies).
3. **Voucher validation:** provider endpoint to look up a `voucher_code` and mark it used. **CC task:** verify voucher storage has status/`used_at`; if missing, propose migration.
4. **Ledger integrity review:** confirm no path can drive a member balance negative or double-spend a voucher.
5. **Transactional boundaries & rollback:** verify `redeem_reward_for_member` performs point-deduct + voucher-creation in **one transaction** — points must never leave without a voucher existing; if the RPC doesn't guarantee this, fix it before any redeem testing. Voucher validation must be a single conditional write (`UPDATE … SET status='used', used_at=now() WHERE voucher_code=$1 AND status='issued' RETURNING …`) so a second validation of the same code fails atomically — no read-then-write. Every earn/redeem/validate writes an audit row to `club_activity_log`.
6. **Instrumentation (pilot metrics live here, not Slice 5):** Stage-2 exit criteria are measured from `club_activity_log` + the ledger — punches/week per member, completed redemptions, and **abandoned redemptions** (voucher issued, never validated within 30 days). CC delivers the 3–4 SQL metric queries alongside the endpoints, stored as `docs/car-club-metrics.md` in the repo (with the code, not lost in a chat thread), so the pilot is measurable on day one.

**Exit criteria:** with pilot accounts — punch → progress increments in UI → threshold reached → redeem → voucher shown → provider validates → balance decremented → second validation of same voucher rejected → double-scan rejected. All in the browser against prod, console clean.
**Estimate:** 2–3 sessions.

---

## 5. Slice 3 — Provider surface

**DECISION 2026-07-10 · Self-service provider club-creation UI is DEFERRED to post-pilot.** Pilot clubs are hand-provisioned by admin/SQL (per D4) — the full Slice 3 provider portal (create/edit club, define/edit reward rules, branding, member management) does NOT ship pre-pilot. Reference example: Chris's club **"Alpha Auto Body & Repair"** (`car_clubs.id = 3a313e2d-a8aa-48e9-a3ce-751f98895828`, `provider_id = dbb15523-…`, points + punch enabled) with reward rule **"Free Detail" @ 10 punches** (`club_reward_rules.id = 11835db0-…`) was hand-provisioned this way on 2026-07-10 as the working reference. Revisit self-service portal only on a post-pilot provider-demand signal — do not pre-build it against speculative demand.

**Pilot-minimal (build with Slice 2):** a punch/scan screen and a voucher-validation screen in the provider portal. The pilot club itself is provisioned by admin/SQL (D4).

### Slice 3 pilot-minimal — Provider punch/validate screen (DESIGNED 2026-07-06 · all four build questions RESOLVED, spec is build-ready)

**PAGE:** new standalone `www/provider-club.html` (mirrors the `car-club-member.html` pattern — single-page, network-first HTML, feature-flag-gated). Tablet-oriented layout — Chris (D1) uses it at his shop counter. Flag-gated on `car_club_programs_enabled` (server-side gate is already live on the endpoints; client-side gate hides the page shell when the flag is off for the caller). Provider-authenticated on load.

**SCOPE — operate only.** Chris's club record + reward rules are admin/SQL-provisioned first per D4. This screen does NOT create/edit clubs or reward rules; those surfaces are the full Slice 3 portal, deferred. If a provider without a provisioned club opens the page, show a clear "No club is set up yet — contact support" empty state; do not offer create-flow.

**LAYOUT (two primary actions, side-by-side — tablet has the width):**

- **Header:** club name (e.g. "Alpha Auto Body Rewards"), provider identity (business name + logged-in user), sign-out link. Club name comes from `car_clubs.name` for the club whose `provider_id === session.user.id`.
- **PUNCH (left column, frequent action):**
  - Primary path: **"Scan Member QR"** button → camera view → decode member's Check-In QR (payload format `mcc:checkin:<token>` per `www/members-core.js:2968`) → strip prefix → resolve token via `profiles.qr_code_token` (server-side, on POST) → display "Award point to **[member name]**?" preview → **CONFIRM** button (D2 confirm-gate — no auto-punch on scan) → `POST /api/car-club/punch` with `{ club_id, qr_token }` → success toast ("+1 point to [name]").
  - Fallback path: **"Enter member code manually"** link → reveals text input → paste/type the token → same **Confirm** preview → same `POST /api/car-club/punch`.
- **VALIDATE (right column, redemption action):**
  - Text field: **"Enter voucher code"** (8-char uppercase hex; auto-uppercase on paste/type to match the RPC-generated format at `20260706a:169`) + **Validate** button → `POST /api/car-club/validate-voucher` with `{ voucher_code }` → on 200: "✓ Valid — [reward name] redeemed" with member name + point cost from the returned redemption row; on 404: "✗ Invalid or already used" (collapsed message per the endpoint's leak-prevention design).

**WIRING (endpoints already live + smoke-verified):**
- `POST /api/car-club/punch` — commit `f1e894e`, verified 401 anonymous
- `POST /api/car-club/validate-voucher` — commit `1680e1d`, verified 401 anonymous
- Both are provider-authenticated on the server (`car_clubs.provider_id === auth.uid()` check), so client-side calls just need the Bearer JWT — same pattern the existing member endpoints use.

**RESOLVED BUILD QUESTIONS (2026-07-06):**

1. **QR scanning library — `html5-qrcode@2.3.8` (already in prod, reuse the existing integration).** Full camera + decode solution: handles `getUserMedia` stream setup, camera picker (front/back), scan loop, and UI in ~10 lines of caller code. Compared head-to-head with `jsQR` (decode-only — you'd build the `getUserMedia`+`<video>`+`<canvas>`+`requestAnimationFrame` loop yourself, ~50 lines of caller code, effectively frozen since 2020): `html5-qrcode` wins on reliability (proper camera-picker + back-camera preference at `providers-jobs.js:1442`), maintenance (last release 2023, active PRs), tablet camera handling (Safari iPad + Android Chrome verified via existing POS scanner in prod at `providers.js:9860`), and integration simplicity. **CDN pin (verbatim from three-bundle in-repo usage — same tag byte-identical in `www/providers.html:35`, `ios/App/App/public/providers.html:36`, `android/app/src/main/assets/public/providers.html:36`):**
   ```html
   <script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js" defer></script>
   ```
   Copy this tag verbatim into `provider-club.html`. Reference scanner wiring: `www/providers-jobs.js:1393-1466` (openQrScannerModal / startQrScanner / stopQrScanner / onQrCodeScanned) — copy shape, rename `qr-reader` div id to avoid collision. In `onQrCodeScanned`, strip the `mcc:checkin:` prefix per the existing pattern at `www/providers.js:9897` and use the resulting token as the `qr_token` body param for `POST /api/car-club/punch`.
   - **SW STATIC_ASSETS implication:** `grep -c "html5-qrcode" www/sw.js` → **0**. Library loads from unpkg (network-first CDN), NOT from STATIC_ASSETS — `defer` attribute means it doesn't block page render. **No `sw.js` CACHE_NAME bump needed for the library.** Separately: `provider-club.html` itself should follow the `car-club-member.html` pattern and stay OUT of STATIC_ASSETS (network-first HTML propagates instantly; no bump needed for the page either). **Zero cache bumps at build time.** Reverse of the standing rule ("touching a STATIC_ASSETS file requires a CACHE_NAME bump") is deliberately in effect: staying out of STATIC_ASSETS is the reason nothing bumps.
2. **Camera permissions UX on tablet — verified via existing POS scanner in prod.** `html5-qrcode` handles the `getUserMedia({ video: true })` prompt internally. First-scan flow requires HTTPS (mycarconcierge.com is HTTPS ✓). iOS Safari's user-gesture requirement for camera prompt is already handled at `providers-jobs.js:1397-1400` — scanner start is invoked inside a button click handler. On denial, `html5-qrcode` throws; catch handler shows the manual-entry fallback (matches the fallback path in the LAYOUT section above).
3. **Provider auth/session on this standalone page — same-origin localStorage carries the Supabase session.** Session lives in `localStorage.getItem('sb-ifbyjxuaclwmadqbjcyp-auth-token')` per `supabaseclient.js:12`; same-origin `provider-club.html` reads it on load via `sb.auth.getSession()`. If no session, redirect to `/login.html` (mirrors `apiFetch` pattern at `car-club-member.html:735`). Include `<script src="supabaseclient.js?v=...">` in the page head; auth chain matches the existing provider-portal pattern in `www/providers.html`.
4. **No naming collision.** `ls www/provider-*` inventory: `providers.html`, `provider-info.html`, `provider-pilot.html`, `provider-faq.html`, `provider-tips.html`, `provider-onboarding.js`, `provider-agreement.html`. **`provider-club.html` is the confirmed new-file name — no collision.**

**Non-goals for pilot-minimal (deferred to full Slice 3 post-pilot):**
- Manual point adjustments (audited to ledger)
- Member list with history
- Reward rule editor
- Testimonial moderation
- Voucher lookup (search for a code without validating — read-only view)
- Refund/cancel a fulfilled voucher (would require adding a `'cancelled'` write path on `club_points_redemptions`; the enum value exists per `20260703h:62` but no handler writes it yet — Slice 4 territory)

**Exit criteria:**
- Chris opens `provider-club.html` on his tablet, sees his club's header.
- Chris scans a member's check-in QR, sees the confirm preview, taps Confirm, sees success toast. Member's ledger increments by 1 (verifiable via `/my-clubs` on the member side).
- Member redeems a reward via the app, shows Chris the voucher code, Chris types it into Validate, sees "✓ Valid" + reward details.
- Chris tries to type the same code again, sees "✗ Invalid or already used".
- All in a clean incognito browser on prod, console clean, no server 5xx.

**Estimate:** 1 CC evening session (page shell + PUNCH flow + VALIDATE flow + QR scanner integration + auth-session wiring). Previously flagged as 1–2 sessions with QR-library research as the variable; that research is now closed (html5-qrcode@2.3.8 reuse from existing prod integration) so the build path is straight-line copy-and-wire.

---

### Full provider portal — post-pilot (consolidated design)

**DEFERRED to post-pilot per D4.** Build as ONE coherent, designed self-service experience after the pilot validates provider demand — **not** as piecemeal additions bolted onto the pilot-minimal punch/validate screen. For the pilot, all provider setup (including branding and reward rules) is hand-provisioned by admin/SQL against Chris's Alpha club; the full portal ships when a second pilot provider (or a real demand signal from Chris) makes the self-service surface worth building.

The full portal is a single feature comprising five capabilities:

1. **Self-service club creation** — provider fills a create form: club name, vehicle make/model targeting, region. Insert into `car_clubs` with `provider_id = auth.uid()`, defaults for feature toggles.
2. **Branding / personalization** — logo, banner, and theme:
   - **Logo upload** → new Supabase Storage bucket (or reuse an existing branding bucket if one exists at build time — verify) → public URL written to `car_clubs.logo_url`. Client-side crop/resize before upload; enforce size + MIME on server.
   - **Banner image** → same Storage-backed pattern → `car_clubs.banner_url` (or matching column — confirm the 21-column `car_clubs` shape at build time).
   - **Theme color** → hex string on `car_clubs.theme_color`, colored surfaces on member + provider club views.
   - **Welcome message** → short text on `car_clubs.welcome_message`, shown to newly-joined members.
   - **Description** → longer text on `car_clubs.description`, shown on club-detail views.
   - **Rules text** → free-form rules blurb on `car_clubs.rules_text`, shown on join and reachable from club-detail.
3. **Reward-rule editor** — create / edit `club_reward_rules`: rule name, `punches_required`, `point_cost`, `reward_type`, `is_active`. Guarded so activating a new rule doesn't quietly change the earn/redeem math on existing member balances (either activate with an explicit acknowledgment or version the rule).
4. **Member management** — list members with balance + activity, view per-member ledger history, manual point adjustment (positive or negative, required reason string, audited to `club_points_ledger` with a distinct `source_ref` prefix).
5. **Voucher / redemption management** — voucher lookup (search a code without validating — read-only view for support cases), fulfillment history per member, and the refund/cancel path (writes the existing `'cancelled'` enum value on `club_points_redemptions` per `20260703h:62`; needs a new handler — currently no code writes it).

**Non-goals of the full portal even at post-pilot:** points-catalog store, testimonials moderation, notification prefs — those live in Slice 5 and are separately flag-gated.

**Estimate:** pilot-minimal 1 CC session (already scoped above); full portal 1–2 weeks as a designed unit — includes UX/wireframes before code, Storage bucket + RLS design for logo/banner uploads, and a build-quality check that the reward-rule editor can't silently break in-flight redemptions.

---

## 6. Slice 4 — Admin & moderation

Server-side endpoints landed 2026-07-06 (commit `7bd8456`), all gated on `profiles.role === 'admin'` via a small `isAdmin()` helper matching the `ops-flags-admin.js:58-63` pattern. Admin routes are intentionally NOT flag-gated so Jordan can suspend/unsuspend during a Stage-2 rollback regardless of the feature-flag state.

- ✅ **Admin clubs view** — `GET /api/car-club/admin/clubs`. Returns every `car_clubs` row with id, name, provider_id, is_active, provider_suspended, member_count (denormalized counter per §9a), feature toggles, timestamps.
- ✅ **`provider_suspended` toggle (per-club kill switch)** — `PATCH /api/car-club/admin/clubs/:id/suspension`. Body: `{ provider_suspended: boolean }`. Returns the updated club row. Q2 suspension semantics preserved — hides discovery (`/browse`, `/rewards`, `/coupons`, `/comp-services`) but does NOT hide existing-member visibility (`/my-clubs`, ledger reads).
- ✅ **Ledger audit view per club** — `GET /api/car-club/admin/clubs/:id/ledger?limit=<n>&offset=<n>`. Paginated `club_points_ledger` view, most-recent-first, default 100/page, max 500. Returns club identity + ledger entries + pagination metadata.
- ✅ **Audit existing admin routes** — done 2026-07-06: every pre-existing `car-clubs.js` handler is either public (list/browse), self-scoped member (join/leave/redeem), or provider-scoped (`provider_id === user.id`). No route is "admin-intended but not gated." Nothing to patch.

**Client-side admin UI (a moderation section in `www/admin.html` calling the three endpoints above) — deferred as post-pilot polish.** For pilot, Jordan uses curl/DevTools against the endpoints directly; the observability is server-side, not tied to a UI. Slice 4's exit criteria (see below) are satisfied by endpoint availability.

**Exit criteria (server-side, all met):**
- `GET /api/car-club/admin/clubs` returns all clubs to an admin caller; 403 to non-admin; 401 to unauthenticated.
- `PATCH .../suspension` flips `provider_suspended`, reflected immediately in `/browse` (hidden) and `/my-clubs` (still visible for existing members).
- `GET .../ledger` returns paginated activity to admin only.

**Estimate:** 1–2 sessions.
**Estimate:** 1–2 sessions.

---

## 6a. Stage-1 → Stage-2 verification protocol

**Purpose:** prove the full Stage-1 loop works end-to-end with real accounts before flipping `platform_settings.car_club_programs_enabled.enabled` to `true` (§9 Stage 2). A pilot provider going live to their real customers on a broken punch or validate flow burns the pilot's first-impression window; this protocol is the gate.

**Reusable:** parameterized for any future pilot provider. Values in angle brackets get substituted at run time.

### Preconditions

Before running the protocol, verify in Studio:

- Pilot provider's club is provisioned (via `docs/scripts/provision-pilot-club.sql`): row in `car_clubs` with `is_active = true`, `provider_suspended = false`, `punch_card_enabled = true`, and a matching `club_reward_rules` row with `is_active = true`.
- Any prior seed clubs are deactivated (via `docs/scripts/deactivate-seed-clubs.sql`) so `SELECT id, name FROM car_clubs WHERE is_active = true` returns exactly one row: the pilot provider's club.
- Flag is global-off with the pilot provider and at least one internal tester in `test_users`:
  ```sql
  SELECT setting_value->'enabled' AS flag_enabled,
         setting_value->'test_users' AS test_users_list
    FROM public.platform_settings
   WHERE setting_key = 'car_club_programs_enabled';
  -- Expected: false | [<internal-tester-uid>, <pilot-provider-uid>, …]
  ```
- Zero test data. No prior `club_memberships` / `club_points_ledger` / `club_points_redemptions` rows for `<PROVIDER_CLUB_ID>`. That's the expected starting state — protocol builds from empty.

### Placeholders

| Placeholder | Meaning |
|---|---|
| `<PILOT_PROVIDER>` | The pilot provider's identity (person + business) |
| `<PROVIDER_CLUB>` | Human-readable club name (e.g. as displayed in `/provider-club.html`'s header) |
| `<PROVIDER_CLUB_ID>` | UUID from `car_clubs.id` after provisioning |
| `<TEST_MEMBER_UID>` | `auth.users.id` of the account driving the member side of the loop (typically an internal tester in `test_users`) |
| `<TEST_REWARD>` | Name of the club's reward — often the only rule at pilot minimal scope; if multiple rules exist, pick the lowest `punches_required` for shortest protocol runtime |

### The 12-step run

| # | Action | Where | Verify |
|---|---|---|---|
| 1 | Log in as `<TEST_MEMBER_UID>` | `/login.html` | Session lands, no console errors |
| 2 | Navigate to the Car Club member surface | member entry (typically `/members.html` → Car Club nav item, or `/car-club-member.html` directly) | `<PROVIDER_CLUB>` appears in `/browse` — the flag evaluates ON because this uid is in `test_users` (`_shared/feature-flag-check.js:24`) |
| 3 | Join the club | Browse → Join button | Success; `<PROVIDER_CLUB>` appears in `/my-clubs` with zero balance |
| 4 | Open a second browser (or incognito profile) as `<PILOT_PROVIDER>` | `/login.html` | Provider session established |
| 5 | Navigate to `/provider-club.html` | Provider's browser | Header shows `<PROVIDER_CLUB>` (from `/api/car-club/my-provider-clubs`), PUNCH column on left, VALIDATE column on right, no console errors |
| 6 | Look up the test member's punch token | Studio: `SELECT id, qr_code_token FROM public.profiles WHERE id = '<TEST_MEMBER_UID>';` — use `qr_code_token` if populated, otherwise use the `id` value itself (the `/punch` handler at `car-clubs.js:440-444` falls back to UUID-shaped `profiles.id` matching when `qr_code_token` returns null) | copy the value |
| 7 | Provider: click **Enter code manually** → paste the token → **Preview** → **Confirm** | provider-club.html | Toast reads exactly **"+1 point recorded"** (from provider-club.html:745). If it reads anything else (including a server error string), stop — see stop conditions below |
| 8 | Test member: refresh `/my-clubs` | Member's browser | Point balance = 1 in `<PROVIDER_CLUB>` row; progress rendering advances |
| 9 | **Repeat step 7 through the provider console** N-1 more times, where N = `club_reward_rules.punches_required` for `<TEST_REWARD>` (typically 10). **Do not shortcut with `UPDATE club_points_ledger SET delta_points = …` in Studio.** The balance is a live `SUM(delta_points)` computed on read in `listMyClubs` at `car-clubs.js:131-135` — no cached column exists on `club_memberships` — so a direct ledger UPDATE would not desync a cache, but it *would* bypass the actual `/punch` code path (provider auth, active-club check, `is_club_member` check, `source_ref` audit stamping). The whole point of the protocol is to exercise that code path; shortcutting it means the test proves nothing about the code | provider-club.html + member's `/my-clubs` between reps | After N total punches, member's balance = N; reward-earned indicator appears (per `RewardEngine.evaluate('punch_card', …)`) |
| 10 | Test member: redeem `<TEST_REWARD>` | `/my-rewards` (or Redeem button on the club card in `/my-clubs`) | Success; voucher code shown in the toast (8-char uppercase hex) — save this value for step 11. Under the hood, the `redeem_reward_for_member` RPC (20260706a) fires: advisory lock on (club, member) + FOR UPDATE on the reward row + voucher-first-then-ledger writes |
| 11 | Provider: type voucher code into VALIDATE column → **Validate** → **Confirm** | provider-club.html | Toast reads **"Voucher redeemed ✓ · N points"** (from provider-club.html:861, N = `<TEST_REWARD>`'s `point_cost`); input clears; row in `club_points_redemptions` for this voucher_code now has `status = 'fulfilled'` and non-null `fulfilled_at` |
| 12 | Provider: type the same code again → **Validate** → **Confirm** | provider-club.html | Toast reads **"Invalid or already-used voucher code"** (server-supplied on collapsed 404, per provider-club.html:787). Proves atomic reuse rejection — the endpoint's `WHERE status='issued'` clause at `car-clubs.js:682` finds no match on the second try, single-statement UPDATE returns zero rows, response collapses to 404 |

### What passing the protocol proves

- **Flag gating on both surfaces** for allowlisted users — the `test_users.includes()` branch of the flag check is exercised on both the client-side member render (step 2) and the server-side member-facing endpoints (steps 3, 8, 10).
- **Provider auth chain** — `car_clubs.provider_id === auth.uid()` gate holds against a real JWT-verified session (steps 5, 7, 11).
- **Punch flow end-to-end** — QR/manual → confirm gate → POST `/api/car-club/punch` → ledger insert with real `source_ref` stamp (steps 7, 9).
- **Ledger propagation** — `SUM(delta_points)` in `listMyClubs` reflects fresh writes in real time (step 8).
- **Redeem loop** — RPC's plpgsql atomicity (advisory-xact-lock + FOR UPDATE, voucher-first ordering) holds under a real member's balance state (step 10).
- **Validate with code display** — the `.trim().toUpperCase()` normalization on both client and server matches; the server's collapsed 404 message reaches the client toast intact (step 11).
- **Atomic reuse rejection** — the `WHERE status='issued'` single-statement guard rejects the second attempt without leaking that the code exists (step 12).

### Stop conditions — stop and debug before flipping the flag

- **401 / 403 / 404 that shouldn't be there** — e.g., step 5 returns 401 despite an active session; step 7 returns 403 despite provider auth; step 10 returns 404 despite the member being in the club.
- **Raw error message text in a toast** — indicates the endpoint sent an unsanitized DB error string that the client passed through untouched (`e.message`). The intentional collapsed messages (`'+1 point recorded'`, `'Voucher redeemed ✓'`, `'Invalid or already-used voucher code'`) are safe; anything else in a toast that reads like SQL or a stack trace is not.
- **Undefined voucher code in the redeem-success toast** at step 10 — signals the redeem client isn't reading the RPC's structured return correctly.
- **QR scan won't decode but manual entry works** at step 7 — note the observation but the protocol still passes if manual entry succeeds. Camera scanner is a UX polish; the underlying punch flow is proven either way.
- **Any 500** — stop immediately. 500s from these endpoints indicate a schema mismatch or an unexpected DB error and need server-log inspection before proceeding.

### Stage-2 canary (required before widening beyond the single provider)

**The 12-step protocol exercises only the `test_users.includes(userId)` branch** of `isFeatureEnabledForUser` at `_shared/feature-flag-check.js:24`. Every request in the protocol comes from an allowlisted account.

When the flag flips (`enabled: true`), a real customer's `isFeatureEnabledForUser` call short-circuits at the `enabled === true` check on line 21 — **a different code branch**. Both return `true`, so the flag gate behaves the same. But real customers can have properties internal testers don't:

- Missing `profiles.qr_code_token` → hits the UUID-shaped `profiles.id` fallback path in `/punch` (car-clubs.js:440-444). This IS covered by the protocol only if the test member's `qr_code_token` happens to be null; if you're always using the `qr_code_token` path in the protocol, the fallback path stays untested.
- Phone-only auth with `null` email → any email-dependent client code paths (there aren't many in the Car Club surface, but there are some in surrounding shared code).
- Older profile shapes without `full_name` or a fully-populated `profiles` row (early-signup migration artifacts).
- First-time users whose `club_memberships.is_active` history is empty vs. rejoin flows.

**Before widening the pilot beyond the single provider (i.e., before any decision to add a second pilot provider or increase the pilot's public visibility), run one non-allowlisted account through join → punch → redeem as the true Stage-2 canary.** The pilot provider's first walk-in customer is the ideal target — real properties, real workflow, real network. If the canary passes, widen. If it snags on any of the customer-shape properties above, fix before widening.

### Evidence records

Completed runs of this protocol live as dated companion notes at `docs/scripts/verification-runs/YYYY-MM-DD-<pilot-provider-slug>.md`. Each note records: the run date, the pilot provider identity, the substituted placeholder values, screenshots or SQL evidence for each of the 12 steps, and the pass/fail/stop-condition outcome. The first evidence record (Chris Agrapidis / Alpha Auto Body Rewards) will be added by Jordan after the live run.

---

## 7. Slice 5 — Deferred program surfaces (post-pilot only)

Store (catalog + orders — **points-only**; no cash top-ups or stored value; `FEATURE_WALLET` stays false and this feature must not become a wallet), testimonials, notifications. Each needs handlers + RLS + client verification. Build only on pilot signal.

Notifications: matchmaker is now the SECOND track (D6 reversed 2026-07-04), so its push infrastructure lands AFTER Car Club. Two paths depending on Slice 5 timing: (a) wait for matchmaker to ship its push stack and reuse it (in-app bell, email, mobile push, prefs) — cheapest if the pilot signal comes in after matchmaker ships; (b) build a standalone Car Club notification stack — adds ~1 week if Slice 5 needs to ship before matchmaker's push does. Decide when pilot signal actually arrives.

---

## 8. Launch hygiene (bundle into the slices, don't let it float)

- Native `_redirects`: add `/api/car-club/*` to iOS and Android public bundles **when** Car Club ships in native builds.
- SW rule, two parts: **(a)** any commit touching a file already in `STATIC_ASSETS` (`members-core.js`, `members-extras.js`, `members.html` — i.e., Slice 1's **very first commit**) ships a `CACHE_NAME` bump in the same push (standing rule from 2026-07-03); **(b)** separately decide whether `car-club-member.html` and its JS get added to `STATIC_ASSETS` at all — as network-first HTML today it propagates instantly, which argues for leaving it out.
- Pre-seed `loadedModules` (or delete the vestigial `loadModule` path) at the first `members-core.js` touch.
- Insurance loader fix (`members-extras.js:9356`): one-identifier change, `supabase` → `supabaseClient`. Error text (`evaluating 'supabase.auth.getSession'`) suggests `supabase` currently resolves to the supabase-js UMD namespace rather than being undefined — `typeof window.supabase` at fix time settles it; the fix is identical either way. Unrelated to Car Club but queued in the same v1.1 sweep, then verify the Insurance section renders data.

---

## 9. Rollout stages & kill switch

| Stage | State | Gate to advance |
|-------|-------|-----------------|
| 0 (now) | `enabled:false`, `test_users=[Jordan]` | Slices 1–2 exit criteria pass |
| 1 | Same flag state; Jordan full-loop testing | Full earn/redeem loop verified in prod |
| 2 — Pilot | Add pilot provider + 5–10 invited members to `test_users`; club provisioned | 2–4 weeks: joins, ≥ weekly punches, ≥1 completed redeem loop, zero flow-breaking bugs |
| 3 — Global | `enabled:true`; terms blurb (D3) live; announce | — |

**Test-user provisioning (Stage 2):** Jordan runs in Studio, one statement per added member:

```sql
update platform_settings
set setting_value = jsonb_set(
  setting_value, '{test_users}',
  coalesce(setting_value->'test_users', '[]'::jsonb) || '"<uid>"'::jsonb)
where setting_key = 'car_club_programs_enabled';
```

Removal = rewrite the array in the same row. The kill switch lives in this same row — keep `enabled` changes and `test_users` changes as **separate deliberate statements**, never one rushed combined edit.

**Kill switch:** set `enabled:false` — verified fail-closed: all surfaces hide, GETs return 200-empty, writes 403. No deploy required. One latency caveat: `window._mccFlags` is cached per session, so already-open browser sessions keep the old value until their next page load — the switch is instant for new sessions and all server-side writes, and next-navigation for everyone else. Acceptable for this feature class; just don't expect an instant across-the-board flip.

---

## 9a. Post-pilot debt list (tracked, deliberately not fixed pre-pilot)

- **`car_clubs.member_count` should be a DB trigger or computed-on-read** (COUNT of `club_memberships` WHERE `is_active=true`) rather than an app-layer denormalized counter. Current joinClub `+1` (fresh insert only, not reactivate) and leaveClub `-1` (every active→inactive) mirror-writes are non-atomic and asymmetric — repeated leave/rejoin cycles drift the counter low over time. Acceptable during pilot (~10 members, cosmetic surface only); fix before scaling admin/analytics dashboards that read this column as truth. Referenced in `netlify/functions/car-clubs.js` leaveClub inline comment (2026-07-04, commit adding join/leave/my-rewards).
- **`/browse` handler missing `reward_count` and `bgc_*` fields** (`car-club-member.html:1021, :1050, :1055-1060`) — the client renders "0 reward(s)" and always the neutral BGC badge on every browse card because `listBrowse` at `netlify/functions/car-clubs.js` doesn't join/aggregate them. Cosmetic only during pilot; both fields need Slice 2/3 work: `reward_count` = aggregate against `club_reward_rules` (or `club_rewards` once Slice 2 wires the point catalog); `bgc_badge_verified` / `bgc_compliant_employees` / `bgc_total_employees` = join against the provider BGC status source. Do together to avoid two-pass client change.
- **Q3 catalog filter is a separate `car_clubs` fetch per endpoint** — `listRewards`, `listCoupons`, `listCompServices` each do their own `sb.from('car_clubs').select('id, is_active, provider_suspended').eq('id', clubId).single()` to gate the catalog behind club suspension state. Three extra reads on top of the catalog fetch. Fine at pilot scale (~10 members, single-digit catalog loads per session); fold the club-state check into a JOIN or a SECURITY DEFINER helper when optimizing. Don't build now — pilot performance is not the constraint.
- **`/punch` has no retry/dedupe guard.** By deliberate pilot design: provider confirms every punch (D2), only Chris punches (D1 trusted provider), so double-tap defense is not built in Slice 2. If double-punch abuse appears at scale (multi-provider surface, or Chris scanning too fast at the counter), add an N-minute idempotency window per (`club_id`, `member_id`) — reject duplicate punches inside the window regardless of caller intent. Implementation shape: pre-INSERT `SELECT id FROM club_points_ledger WHERE club_id=$1 AND member_id=$2 AND source_ref LIKE 'punch:%' AND created_at > now() - interval '<N> minutes' LIMIT 1`.
- **`club_points_ledger` has no `reward_rule_id` column.** Ledger is rule-agnostic by schema (`20260703h:106-115`) — a punch = +1 delta_points, and rule progress is computed at REDEEM time via SUM(delta_points) vs `club_reward_rules.punches_required`. Pilot per D5 has one rule per club so this works. If multi-rule per-club mechanics matter post-pilot (e.g. a club runs a 5-punch AND a 10-punch reward simultaneously and needs each punch tagged to a specific rule for reporting), add `reward_rule_id uuid REFERENCES club_reward_rules(id)` to the ledger. Client-side progress rendering would then need to filter by rule instead of using the single SUM.
- **No per-punch point value column.** Both `club_reward_rules` (20260703d) and `club_points_config` (20260703h:96-103) lack a per-visit point value; `points_per_dollar` is spending-scaled. Pilot hard-codes +1 per punch in `/punch`. If per-punch configurability is needed post-pilot (e.g. a bonus punch on member's birthday, or a "double-punch Tuesday" promo), add `points_per_punch int NOT NULL DEFAULT 1` to `club_reward_rules`.
- **`profiles.qr_code_token` is not in tracked migrations.** Grep returns 0 hits in `supabase/migrations/`; the column exists in prod per `www/members-core.js:2954` client query and is queried by `/punch` for member resolution. Same class as `member_club_balances` (Replit-era unmigrated column). Write the CREATE TABLE / ALTER TABLE that matches prod so replay works and future schema audits don't hit the same drift blind spot.
- **`redeem_reward_for_member` (3-param RPC) lacks `FOR UPDATE` on `club_rewards`.** The 2-param sibling `redeem_reward` at `20260703h:189` uses `SELECT * INTO r FROM club_rewards WHERE ... FOR UPDATE`; the 3-param version at `20260703h:374-375` does NOT. Under concurrent redemptions from the same member (or against the same low-inventory reward), the balance/inventory checks can race — two calls both see balance=50, both pass check for cost=30, both INSERT -30, balance ends at -10 (double-spend). Symmetric shape for inventory going negative. Pilot volume (single-provider, sub-10 members, low redemption cadence) makes this near-zero risk; post-pilot add `FOR UPDATE` to the 3-param RPC. Fix is a migration touching only the RPC body.
- **`redeem_reward_for_member` returns `uuid` (redemption row id), not `voucher_code`.** `/redeem` handler does a follow-up SELECT to fetch the code for client display. If any other future caller invokes the RPC, they need the same follow-up SELECT — worth adding a wrapper RPC that returns a composite type / json with both fields.
- **Existing `redeemReward` handler at `car-clubs.js:764` has stale error strings.** It calls the 3-param RPC but its error-message `.includes()` matching is against the 2-param variant's language ("Not a member of this club" vs the 3-param's "Not an active club member"; "Not enough points" vs "Insufficient points"). Real 3-param errors fall through to `500` instead of specific 4xx codes. Fix at the same time as the /redeem endpoint is verified: either retire redeemReward and reroute its dispatcher line, or fix the error strings to match 3-param. `/redeem` (top-level, Slice 2) uses correct 3-param strings from the outset.
- **Plan §4 vs schema terminology drift.** Plan says validate marks voucher `used_at`; schema column at `club_points_redemptions` is `fulfilled_at` (`20260703h:147`), no `used_at` column exists. When `/validate-voucher` is built, use `fulfilled_at`, `status='fulfilled'` (from `club_redemption_status` enum at `20260703h:62`). Existing `fulfillRedemption` at `car-clubs.js` already uses the correct column names — reference implementation.
- **Punch confirm shows a generic "Award a punch to this member?" — no member-name preview.** Deliberate for pilot per D1 (Chris is trusted and can see the member in front of him); building name preview needs either a new `GET /api/car-club/member-by-token` endpoint (takes `{ club_id, qr_token }`, returns `{ member: { id, full_name } }` if member is in the club, 404 otherwise) OR a preview-only mode on `/punch` that resolves the member without writing. `member-by-token` is the cleaner surface — provider-club.html's confirm view could then show "Award a punch to **Jane Smith**?" post-pilot. Confirm-gate design in the client (`provider-club.html:showPunchConfirmGate`) already routes both scan and manual paths through one choke-point, so adding the name preview is a one-place UI edit + one new server endpoint.
- **DB migration tracking is not used.** The `supabase_migrations.schema_migrations` table is effectively empty; all schema changes to date (including the entire `20260703a-h` series and the `20260706a` redeem RPC rewrite) were applied directly in Supabase Studio's SQL Editor, NOT via `supabase db push` / `supabase migration up` / the CLI pipeline. **Consequences:** (a) no automated applied-migrations record — the `supabase/migrations/` directory holds the SOURCE OF TRUTH for what a fresh replay would produce, but is silent on what actually landed in prod; (b) `supabase db reset` will NOT reproduce prod state — it will replay the migration files against a fresh DB, but any prod-only ad-hoc changes (columns like `profiles.qr_code_token`, tables like `member_club_balances`) will be missing; (c) every schema change requires manual pre-flight (grep for callers, column verification, DROP FUNCTION handling for signature changes) and manual Studio apply — the workflow we've been running throughout Slice 1 + Slice 2. **Post-pilot consideration:** either adopt CLI-tracked migrations end-to-end (requires reconciling prod against the migration files first — the Replit-era drifts flagged elsewhere in §9a would need matching migration files first) OR document the manual apply process formally (checklist per migration, pre-flight steps, verification queries) so a new contributor doesn't accidentally skip the discipline. Not blocking pilot; noted so it's a conscious state, not a surprise.

---

## 10. Estimate summary

| Scope | Effort (evening-session cadence) |
|-------|-------|
| MVP pilot (Slices 1 + 2 + provider-minimal) | 6–10 CC sessions ≈ 2 weeks near-daily, ~3 weeks at 3–4 sessions/week |
| Full feature (+ full provider portal, admin, store/testimonials/notifications) | +2–3 weeks |

Not before: July 4 submission out the door. D6 decided 2026-07-04 (Car Club first, matchmaker deferred), and Slice 1 shipped 2026-07-04 — **Slice 2 (points engine) is now the active build track.** Matchmaker is deferred; when it eventually starts, it does not compete with Car Club build time because Car Club will already be at/past pilot by then.
