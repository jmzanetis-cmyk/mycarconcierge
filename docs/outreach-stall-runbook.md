# Outreach Engine Stall Runbook

This runbook covers the two stall classes Task #306 was opened for:

1. **Apollo discovery stalled** — daily report shows "Last successful pull: Never" or 3+ consecutive zero-result cycles.
2. **Outreach queue stuck** — daily report shows a large `approved` queue (e.g. 1,000+) but very few `sent_today`.

Both have a single owner: the AI Outreach Engine (`netlify/functions/outreach-engine-core.js`), driven by two Netlify scheduled functions:

| Cron | Function | Cadence |
| --- | --- | --- |
| Apollo discovery | `apollo-discovery-scheduled.js` → `runApolloDiscoveryCycle` | every 6 h |
| Outreach cycle  | `outreach-cycle.js` → `outreach-cycle-background.js` → `runEngineCycle` | every 15 min |
| Daily digest    | `daily-digest-scheduled.js` | 8:00 PM ET |

The daily digest is the canonical observability surface — it now reports both stall classes in the email subject, narrative, and SMS.

---

## 1. Diagnose first

Run the read-only diagnostic against prod Supabase from the dev environment:

```bash
node scripts/diagnose-apollo-and-queue.js
```

This prints `engine_state.id=1` (including `apollo_config`), the last 20 Apollo cycle log entries, message status counts, and recent send-failure activity. **No mutations.** The script is safe to run any time.

---

## 2. Apollo discovery stalled

### Symptoms

- Daily digest subject contains `⚠️ Apollo stalled (Nx zero)` or `Apollo stale (Nh since last pull)`.
- Diagnostic shows recent `apollo_discovery_cycle` rows with `search_results: 0` across multiple cities/profiles.
- `last_successful_run` is missing or older than ~24h.

### Triage decision tree

| Last cycle's `error_kind` | Most likely cause | Fix |
| --- | --- | --- |
| `auth_error` (401/403) | `APOLLO_API_KEY` rotated, revoked, or unset on Netlify | Re-set `APOLLO_API_KEY` in Netlify env, then trigger `Run now` from admin Marketing → Outreach |
| `payment_required` (402) | Apollo balance hit zero | Top up Apollo credits, then `Run now` |
| `rate_limit` (429) | Too aggressive `interval_hours` × `per_page` | Lower `per_page` (e.g. 25 → 10) or raise `interval_hours` in admin |
| `server_error` (5xx) | Apollo upstream blip | Wait one cycle (6h). Self-heals. |
| `network_error` | Egress / DNS issue from Netlify | Check Netlify status; usually transient |
| `no_results` (200 OK + `people:[]`) | **Almost always silent credit exhaustion.** Apollo returns 200 with an empty array instead of 402 once credits are gone. | Top up Apollo credits, then `Run now` |
| missing / `unknown_error` | Cycle threw before classification | `netlify functions:log apollo-discovery-scheduled --filter error` |

The 8-cycle stall this runbook was written against was a textbook **`no_results` silent credit exhaustion** — every cycle hit a different city/profile and got 0 results back. Pre-credit-exhaustion, every cycle returned exactly 25 results (the configured `per_page`).

### Recovery

```bash
# 1. Confirm credits / API key — Apollo dashboard
# 2. Force a single cycle (admin password required)
curl -X POST https://mycarconcierge.com/api/apollo/run-now \
  -H "x-admin-password: $ADMIN_PASSWORD"
# 3. Re-run diagnostic — search_results should be > 0
node scripts/diagnose-apollo-and-queue.js
```

If `search_results > 0` returns, `last_successful_run` will be persisted and the next daily digest will flip to `Healthy`.

---

## 3. Outreach queue stuck (lots of approved, few sent)

### Symptoms

- Daily digest subject contains `⚠️ Queue stalled (N)`.
- Diagnostic shows `message_counts.approved >> message_counts.sent_today`.
- `engine_state.is_running = true` and `auto_send = true` (engine is NOT paused).
- `outreach_activity_rows_24h > 0` (cycles ARE firing).

### Why this is possible even when nothing looks broken

