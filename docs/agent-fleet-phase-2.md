# MCC Agent Fleet — Phase 2 Audit & Enablement Roadmap

_Status as of 2026-04-22. Author: planning pass for follow-on work to Phase 1._

---

## 1. Phase 1 baseline (what is actually live)

**Live & wired:**
- `agents`, `agent_events`, `agent_actions`, `agent_memory`, `agent_daily_spend` tables (RLS, service-role only).
- RPCs `agent_try_spend` / `agent_reconcile_spend` (locked down to `service_role`).
- Shared runtime `netlify/functions/agent-fleet-runtime.js` — single funnel for Anthropic calls; enforces the spend cap via reserve→call→reconcile.
- **Orchestrator** (`agent-orchestrator.js`) — Scheduled Function `* * * * *`, drains `agent_events`, fires fire-and-forget HTTP at handler endpoints with `x-fleet-source: orchestrator`.
- **Analyst** (`agent-analyst.js`) — Scheduled Function nightly UTC; rolls up 24h marketplace metrics, stores Claude briefing under `agent_memory(kind='briefing', key='latest')`.
- Admin UI `/admin/agent-fleet.html` + API `/api/admin/agent-fleet/*` (registry control, review queue, spend chart, briefing card, test-event emitter, manual run buttons).
- DB trigger `agent_emit_auction_closed` on `care_plans.status` — currently the **only** real producer on the bus.
- All 8 agents seeded with `enabled=false`, `autonomy='propose'`.

**Deliberately out of scope in Phase 1:** specialist handler implementations, retry/DLQ, cross-agent spend alerts, additional event producers, workflow/`nightly.tick` cron, per-agent admin pages.

### 1.1 Baseline snapshot — function × schedule × reads × writes × cap

| Agent | Function file | Schedule | Reads (tables) | Writes (tables) | Cap (USD/day) | Model |
|---|---|---|---|---|---|---|
| Orchestrator | `netlify/functions/agent-orchestrator.js` | `* * * * *` | `agents`, `agent_events` (unprocessed) | `agent_events` (sets `processed_at`, `routed_to`), `agent_actions` (route log) | $1.00 | `claude-haiku-4-5-20251001` |
| Analyst | `netlify/functions/agent-analyst.js` | nightly UTC | `packages`, `care_plans`, `bids`, `profiles`, `disputes`, `payments`, `survey_leads`, `outreach_leads`, `outreach_messages`, `ai_escalations`, `agent_actions`, `agent_daily_spend` | `agent_memory` (briefing, key=`latest` and date), `agent_actions` | $2.00 | `claude-sonnet-4-5` |
| Matchmaker | ❌ stub | event-driven | — | — | $5.00 | `claude-sonnet-4-5` |
| Treasurer | ❌ stub | event-driven | — | — | $5.00 | `claude-sonnet-4-5` |
| Gatekeeper | ❌ stub | event-driven | — | — | $3.00 | `claude-sonnet-4-5` |
| Concierge | ❌ stub | event-driven | — | — | $5.00 | `claude-sonnet-4-5` |
| Advocate | ❌ stub | event-driven | — | — | $4.00 | `claude-sonnet-4-5` |
| Hunter | ❌ stub | event-driven | — | — | $4.00 | `claude-sonnet-4-5` |

**Total seeded daily cap:** $29.00 across all 8 agents (Phase 1 actual burn is just orchestrator + analyst, ≤$3/day).

All caps are enforced by the shared runtime (`agent-fleet-runtime.js`) via the reserve→call→reconcile pattern using the `agent_try_spend` / `agent_reconcile_spend` RPCs. When an agent would exceed its cap the runtime throws `SpendCapError` and the handler logs a `status='skipped'` row to `agent_actions` — **silently, with no admin notification today**. §3.3 below addresses this gap.

---

## 2. Per-agent gap analysis (the six stub agents)

Each row below answers: handler file? subscribed events? real producers? data dependencies? recommended autonomy at launch?

