-- ============================================================================
-- 20260910 — club_memberships: enforce one active Car Club per member.
--
-- Jordan: members should only be able to belong to one Car Club at a time.
-- Verified before writing this that the rule didn't already exist anywhere:
-- club_memberships' only constraint is UNIQUE (club_id, member_id) — it
-- dedupes rows within a single club, it never limited how many distinct
-- clubs one member_id could hold active rows in. joinClub()
-- (netlify/functions/car-clubs.js) only ever checked for an existing row in
-- the club being joined, never queried for the member's OTHER active
-- memberships. listMyClubs()/reward code were already written to handle N
-- memberships per member (arrays, not a single object) — multi-club was
-- architected in, not just an oversight — so this is a real behavior
-- change, not a bug fix for an accidental gap.
--
-- "One active club at a time" (not "one club ever") to match the existing
-- leave/rejoin semantics already used for a single club: leaveClub() only
-- ever soft-deletes (is_active=false, never a DELETE, per plan §3.3's
-- ledger-preservation rule), and joinClub() already reactivates a prior
-- inactive row for the SAME club rather than erroring. Extending that same
-- is_active toggle across clubs — leave your current club, then join a
-- different one — is the natural, consistent interpretation.
--
-- Cannot query production directly from this session (no network egress to
-- Supabase from the sandboxed shell this migration was authored in — see
-- prior migrations in this repo for the same limitation), so unlike
-- 20260717b's confirmed-clean pre-check, this migration defensively
-- deactivates any pre-existing extra active memberships FIRST rather than
-- assuming none exist: if a member already has more than one active
-- membership today, only their most-recently-joined one is left active
-- (their other membership rows are preserved, just soft-deleted, same as a
-- normal leave — no data is destroyed and no ledger/points history is
-- touched). This makes the index safe to apply regardless of current data
-- state, and idempotent to re-run.
--
-- Application-layer half of this fix (netlify/functions/car-clubs.js
-- joinClub()): pre-checks for another active membership and returns a
-- friendly 409 before attempting the join, AND catches this index's 23505
-- violation as the same friendly 409 — the pre-check alone can't fully
-- close the race between two concurrent join requests to different clubs,
-- so this index is the actual guarantee, same pattern as 20260717b's
-- wallet_ledger_load_ref_unique / stripe-webhook.js's 23505 handling.
-- ============================================================================
BEGIN;

-- Defensive dedup: if a member somehow already has 2+ active memberships,
-- keep only the most recently joined one active. Ties broken by id so the
-- choice is deterministic. No rows are deleted — this mirrors a normal
-- leaveClub() call (is_active=false), which preserves reward/ledger history.
UPDATE club_memberships cm
SET is_active = false
WHERE cm.is_active = true
  AND cm.id NOT IN (
    SELECT DISTINCT ON (member_id) id
    FROM club_memberships
    WHERE is_active = true
    ORDER BY member_id, joined_at DESC, id DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS club_memberships_one_active_per_member
  ON club_memberships (member_id)
  WHERE is_active = true;

COMMIT;
