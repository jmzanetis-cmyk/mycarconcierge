# Gatekeeper Enablement Runbook (Task #126)

> Supervised production rollout for the Gatekeeper review agent.
> Owner: ops/admin. Estimated time on the operator's clock: ~5 minutes
> active, then 24h passive observation.

## What this turns on

The Gatekeeper agent reviews provider lifecycle events and **proposes**
approve / reject / manual_review with reasoning. It never mutates provider
state directly — every proposal lands in the admin review queue at
`/admin/agent-fleet.html` for human action via the Apply / Suspend buttons
that shipped with Task #127.

Subscribed input events (all already wired, see Task #123):

| Event                    | Producer                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `provider.applied`       | DB trigger `profile_provider_applied_emit` on `profiles` (role → `pending_provider`)      |
| `provider.flagged`       | DB trigger `profile_provider_flagged_emit` on `profiles` (role → `suspended`)             |
| `provider.bgc_completed` | `netlify/functions/background-check-webhook.js` (after BGC.com webhook signature verify)  |

Daily spend cap: **$3.00**. Autonomy: **`propose`** (locked here for 14
days minimum per `docs/agent-fleet-phase-2.md` §8 item 6).

## Pre-flight checklist

Verify in `/admin/agent-fleet.html` (admin password required):

- [ ] DLQ panel is visible and shows zero open entries (Task #122)
- [ ] Spend Alerts section renders without error (Task #122)
- [ ] Gatekeeper row currently shows `enabled=false` (otherwise this
      runbook is a no-op — skip to "24h observation")
- [ ] Agent prompt panel for `gatekeeper` shows an active version
      (Task #128)
- [ ] Review queue Apply / Suspend buttons render on at least one prior
      proposed action (Task #127) — if no prior actions exist, skip

If any item fails, stop and fix that item before proceeding.

## Step 1 — Flip the registry bit

Two equivalent options. Pick whichever is faster.

**Option A — Supabase SQL Editor (canonical):** open the SQL editor
against the production project and paste the contents of
`supabase/migrations/20260424_enable_gatekeeper.sql`:

```sql
UPDATE public.agents
   SET enabled  = true,
       autonomy = 'propose'
 WHERE slug = 'gatekeeper';
```

Hit Run. Should report `1 row affected`.

**Option B — admin UI toggle:** at `/admin/agent-fleet.html`, find the
Gatekeeper row, flip the Enabled switch to ON. The page calls
`PUT /api/admin/agent-fleet/agents/gatekeeper` with
`{ "enabled": true }`. Same effect, no SQL paste required.

## Step 2 — Run the smoke test

From a shell with the production env vars loaded:

```bash
SITE_URL=https://mycarconcierge.com \
ADMIN_PASSWORD=...                  \
SUPABASE_URL=...                    \
SUPABASE_SERVICE_ROLE_KEY=...       \
  node scripts/gatekeeper-enable-smoke.js
```

The script will:

1. Verify the registry row reads `enabled=true`, `autonomy=propose`,
   `daily_spend_cap_usd ≤ 3.00`, the three subscribed event types are
   present, and `endpoint` is set.
2. Check today's spend headroom (`agent_daily_spend.reserved_usd +
   actual_usd < $3`).
3. Fire one synthetic `provider.applied`, `provider.bgc_completed`, and
   `provider.flagged` event (all marked `__smoke=true` in the payload so
   they are visually distinguishable in the queue from real events).
4. Force an orchestrator tick (`POST /run/orchestrator`) so dispatch
   happens immediately rather than waiting up to a minute for the cron.
5. Poll `agent_actions` for proposed rows linked to each emitted
   `event_id` (60s timeout per event).
6. Print a summary table of `event_type → action_id, status,
   recommendation, confidence, cost_usd, ms` and re-check the spend
   headroom.

Exit codes:

- `0` — every event produced a `status='proposed'` action with a
  recommendation; rollout is healthy.
- `1` — at least one check failed; see the FAIL lines and the
  Rollback section below.
- `2` — env or transport error before the smoke could run.

## Step 3 — Spot-check the admin queue

Open `/admin/agent-fleet.html` → Review Queue. You should see three
rows from the smoke run, each tagged `agent_slug=gatekeeper`,
`status=proposed`, with a recommendation and a 2–3 sentence reasoning.
Dismiss them via the queue's Dismiss button (they are synthetic and
should not be applied to real providers).

## 24h observation window

Leave the agent on for one full day and watch:

- **Spend** — `/admin/agent-fleet.html` → Today's Spend should stay
  well under the $3.00 cap. The spend-cap alert email (Task #122)
  fires at 80% of cap — if you receive one, treat it as an incident
  and roll back.
- **DLQ** — open dead-letter entries should remain at zero. Any
  Gatekeeper entry means the handler is failing on a real event;
  inspect via `/admin/agent-fleet.html` → Dead Letters and replay
  after the underlying cause is fixed.
- **Recommendations** — sample 2–3 real proposals (apply some, suspend
  some, dismiss some) to confirm reasoning quality. Apply / Suspend
  uses the Task #127 endpoints, which are server-gated.

## Rollback

If anything looks off — runaway cost, low-quality recommendations,
unexpected handler errors — flip Gatekeeper back off. Same two options
as Step 1, just with `enabled=false`:

```sql
UPDATE public.agents
   SET enabled = false
 WHERE slug = 'gatekeeper';
```

Or untoggle the switch in `/admin/agent-fleet.html`. The orchestrator
checks `enabled` on every dispatch attempt, so the next tick (≤60s)
will stop routing events to Gatekeeper. Already-queued events fall
through to the next-best handler or are marked unrouted (and
land in `agent_dead_letter` if they have no handler at all).

Pausing Gatekeeper does **not** stop the producers — applications,
suspensions, and BGC results still flow through normally; they just
won't be auto-reviewed by an agent. Admins continue handling them
manually via the existing provider admin UI.

## Done criteria (mirrors `.local/tasks/task-126.md`)

- [x] Registry row shows `enabled=true`, `autonomy=propose`, cap=$3
- [x] Smoke test exits 0; one proposed action per event type with a
      coherent recommendation
- [ ] After 24h: today's `agent_daily_spend.actual_usd` for gatekeeper
      < $3.00 and no spend-cap alert email was sent

The first two are completed by running this runbook. The third is the
24h observation gate — record the value in the task close-out comment
and only then mark Task #126 complete in your tracker.