### 2.1 Matchmaker
- **Subscribes:** `care_plan.auction_closed` ($5/day cap)
- **Handler file:** ❌ none. `endpoint=/.netlify/functions/agent-matchmaker` is a 404.
- **Producer (verified):** ✅ DB trigger `agent_emit_auction_closed` defined in `supabase/migrations/20260422_agent_fleet.sql` lines 269–301 fires on `care_plans` UPDATE when `status` transitions to `auction_closed`. No additional emit point needed; this is the **only** producer in the entire fleet that already exists.
- **Data needed:** `care_plans` row; child `bids` (provider_id, amount, eta, notes); provider profile fields used by ranking (rating, completion rate, distance, BGC compliance, capacity).
- **Decision shape:** `{ care_plan_id, ranked_bids:[{bid_id, score, reasoning}], recommended_winner_bid_id, confidence }` → written as `agent_actions.action_type='matchmaker.rank'`.
- **Handler flow:** event consumed → fetch care_plan + bids → Claude ranks → `agent_actions` row written via `logAction()`. Under `propose`: `needs_review=true`, admin must approve before any downstream action. Under `assist`: auto-execute only if `confidence ≥ 0.85`, else `needs_review=true`. Under `autonomous`: never enable in Phase 2.
- **Autonomy at launch:** `propose`. Promote to `assist@0.85` only after 50+ approved proposals show ≥80% admin agreement.
- **Risk:** wrong winner = lost trust + Stripe Connect headaches. Always require admin click-through before notifying losers in Phase 2.
- **Starting model:** `claude-sonnet-4-5` (seeded). Sonnet is the right call here — bid ranking needs reliable structured-output reasoning over 5–20 bids; Haiku has shown weaker JSON adherence in our internal tests.
- **Effort:** **M** (~2d) — handler is greenfield but producer + data model already exist.
- **Open question:** does our `bids` table store competitor count + bid timestamp? Confirm before prompt design.

### 2.2 Treasurer
- **Subscribes:** `payment.captured`, `payment.refund_requested`, `payout.failed` ($5/day cap)
- **Handler file:** ❌ none.
- **Producers:** no producer emits `payment.captured`, `payment.refund_requested`, or `payout.failed` today (only the admin "Emit" button in `agent-fleet-admin.js` and the `care_plans` DB trigger produce events). Concrete wire-in points (all files verified to exist in `netlify/functions/`):
  - `payment.captured` → add inside `netlify/functions/split-pay.js` (member-side Stripe charge), `netlify/functions/split-guest-pay.js` (guest-side), and `netlify/functions/split-guest-confirm.js` (post-confirm finalization).
  - `payment.refund_requested` → add inside `netlify/functions/ai-ops-admin.js` (the existing admin refund initiation path) and `netlify/functions/dispute-resolver-background.js` (auto-refund branch).
  - `payout.failed` → add inside `netlify/functions/stripe-connect-callback.js` (Stripe Connect webhook handler) on the `payout.failed` event branch. Also add to `netlify/functions/payment-tracker-scheduled.js` if it detects stuck payouts.
- **Data needed:** `payments` row, related `care_plan` / `job`, Stripe `payment_intent.id`, escrow state.
- **Decision shape:** `{ payment_id, recommended_action: 'capture'|'partial_refund'|'full_refund'|'escalate', amount_cents, justification }` → `agent_actions.action_type='treasurer.recommend'`.
- **Handler flow:** event consumed → fetch payment + linked job → Claude classifies → `agent_actions` row written. Phase 2 hardcodes `needs_review=true` regardless of autonomy mode (money path); auto-apply is **disallowed** until Phase 3.
- **Autonomy at launch:** `propose` only. Treasurer touches money — never let it auto-execute Stripe API calls until we have insurance-level audit trails.
- **Risk:** ⚠️ highest blast radius in the fleet — wrong refund = real-money loss + chargeback exposure.
- **Starting model:** `claude-sonnet-4-5` (seeded). Money-classification quality > cost. Do not downgrade to Haiku.
- **Effort:** **L** (~3d) — handler + 3 producer wire-in points across `split-pay.js`, `split-guest-pay.js`, `stripe-connect-callback.js`; needs careful coexistence with `ai-ops-admin.js` and `payment-tracker-scheduled.js`.
- **Open question:** today's `ai-ops-admin.js` already writes payment-tracker rows; we must avoid double-acting. Treasurer should explicitly *consume* the same signal and create a *recommendation*, not a parallel action.

