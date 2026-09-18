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
- anthropic-health.test.js needs two changes (surfaced when commit 6fa9513
  landed a comment in netlify/functions/car-clubs.js that referenced the
  filename of the CC task-briefs doc; the test's claude-* scan of
  netlify/functions/ picked up "claude-code-tasks" as a would-be model
  literal, npm test exited 1, and Netlify's build command failed the deploy):
  (1) scope the scan to string literals in code, not comments — the correct
  contract is "flag any `claude-*` model id passed to the Anthropic SDK",
  not "flag any occurrence of the substring in the source tree"; and
  (2) make the test exit non-zero on assertion failure (currently the
  assertion throws inside an async top-level and the process still exits 0,
  which would let a real regression slip past `npm test` on any machine
  where the scan still finds legit literals). Fix both together.