`runEngineCycle`'s queue-flush picks the **oldest 15 approved messages** every cycle (`order created_at asc, limit 15`). Pre–Task #306, `sendMessage` early-returned without any DB update for these permanent dead-end conditions:

- Lead status is `unsubscribed` / `bounced` / `contacted` / `responded` / `converted`
- Lead has no email (for an email-channel message) or no phone (for SMS)
- Lead row was deleted (orphan message)
- `crm_sync_status = 'duplicate'`

Result: if the head of the queue had ≥15 dead messages, every cycle picked those same 15, returned errors, never advanced. The queue could not drain even though hundreds of valid messages were sitting behind them.

### Post–Task #306 behavior

`sendMessage` now calls `markMessageSkipped(...)` for those conditions, flipping the message to `status='skipped'` and writing a `send_skipped` row to `outreach_activity_log` with the reason. The queue-flush also now peeks 60 messages instead of 15, so a cluster of skips can't permanently block the 15-send budget.

This means the stall scenario should be self-healing on the next cycle. If you ever see it recur, the diagnostic will identify it:

```bash
node scripts/diagnose-apollo-and-queue.js
# Look for: ALL_1084_by_lead_status_and_contact
# Reasons that look like "lead_contacted", "no_email", "lead_unsubscribed" → expected to be skipped within ~1 cycle now
```

### Manual purge of legacy stuck messages (one-time cleanup)

If for any reason there are still legacy `approved` rows whose leads are dead and you want them gone immediately rather than waiting for the cycle to skip them, run this one-shot SQL in Supabase SQL Editor:

```sql
UPDATE outreach_messages m
SET status = 'skipped'
FROM outreach_leads l
WHERE m.lead_id = l.id
  AND m.status = 'approved'
  AND (
    l.status IN ('unsubscribed', 'bounced', 'contacted', 'responded', 'converted', 'dead')
    OR (m.channel = 'email' AND l.email IS NULL)
    OR (m.channel = 'sms'   AND l.phone IS NULL)
    OR l.crm_sync_status = 'duplicate'
  );
```

This is a backfill of what the new `sendMessage` would do anyway — fully idempotent. After running it, the next cycle will start sending the genuinely-sendable backlog at up to 15 per cycle (96 cycles/day × 15 = 1,440/day theoretical, capped at `MAX_DAILY_SENDS=500`).

---

## 4. Engine paused (`engine_paused`)

If the cycle's first action returns `{ skipped: true, reason: 'engine_paused' }` (`outreach-cycle.js:17`), `engine_state.is_running` is `false`. Re-enable from admin Marketing → Outreach (toggle "Engine running") or:

```sql
UPDATE engine_state
SET is_running = true, paused_at = NULL, paused_by = NULL, pause_reason = NULL
WHERE id = 1;
```

The cycle resumes within 15 minutes.

---

## 5. Reference

- **Diagnostic script:** `scripts/diagnose-apollo-and-queue.js`
- **Regression tests:**
  - `scripts/queue-flush-skip-test.js` — unit-level: verifies `sendMessage` marks dead-end messages `skipped` instead of leaving them stuck `approved`
  - `tests/outreach-engine-paused-digest.spec.js` — Playwright: verifies the `engine_paused` signal contract that the daily digest depends on (pause → cycle returns `{skipped:true, reason:'engine_paused'}` → diagnostics block reflects it)
- **Admin diagnostics:** the Outreach admin panel's engine card now renders a "Diagnostics" strip with `is_running`, last skip reason, last Resend/Twilio error, and an Apollo credit-exhaustion warning chip when `apollo_config.likely_credit_exhaustion_at` is set (auto-flagged after 5+ consecutive zero cycles).
- **Concurrency test:** `scripts/apollo-lock-test.js`
- **Code paths:**
  - Apollo cycle: `outreach-engine-core.js` → `runApolloDiscoveryCycle`
  - Outreach cycle: `outreach-engine-core.js` → `runEngineCycle` (queue-flush starts ~line 1430)
  - Send + skip: `outreach-engine-core.js` → `sendMessage`, `markMessageSkipped`
  - Digest health: `daily-digest-scheduled.js` → `getApolloHealth`, queue-health probe inside `handler`