### 2.3 Gatekeeper
- **Subscribes:** `provider.applied`, `provider.bgc_completed`, `provider.flagged` ($3/day cap)
- **Handler file:** ❌ none.
- **Producers:** no producer emits `provider.applied`, `provider.bgc_completed`, or `provider.flagged` today. Concrete wire-in points (verified file existence noted; route discovery is still required for some paths):
  - `provider.applied` → no INSERT into `provider_applications` was located in `www/server.js` or `netlify/functions/` (verified via `rg "provider_applications.*insert"`). Reads/updates exist (`www/server.js:18991, 19040, 19219`), but the row creation appears to happen client-side via the direct Supabase client from `www/onboarding-provider.html`. Phase 2 step 1: confirm the creation path (likely `www/onboarding-provider.html` Supabase RPC), then move that insert behind a new express route `POST /api/provider/apply` in `www/server.js` and emit `provider.applied` from the new route. Do **not** attempt to emit from a client — events must be server-side.
  - `provider.bgc_completed` → BGC webhook handler is `handleBgChecksWebhook` at **`www/server.js:19327`**, route registered at `www/server.js:36756` (`POST /webhook/bgcheck`). The completion branch is the `order.complete`/`order.completed` case at lines **19370–19384**; the cleared/eligible profile-update follows at **19412–19422**. Emit `provider.bgc_completed` immediately after the profile update (line ~19422), passing `{ provider_id: updated.provider_id, employee_id: updated.employee_id, status: updated.status, check_id: updated.id }`.
  - `provider.flagged` → no admin "flag" mutation found in `www/server.js` or `netlify/functions/admin-team.js` (no write to `is_suspended` or any flag column was located via `rg "is_suspended"` — only read filters at `www/server.js:43989, 44867`). Suspension is currently performed client-side from `www/admin.js` against Supabase directly. Phase 2 step 1: add a `POST /api/admin/provider/flag` express route in `www/server.js` (admin-password gated like `agent-fleet-admin.js`), move the flag/suspend mutation server-side, and emit from there. The BGC-driven auto-flag path will need a parallel emit wherever `provider_alerts` rows with `severity='critical'` are inserted (search needed once that ingestion path exists — `replit.md` references a `bgc-send-reminders` Scheduled Function but that file is **not present** in `netlify/functions/` on this branch, verified via `ls`).
- **Data needed:** profile + cached `bgc_*` columns + license uploads + employee count.
- **Decision shape:** `{ provider_id, recommendation:'approve'|'reject'|'request_more_info', reasoning, flags[] }` → `agent_actions.action_type='gatekeeper.review'`.
- **Handler flow:** event consumed → fetch profile + cached BGC + uploads → Claude reasons → `agent_actions` row written. `propose`/`assist`: `needs_review=true` always (legal-sensitive). `autonomous`: disallowed in Phase 2.
- **Autonomy at launch:** `propose`. Compliance/legal sensitivity is too high for `assist`.
- **Risk:** false approval = liability; false rejection = unfair denial of livelihood. Always human-in-loop.
- **Starting model:** `claude-sonnet-4-5` (seeded). Compliance reasoning over multi-factor profile data warrants Sonnet.
- **Effort:** **M** (~2.5d) — handler + 3 producer wire-ins (onboarding-completion endpoint, BGC webhook, admin flag button).

