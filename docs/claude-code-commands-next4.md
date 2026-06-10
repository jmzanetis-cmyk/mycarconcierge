# Claude Code commands — next 4 tasks (in pull order)

Each block below is a **standalone Claude Code prompt**. Copy from the
`# Task #NNN` line down to (and including) the `## Verify` block, paste
into Claude Code as the first message. They're ordered so each one
unblocks the next.

Companion files (read first if you haven't):
- `docs/claude-code-tasks.md` — full original brief list
- `docs/claude-code-progress-report.md` — what's already merged + repo
  changes that affect these prompts

Conventions:
- Repo root: `/home/runner/workspace`
- Smoke tests: `node _smoke-test.js`. Function tests:
  `bash scripts/run-function-tests.sh`. Lint: `npm run lint`.
- Never paste secret values into chat — read from env.
- After any edit to `www/*.js` or `www/*.html` that ships to Android:
  `npm run cap:sync`.
- Don't add commentary or emojis to source files. Match surrounding
  style.

---

# Task #468 — Restore workspace SUPABASE_ANON_KEY

**Why:** Smoke steps 23, 24, 24b-jwt, 24d, 24e, 24f, 31 are silently
skipping because the workspace `SUPABASE_ANON_KEY` secret is truncated.
Every authz test we've shipped (#359/#360/#464/#466/#467 once it lands)
is asserting nothing locally until this is fixed. **No code change** —
this is an env fix. Until it's resolved, briefs #289 and #467 will
also skip.

## Steps
1. Read `_smoke-test.js` and find the string `SUPABASE_ANON_KEY
   misconfigured` (or `Invalid API key`) to confirm the skip path the
   smoke runner takes. Tell the user the file + line so they understand.
2. Tell the human operator:
   > Open Replit → Tools → Secrets. Set `SUPABASE_ANON_KEY` to the
   > project's real anon JWT. It must be a 3-part `eyJ...` JWT,
   > several hundred chars long; the current value is too short.
   > Source it from Supabase dashboard → Project Settings → API →
   > "Project API keys" → `anon public`. The same value already lives
   > in Netlify prod env.
3. **Do NOT print the value back** — it's a public key but treating it
   as a secret keeps Replit's secret-redaction happy.
4. After they confirm it's set, restart the `Start application` workflow
   (Workflows panel → restart) so the new env is picked up.
5. Run `node _smoke-test.js 2>&1 | tee /tmp/smoke.log` and grep for
   `SKIPPED` lines on the JWT-gated steps. Report a clean diff.

## Verify
- `grep -E "STEP 2[34]|STEP 31|SKIPPED.*JWT|SKIPPED.*API key"
  /tmp/smoke.log` shows zero JWT-gated SKIPPED lines.
- All JWT-gated steps print real PASS / FAIL assertions instead of
  the skip message.

## Out of scope
- Don't touch code. If something fails after the secret is fixed,
  triage but don't auto-fix; report the failure and stop.

---

# Task #316 — [LAUNCH 01] Fix admin route safety lockdown test

**Why:** `npm test` fails 1/69 — `netlify/functions/admin-routes-auth.test.js`
says `agent-fleet-admin.js exposes 0 route conditionals but the lockdown
test expects 45`. The Task #264 SonarCloud sweep rewrote the
`Object.assign({}, …)` spreads in `agent-fleet-admin.js`; the test's
detection regex no longer matches. **Fix the test, not the production
file** — the routes are still there.

This unblocks `npm test` as a clean release gate and pairs naturally
with #438 (the matching test-suite cleanup).

## Steps
1. `node netlify/functions/admin-routes-auth.test.js` and capture the
   exact failure message + line.
2. Open the test file and find:
   - The constant `EXPECTED_FLEET_CONDITIONALS` (or similar — the
     number 45 has to live somewhere).
   - The regex it uses to count route conditionals against
     `agent-fleet-admin.js`.
3. Open `netlify/functions/agent-fleet-admin.js`. Find the new
   route-handler shape introduced by #264 — likely a route-map object,
   destructured-spread, or `{ ...routeBase, handler }` pattern. Use
   `rg -n "route|action|path" netlify/functions/agent-fleet-admin.js |
   head -60` to see the structure quickly.
4. Two valid fixes — pick whichever is simpler for the actual code
   shape:
   - **(a)** Extend the regex to recognise both the old `Object.assign`
     spread AND the new shape. Update `EXPECTED_FLEET_CONDITIONALS` to
     the true count.
   - **(b)** Replace the regex with an AST count — parse with `acorn`
     (already a dep) and walk the `Program`'s top-level
     `ExpressionStatement`s / object literals. AST is more durable.
5. Make sure the assertion message in the test still surfaces the
   actual count alongside the expected — so a future refactor that
   drops a route fails loudly with a useful number, not a regex miss.
6. `npm test` — expect 69/69 green.

## Verify
- `npm test` exits 0.
- The assertion error path was *intentionally* triggered once (e.g.
  comment out one route, re-run, see clear failure with real count)
  before reverting.

## Out of scope
- Do not modify `agent-fleet-admin.js` itself.
- Do not lower `EXPECTED_FLEET_CONDITIONALS` without first confirming
  the actual route count.

---

# Task #438 — Fix the pre-existing failing self-bid test

**Why:** `netlify/functions-tests/plan-bids-self-bid.test.js` was already
red before any recent task. Blocks `bash scripts/run-function-tests.sh`
as a release gate (currently ~27/28; should be 28/28). Pair with
#316 to land "all tests pass" cleanly.

## Steps
1. `node netlify/functions-tests/plan-bids-self-bid.test.js 2>&1 |
   head -80` — capture the exact failure.
2. Triage in order (likely root causes):
   - Test stubs are stale vs. current handler signature. Read
     `netlify/functions/plan-bids.js` (or whichever handler the test
     targets) and diff against what the stub provides.
   - Handler now requires a column the stub Supabase chain doesn't
     return — add it to the stub.
   - Auth wrapper changed: the stub JWT or the `Authorization` header
     shape is rejected. Check what `parseSupabaseUser` /
     `requireAuthedUser` (whichever the handler uses) actually
     destructures.
3. **Fix the underlying code or the test honestly — do NOT delete or
   skip the test.** The whole point is the self-bid guard stays caught
   on prod regression.
4. If the production handler has genuinely drifted such that
   self-bidding is no longer blocked, **fix the handler first** then
   re-confirm the test passes against the corrected behaviour. (Read
   the assertion text aloud — if your "fix" weakens it, redo.)
5. `bash scripts/run-function-tests.sh` — expect 28/28 green. Also
   re-run `npm test` to confirm nothing else regressed.

## Verify
- `bash scripts/run-function-tests.sh` → 28/28 pass.
- The original self-bid assertion (member cannot bid on their own
  package) still appears in the test, unweakened.
- `npm test` still passes (assuming #316 already landed).

## Out of scope
- Don't refactor unrelated tests.
- Don't add `test.skip()` — fix it or stop and report.

---

# Task #289 — [LAUNCH 06] RLS proof: providers can't dismiss other providers' alerts

**Why:** Task #204 only proved the happy path of `provider_alerts`
dismissal. There's no regression test that proves the RLS policy
actually blocks Provider A from updating Provider B's row. A silent
RLS regression would let one provider dismiss another's compliance
warnings.

**Template available:** `netlify/functions-tests/bgc-rls.test.js`
(landed in Task #375) is the exact pattern you should copy — real
behavioural Postgres test against `$DATABASE_URL`, isolated schema,
falls back to static migration scan when no DB. Read it first.

## Steps
1. **Read these in parallel** before writing anything:
   - `netlify/functions-tests/bgc-rls.test.js` — template
   - `tests/bgc-alerts-banner.spec.js` — existing happy-path coverage
   - `www/bgc-compliance.js` → `dismissAlert` — the exact update shape
     to test (find: `from('provider_alerts').update({ is_dismissed:
     true })`)
   - Whichever migration file created `provider_alerts` and its RLS
     policies: `rg -l "create.*table.*provider_alerts|policy.*provider_alerts"
     supabase/migrations/`
2. Create `netlify/functions-tests/provider-alerts-rls.test.js`.
   Behavioural half (the part that actually proves the invariant):
   - Spin up an isolated schema via `$DATABASE_URL` like
     `bgc-rls.test.js` does. Reproduce `provider_alerts` table + every
     RLS policy on it.
   - Use the `pg` driver. `SET LOCAL ROLE authenticated`. Use
     `set_config('request.jwt.claim.sub', '<providerA_uuid>', true)`.
   - Insert two alerts via service role: one for Provider A, one for
     Provider B (both `is_dismissed = false`).
   - As Provider A (authenticated role), run
     `UPDATE provider_alerts SET is_dismissed = true WHERE id =
     <B_alert_id>` — assert it either errors with permission_denied
     OR returns 0 affected rows. Re-read with service role to confirm
     B's row is still `is_dismissed = false`.
   - As Provider A, `UPDATE … WHERE id = <A_alert_id>` — assert it
     succeeds, then re-read and confirm `is_dismissed = true`.
   - Repeat for the `anon` role: should be rejected entirely.
3. Static-scan half (always runs, no DB needed): walk
   `supabase/migrations/*.sql` and assert at least one RLS policy on
   `provider_alerts` references `auth.uid()` (the provider-ownership
   join). Fail loudly if a future migration drops or replaces the
   policy without an equivalent.
4. Skip cleanly when `DATABASE_URL` isn't reachable — print a clear
   "skipped: no DB" message so CI can't silently pass with zero real
   coverage. (Copy the skip pattern from `bgc-rls.test.js`.)
5. Cleanup: `DROP SCHEMA ... CASCADE` in `finally`. Delete any seeded
   `auth.users` rows (none, if you stay in the isolated schema —
   prefer that path).
6. Run: `node netlify/functions-tests/provider-alerts-rls.test.js` —
   all tests should pass against the current prod schema. If the RLS
   policy is broken right now, the test should fail loudly so it can
   be tightened before launch.
7. `bash scripts/run-function-tests.sh` — confirm the new test is
   auto-discovered and the suite stays green.

## Verify
- New test file passes locally.
- The test would fail if you commented out the
  `WITH CHECK (provider_id = auth.uid())` half of the policy — try it
  once in your local schema setup to confirm the assertion bites.
- Static-scan half catches "future migration removes the policy" —
  manually delete the policy from your reproduced DDL temporarily to
  confirm.
- `bash scripts/run-function-tests.sh` picks up the new file (it
  globs `*.test.js`).

## Out of scope
- Don't modify production migrations or RLS policies — this task only
  *proves* the existing policy holds. If you find a real bug, file a
  separate task (Replit will surface it as a follow-up).
- Don't add Playwright browser coverage; node-based supabase-js +
  pg is faster and the brief specifies that.

---

## Suggested execution order

Run them in the order they're listed (this is the unblock chain):

1. **#468** first — it's the operator-action prerequisite. Without
   the real anon key, the new test in #289 will skip the supabase-js
   half of its coverage. (The behavioural pg test still works without
   it, so #289 isn't *fully* blocked, but #467 and the rest of the
   smoke gate are.)
2. **#316** → **#438** in either order. Both small. Once both land,
   `npm test` and `bash scripts/run-function-tests.sh` are both clean
   release gates.
3. **#289** last — it's the most substantive of the four. Saving it
   for after the cheap test-suite cleanups means the new test lands
   into an already-green suite, so you'll immediately see if it
   regresses anything.
