-- ============================================================================
-- 20260904b_provider_call_prospects_screening_fields.sql
-- ----------------------------------------------------------------------------
-- Adds the discovery/screening portion of the call-script survey to
-- provider_call_prospects. The 2026-09-04 migration (20260904_provider_call_
-- prospects.sql) only captured the closing/pricing questions (B1-B3, R3, C2,
-- bid pack, what they said) because those were the only ones with columns in
-- Jordan's tracking spreadsheet (MCC_National_Call_List.xlsx). The actual
-- call script (MCC_Call_Worksheets_<City>.docx) has a full screening section
-- — S1, P1-P7, L1 — plus R1/R2 (gut reaction / first objection), C1
-- (referral), and a 1-5 interest rating, none of which had anywhere to live
-- except the paper worksheet. This migration adds all of it so a caller's
-- entire call — not just the back half — is captured in one place.
--
-- Question text (for reference, read live off the worksheet during the
-- call, not stored here):
--   S1  Do you do any work at the customer's home or office, or is
--       everything at the shop?
--   P1  How do new customers find you right now?
--   P2  Walk me through what happens from the first call to the job being
--       done.  (probe: where do you lose jobs in that? what's annoying?)
--   P3  Last time you wanted more work coming in, what did you actually
--       do?  (probe: did it work? what did it cost?)
--   P4  Have you ever paid for leads — Yelp, Angi, Thumbtack, anything
--       like that? How'd it go?  (P4b: which platform(s))
--   P5  What kind of job or customer do you wish you got more of?
--       (probe: and which ones aren't worth your time?)
--   P6  Roughly what do you spend a month trying to get new customers?
--   P7  When in the week are you slowest?
--   L1  Does the local regulatory cycle show up in your workload at all,
--       or is it too spread out to notice? (market-specific, skippable)
--   R1  First thing that comes to mind? (their words, verbatim)
--   R2  What's the first thing that worries you about it? (verbatim)
--   C1  Who else around here should I be calling? (name + shop + number)
--   Interest 1-5, captured at wrap-up alongside Outcome.
--
-- Apply manually via the Supabase SQL Editor, same as every migration here.
-- Idempotent via ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ============================================================================

ALTER TABLE provider_call_prospects
  -- Screen + Core (5 min · past behaviour only, never "would you")
  ADD COLUMN IF NOT EXISTS s1_operating_model     text,     -- S1: mobile / shop / both
  ADD COLUMN IF NOT EXISTS p1_how_found           text,     -- P1: how new customers find them today
  ADD COLUMN IF NOT EXISTS p2_booking_process     text,     -- P2: first call -> job done
  ADD COLUMN IF NOT EXISTS p2_where_lose_jobs     text,     -- P2 probe: where they lose jobs / what's annoying
  ADD COLUMN IF NOT EXISTS p3_growth_attempts     text,     -- P3: what they tried last time they wanted more work
  ADD COLUMN IF NOT EXISTS p3_attempt_cost        text,     -- P3 probe: did it work, what did it cost
  ADD COLUMN IF NOT EXISTS p4_platform_experience text,     -- P4: paid-lead-platform experience (Yelp/Angi/Thumbtack)
  ADD COLUMN IF NOT EXISTS p4b_which_platforms    text,     -- P4b: which platform(s)
  ADD COLUMN IF NOT EXISTS p5_ideal_customer      text,     -- P5: job/customer type they want more of
  ADD COLUMN IF NOT EXISTS p5_not_worth_time      text,     -- P5 probe: which jobs aren't worth their time
  ADD COLUMN IF NOT EXISTS p6_monthly_spend       text,     -- P6: monthly spend trying to get new customers
  ADD COLUMN IF NOT EXISTS p7_slowest_time        text,     -- P7: slowest time of week
  ADD COLUMN IF NOT EXISTS l1_regulatory_impact   text,     -- L1: does the local regulatory cycle show up in workload
  ADD COLUMN IF NOT EXISTS l1_detail              text,     -- L1 detail: "describe" when Big effect is selected
  -- Describe + reaction (read once, word for word — then listen)
  ADD COLUMN IF NOT EXISTS r1_first_reaction      text,     -- R1: first thing that comes to mind (verbatim)
  ADD COLUMN IF NOT EXISTS r2_first_worry         text,     -- R2: first thing that worries them (verbatim)
  -- Close
  ADD COLUMN IF NOT EXISTS c1_referral            text,     -- C1: who else should Maria call (name + shop + number)
  ADD COLUMN IF NOT EXISTS interest_rating        integer CHECK (interest_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS bid_pack_decline_reason text;    -- why not, when Bid pack pitched = No