### 2.4 Concierge
- **Subscribes:** `support.ticket_created`, `member.message_received` ($5/day cap)
- **Handler file:** ❌ none.
- **Producers:** no producer emits `support.ticket_created` or `member.message_received` today. Concrete wire-in points (files verified to exist in `netlify/functions/`):
  - `support.ticket_created` → emit from `netlify/functions/helpdesk.js` (AI Helpdesk chat function — verified) at the moment a session is escalated to human, AND from `netlify/functions/helpdesk-email.js` (inbound support-email handler — verified) when a new email arrives. Phase 2 also needs a new `support_tickets` table (no such table today; helpdesk currently runs one-shot without persistence) — this schema work is the bulk of the effort.
  - `member.message_received` → emit from `netlify/functions/helpdesk.js` per inbound member message turn (only after the support_tickets table exists so we have a ticket_id to attach).
- **Data needed:** ticket text, member profile, recent jobs, related care plan if any.
- **Decision shape:** `{ ticket_id, draft_reply, classification, escalate:true|false, suggested_macros[] }` → `agent_actions.action_type='concierge.draft'`.
- **Handler flow:** event consumed → fetch ticket + member context → Claude drafts → `agent_actions` row written. Under `propose`/`assist`: `needs_review=true`. Even at `assist@0.90`, the draft is *staged* (admin still clicks Send) — there is no auto-send path in Phase 2.
- **Autonomy at launch:** `assist@0.90` for *drafts only* (admin sends), `propose` for any escalation/refund recommendation.
- **Risk:** medium — wrong draft is recoverable (admin reviews), but tone matters for member trust.
- **Starting model:** `claude-sonnet-4-5` (seeded). Tone-sensitive customer drafts need Sonnet's prose quality; revisit Haiku once we have a tone-consistency eval.
- **Effort:** **L** (~4d) — biggest schema lift in the fleet (new `support_tickets` table + form + admin viewer + producer).

### 2.5 Advocate
- **Subscribes:** `dispute.opened`, `provider.suspended`, `provider.low_rating` ($4/day cap)
- **Handler file:** ❌ none.
- **Producers:** no producer emits `dispute.opened`, `provider.suspended`, or `provider.low_rating` today. Concrete wire-in points:
  - `dispute.opened` → no INSERT into `disputes` was located in `www/server.js` or `netlify/functions/` (verified via `rg "from\\(['\"]disputes['\"]\\)\\.insert"`). Only updates exist (`www/server.js:44394, netlify/functions/ai-ops-admin.js:213, netlify/functions/dispute-resolver-background.js:250`). Disputes are presently filed client-side from `www/admin.js` (line ~1169 reads them) or via the member dispute form. Phase 2 must add a `POST /api/disputes/file` express route in `www/server.js` and emit from there. Until then, a stop-gap is to emit from `netlify/functions/dispute-resolver-background.js` line 141 (the `from('disputes').select` fetch) — but that fires *after* AI-Ops has already started, which is too late for Advocate to add value.
  - `provider.suspended` → no write to `is_suspended` was found anywhere in `www/server.js` or `netlify/functions/` (verified via `rg "is_suspended"` — only filter reads at `www/server.js:43989, 44867`). Suspension is currently performed entirely client-side from `www/admin.js`. Phase 2 must add a `POST /api/admin/provider/suspend` express route in `www/server.js` (admin-password gated), move the suspend mutation server-side, and emit from there. This is the same architectural gap as Gatekeeper's `provider.flagged` — the two can share a single new route family.
  - `provider.low_rating` → no rating-related file in `netlify/functions/` (verified absent via `ls`). Two options: (a) add a Postgres trigger on the `ratings` table that emits on average-rating drop (mirrors the `agent_emit_auction_closed` pattern in `supabase/migrations/20260422_agent_fleet.sql` lines 269–301), or (b) emit from the express rating-insert route in `www/server.js`. Option (a) is preferred — it cannot be bypassed by alternate insert paths.
