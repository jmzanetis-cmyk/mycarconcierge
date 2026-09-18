## Queued 2026-07-14 (Cowork session)
- RENAME (Batch 2, copy-only): "Care Plans" → "Service Requests" across member UI
  (nav label members.html:1108 area, section heading, empty states, i18n keys
  member.carePlans*). Badge on the nav item should show pending-bid count
  (care-plans-count badge already exists — verify it counts bids, not plans).
  Internal care_plans naming (tables/functions/routes) unchanged.
- Job-board card countdown math wrong ("2h 26m left" vs actual 45h; check
  job-board.html countdown vs bid_closes_at parsing/timezone).
- Bid modal renders "$$2–$5" (doubled dollar sign) in the within-estimate note.
- NAV TAXONOMY (goes with the Service Requests rename): "Care Plans" and
  "Maintenance Packages" coexist in member nav and confuse. Packages purchase
  is disabled (orphaned escrow); existing packages only display. Proposal:
  rename Care Plans -> "Service Requests"; hide "Maintenance Packages" nav for
  members with zero packages, or fold read-only packages under Service
  History/Order History. Decide in Batch 2.
- Member bid card shows generic "Provider" label instead of provider
  business_name (post FK-fix stitch reaches API but the renderer may read a
  different field) — members-care-plans.js bid render vs bid.provider shape.
- PAYMENT UX (design, member accept flow): move card authorization into a
  dedicated payment modal instead of inline in the Accepted Bid panel; and fix
  state ordering — bid renders "Accepted" before authorization completes.
  Desired: accept -> payment modal -> on authorize success mark accepted;
  on abandon, auto-revert bid to pending after timeout (avoid stuck
  "Awaiting Payment" plans with committed providers). Jordan 2026-07-16.

## Queued 2026-09-18 (Tier-0.5 RLS sweep)
- anthropic-health.test.js has two bugs (surfaced during Task #472 npm test):
  (1) completeness check depends on the `rg` (ripgrep) CLI being installed and
  falls back to a broken grep path when it isn't, and (2) the test exits with
  code 0 even when its assertions throw (async-error propagation missing —
  probably needs the top-level to be wrapped in try/catch + process.exit(1)).
  As a result the test can silently pass CI on any machine without rg. Also
  the current assertion flags the filename `docs/claude-code-tasks.md` as a
  "missing claude-* model literal" — the grep pattern needs to scope out
  non-JS/HTML paths (or the filename regex needs to require a word boundary
  after `claude-`). Fix both while you're in there.