- **Decision shape:** `{ provider_id, dispute_id?, outreach_plan, draft_message, urgency }` → `agent_actions.action_type='advocate.outreach'`.
- **Handler flow:** event consumed → fetch provider + dispute/rating context → Claude drafts → `agent_actions` row written. Disputes always `needs_review=true`. Low-rating nudges under `assist@0.85`: auto-stage in outbound queue (`status='ai_recommended'`), admin still clicks Send.
- **Autonomy at launch:** `propose` for disputes; `assist` for nudges (low-stakes encouragement DMs).
- **Risk:** medium — bad dispute message can escalate; bad nudge is annoying but recoverable.
- **Starting model:** `claude-sonnet-4-5` (seeded). Provider-facing copy needs warmth + accuracy on dispute facts; Sonnet appropriate.
- **Effort:** **M** (~2.5d) — handler + 3 producer wire-ins.

### 2.6 Hunter
- **Subscribes:** `lead.discovered`, `campaign.requested` ($4/day cap)
- **Handler file:** ❌ none.
- **Producers:** no producer emits `lead.discovered` or `campaign.requested` today. Concrete wire-in points (all files verified to exist in `netlify/functions/`):
  - `lead.discovered` → emit at the end of `netlify/functions/apollo-discovery-scheduled.js` (after each lead is inserted), and inside `netlify/functions/outreach-admin.js` on the manual-add admin path. `netlify/functions/outreach-engine-core.js` and `netlify/functions/outreach-cycle.js` are downstream processors and should NOT emit (would double-fire).
  - `campaign.requested` → emit from `netlify/functions/outreach-admin.js` when an admin clicks "Start campaign" in the outreach console.
- **Decision shape:** `{ lead_id, score 0–100, recommended_template, send_now:true|false, reasoning }` → `agent_actions.action_type='hunter.score'`.
- **Handler flow:** event consumed → fetch lead + Apollo enrichment → Claude scores → `agent_actions` row written. `propose`: `needs_review=true`. `assist@0.90`: auto-stage in Instantly.ai queue with `status='ai_recommended'` (admin must click Send before any external email leaves). `autonomous`: disallowed in Phase 2.
- **Autonomy at launch:** `assist@0.90` — but DO NOT let Hunter send mail directly even when assist'd; it should drop into the existing Instantly.ai send queue with `status='ai_recommended'`. Admin still clicks send.
- **Risk:** low — drafts only; no external send without admin click.
- **Starting model:** `claude-sonnet-4-5` (seeded). **Strong candidate to downgrade to `claude-haiku-4-5-20251001`** once Phase 2 ships — lead scoring is high-volume, low-stakes, and structurally simple. Re-evaluate after the first 1k scored leads.
- **Effort:** **M** (~2d) — handler + 1-line producer wire-in inside `apollo-discovery-scheduled.js`.

---

## 3. Cross-cutting Phase 2 work

These are not per-agent — they unblock the whole fleet.

### 3.1 `nightly.tick` cron emitter (P0, trivial)
Analyst is subscribed to `nightly.tick` but nothing emits it. Today the analyst is invoked directly by its own Scheduled Function. Either:
- **(A)** Add a tiny `agent-cron-emitter.js` Scheduled Function (`0 5 * * *` UTC) that just calls `emitEvent('nightly.tick', ...)` and lets the orchestrator route it. **Preferred** — this is the canonical pattern other Phase 2 agents will rely on.
- **(B)** Keep direct invocation. Easier short-term but inconsistent with the "everything goes through the bus" model.

Recommend (A). Same emitter can publish `weekly.tick`, `hourly.tick` for future agents.

### 3.2 Dead-letter queue + retry (P0)
Today the orchestrator dispatches handler HTTP fire-and-forget. If the handler 500s, the event is marked processed and lost. Phase 2 needs:
- New columns on `agent_events`: `attempt_count int default 0`, `last_error text`, `dead_lettered_at timestamptz`.
- Orchestrator change: only mark `processed_at` when the dispatched handler returns 2xx (or after `max_attempts=3`, set `dead_lettered_at`).
- New admin tab: "Dead-lettered events" with manual replay button.

### 3.3 Spend alerting (P1)
We meter spend; we don't yet alarm on it. Add:
- A Resend email to admins when any agent crosses 80% of its daily cap.
- A red banner in `/admin/agent-fleet.html` when ≥1 agent is at 100%.
- Weekly digest line in the analyst briefing showing top spender.

### 3.4 Per-agent action pages (P1)
The shared "Recent activity" feed gets noisy fast. Phase 2 should add `/admin/agent-fleet/<slug>.html` per specialist with its own action history, prompt-template editor, and review queue.

### 3.4a Admin UI: event-volume chart (P1)
Today the admin UI shows spend over 7 days but no view of *event throughput*. Add a stacked-bar Chart.js panel on `/admin/agent-fleet.html` showing `agent_events` count per day, segmented by `event_type`. This is critical for spotting producer misfires (e.g. trigger loop emitting 10k events) before they burn cap.

### 3.4b Admin UI: autonomy-promotion guardrail (P1)
The current registry lets an admin flip any agent from `propose` → `autonomous` with a single dropdown change. Phase 2 must gate this: the autonomy `<select>` should disable the `autonomous` option unless the agent has ≥50 reviewed actions with ≥80% approval rate over the last 14 days, AND require a typed confirmation ("ENABLE AUTONOMOUS MODE FOR <slug>") in a modal. Backend `PUT /agents/:slug` enforces the same rule server-side. Treasurer + Gatekeeper + Matchmaker are *hardcoded* to reject `autonomous` regardless of stats in Phase 2.

### 3.5 Prompt template versioning (P1)
Right now prompts live inline in handler `.js` files. Move to `agents.config.prompt_template` (jsonb) with `template_version` so we can A/B and roll back without redeploys.

### 3.6 Schema migration: `agent_events.event_id` UUID + idempotency key (P2)
For at-least-once delivery semantics handler functions need an idempotency key. Add `agent_actions.idempotency_key text unique` so duplicate dispatches collapse cleanly.

### 3.7 Observability (P2)
Add a `/api/admin/agent-fleet/health` endpoint that returns: orchestrator last-tick age, oldest unprocessed event, error rate per agent over last hour. Hook to PagerDuty later.

---

## 4. Recommended rollout order

Time estimates assume one engineer.

| # | Work item | Why first | Est |
|---|---|---|---|
| 1 | `nightly.tick` cron emitter (3.1) | Unblocks the canonical event-driven pattern; tiny | 0.5d |
| 2 | DLQ + retry (3.2) | Required before any specialist takes real load | 1.5d |
| 3 | Spend alerting (3.3) | Before enabling more agents, we need to *see* runaway cost | 0.5d |
| 4 | **Matchmaker** (2.1) | Only agent whose producer already exists → fastest end-to-end demo | 2d |
| 5 | **Gatekeeper** (2.3) | High product value; producers slot into existing BGC + onboarding paths | 2.5d |
| 6 | **Hunter** (2.6) | Outreach already runs daily; emitting `lead.discovered` is a one-liner | 2d |
| 7 | **Treasurer** (2.2) | Money-touching → wait until DLQ + alerting + Matchmaker are battle-tested | 3d |
| 8 | **Advocate** (2.5) | Depends on dispute trigger work and rating watcher | 2.5d |
| 9 | **Concierge** (2.4) | Needs new `support_tickets` table → most schema work; defer | 4d |
| 10 | Per-agent admin pages (3.4) | Once 4+ agents are live, the shared feed is unusable | 2d |
| 11 | Prompt versioning (3.5), idempotency (3.6), health (3.7) | Polish | 3d combined |

**Total Phase 2:** ~24 engineer-days end-to-end. MVP slice (items 1–4) = ~4.5d and produces a fully working second agent.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Orchestrator dispatch storm exhausts daily caps in minutes if a producer misfires (e.g. trigger loop) | Medium | High | Add per-event-type rate limit in orchestrator; spend alerting (3.3); cap remains the hard backstop. |
| Fire-and-forget HTTP loses events on transient 502 | High pre-DLQ | Medium | DLQ + retry (3.2) — block all specialist enablement on this. |
| Treasurer or Matchmaker recommendations adopted without admin sanity check after admin fatigue | Medium | High | Lock at `propose` for 60 days post-launch; auto-promote requires explicit admin opt-in per agent. |
| Prompt drift: handlers updated independently produce inconsistent reasoning quality | Medium | Medium | Move prompts to `agents.config` (3.5) so review is centralized. |
| Anthropic rate limit (org-level) hit when multiple agents enabled simultaneously | Low | Medium | Stagger enablement; shared runtime can add a global concurrency semaphore later. |
| Webhook spoofing emits fake `payment.captured` | Low (we HMAC-verify Stripe + BGC) | High | Phase 2 producers must only emit from inside already-verified webhook paths; document this rule in `agent-fleet-runtime.js` header. |
| Orchestrator + cron-emitter both running every minute leaves stale `agent_memory.rate_limit` rows | Low | Low | Add a sweeper in the analyst's nightly metrics job. |

---

## 6. Out of scope for Phase 2 (deferred to Phase 3)

- Multi-step agent workflows (Matchmaker → Concierge handoffs).
- Tool use / function calling — every Phase 2 agent stays read-only LLM + structured output → admin executes.
- Agent-to-agent direct messaging (use the bus).
- Self-improvement / fine-tuning loops.
- Replacing `propose` with `autonomous` for any agent.

---

## 7. Definition of done for Phase 2

1. Items 1–9 in §4 shipped to `replit-updates-production-parity` and live on production.
2. All 6 specialist agents have a real handler, real producer, at least one real action logged in `agent_actions`, and an admin review screen.
3. DLQ has zero entries older than 24h on average over a rolling week.
4. Total daily fleet spend stays under $20 in steady state.
5. `replit.md` Agent Fleet section updated to "Phase 2".

---

## 8. Enablement guardrail checklist (mandatory before any `enabled=true` flip)

Before any future task may flip an agent's `enabled` flag from `false` to `true` in production, **every** condition below must hold. This checklist is the canonical pre-flight: if any item is unmet, the flip is blocked and the task must be re-scoped. (1) The agent's handler endpoint exists at the path declared in `agents.endpoint` and returns 2xx for a synthetic test event emitted via the admin "Emit" button; (2) at least one real producer for each subscribed event type is wired in at a verified file path from §2 above and confirmed by emitting a live event end-to-end during a staging dry-run; (3) the DLQ + retry work in §3.2 is shipped and orchestrator no longer marks events `processed_at` on handler failure; (4) the spend-alerting work in §3.3 is shipped so an admin gets paged when the agent crosses 80% of its daily cap; (5) the agent's daily spend cap is set at or below the seeded value in `supabase/migrations/20260422_agent_fleet.sql` lines 224–257 and has been sanity-checked against the worst-case event volume from §3.4a; (6) `autonomy` remains `propose` for the first 14 days post-enable regardless of agent (Treasurer / Gatekeeper / Matchmaker stay `propose` indefinitely in Phase 2); (7) the autonomy-promotion guardrail from §3.4b is enforced both server-side and in the admin UI; (8) the admin review queue at `/admin/agent-fleet.html` has been smoke-tested for the new agent's `action_type`; and (9) a rollback plan is documented (single-toggle `enabled=false` flip + explanation of which downstream workflows are paused). Skipping any item is a P0 production risk — the spend-cap is the hard backstop, not the only line of defense.
