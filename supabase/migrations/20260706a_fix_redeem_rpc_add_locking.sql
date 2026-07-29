-- ============================================================================
-- 20260706a — Rewrite redeem_reward_for_member (3-param) with locking +
-- voucher-first write ordering + STRUCTURED RETURN (status + voucher_code)
-- (2026-07-06 amendment supersedes the earlier RETURNS text version).
--
-- Design decision — structured return replaces both RAISE-with-string-message
-- and RAISE-with-SQLSTATE approaches:
--   • Message matching in the handler was brittle: a future wording edit in
--     any RAISE silently breaks the handler's error mapping (same implicit-
--     dependency class we've been avoiding across Slice 1 + Slice 2).
--   • SQLSTATE codes (custom class 'MC') were investigated as the next
--     approach; on inspection the propagation from user-defined SQLSTATE
--     through PostgREST to supabase-js error.code is not reliable enough for
--     production error-routing. Rejected.
--   • Structured return: expected business outcomes (member not in club,
--     reward missing, out of stock, insufficient balance, success) are
--     RETURNED as a status enum in the result row. RAISE EXCEPTION is
--     reserved for genuine unexpected DB failures (a missing table, an FK
--     violation from schema drift). That's correct exception hygiene.
--
-- Three problems in the original 20260703h:366-391 body remain fixed:
--
-- (A) CONCURRENCY (money-path bug): the original 3-param variant dropped
--     the FOR UPDATE clause its 2-param sibling (20260703h:189) uses. Two
--     concurrent redemptions for the same (club, member) could both read
--     v_balance = 50, both pass v_balance < point_cost with cost = 30, and
--     both INSERT -30 delta_points — balance ends at -10. Same shape for
--     inventory racing negative. Fixed by pg_advisory_xact_lock on
--     (club, member) + FOR UPDATE on the reward row (Steps 2 + 3 below).
--
-- (B) WRITE ORDERING: ledger deduction came before voucher insert.
--     Voucher-first ordering minimizes the "would-have-been-written" set
--     and makes the invariant easier to reason about: ledger deduction is
--     the LAST write, so it cannot exist without every prior step having
--     succeeded (Step 6 below).
--
-- (C) RETURN SHAPE (superseded by this amendment): originally returned
--     uuid; the earlier revision returned text. THIS revision returns a
--     single-row table (status text, voucher_code text) so callers can
--     distinguish business outcomes without message matching or SQLSTATE
--     inspection.
--
-- ============================================================================
-- ATOMIC GUARANTEES PRESERVED (walk-through inline in the body):
--
--   1. Advisory transaction lock (Step 2) — pg_advisory_xact_lock on
--      hashtext(club_id) + hashtext(member_id). Auto-releases on commit
--      AND on rollback, so a crashed transaction cannot leak the lock.
--   2. Balance re-computed AFTER the lock (Step 5's SUM(delta_points)) —
--      same-member concurrent redemptions serialize on the advisory lock,
--      so the SUM reflects any just-committed deductions.
--   3. Membership check (Step 1) — via is_club_member() SECURITY DEFINER
--      helper that SELECTs from club_memberships with is_active = true.
--   4. Write order (Step 6): voucher INSERT (6b) → inventory UPDATE (6c) →
--      ledger deduction INSERT (6d). Ledger deduction is LAST. Points
--      cannot be deducted without a matching voucher already existing.
--      All three writes are inside the same plpgsql transaction — a
--      genuine DB failure on any one rolls back the others.
--
-- The RETURN NEXT statements for expected outcomes do NOT commit
-- intermediate state — plpgsql function body = one implicit transaction
-- from PostgREST's perspective. Writes commit only when the function
-- returns and the enclosing transaction commits.
-- ============================================================================
-- SIGNATURE CHANGE REQUIRES DROP FUNCTION.
--
-- Return type changes from text → TABLE(status text, voucher_code text).
-- CREATE OR REPLACE FUNCTION cannot change return type; DROP first.
-- IF EXISTS makes the DROP idempotent on fresh replay.
--
-- Both live JS callers (car-clubs.js:518 /redeem, car-clubs.js:847
-- redeemReward) receive `data` as a rowset now, not a scalar. Callers
-- read data[0].status + data[0].voucher_code. The proposed /redeem
-- handler in this same commit (`redeemFromBody`) does this correctly.
-- The pre-existing `redeemReward` at :847 will return the redemption
-- uuid variable (`rid`) which is now UNDEFINED — it needs a follow-up
-- rewrite (separate commit) to consume the new shape. That is NOT part
-- of this migration; it's a JS-side fix.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.redeem_reward_for_member(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.redeem_reward_for_member(
  p_club_id   uuid,
  p_reward_id uuid,
  p_member_id uuid
)
RETURNS TABLE(status text, voucher_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r         public.club_rewards%ROWTYPE;
  v_balance int;
  v_code    text;
  v_rid     uuid;
BEGIN
  -- Step 1: membership check (fast reject before taking any locks).
  -- Reads via SECURITY DEFINER helper is_club_member which SELECTs from
  -- club_memberships with is_active = true guard. No writes yet.
  IF NOT public.is_club_member(p_club_id, p_member_id) THEN
    status := 'not_member';
    voucher_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Step 2: advisory transaction lock on (club_id, member_id) — balance-race
  -- defense. Any concurrent invocation with the same (club_id, member_id)
  -- blocks here until we commit or rollback. Transaction-scoped variant
  -- auto-releases on commit AND on rollback.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_club_id::text),
    hashtext(p_member_id::text)
  );

  -- Step 3: lock the reward row for the transaction. FOR UPDATE serializes
  -- inventory decrements per reward. WHERE club_id = p_club_id also
  -- enforces reward-ownership: blocks cross-club redemption attempts
  -- (member of club A trying to redeem a reward from club B).
  SELECT * INTO r
    FROM public.club_rewards
    WHERE id = p_reward_id
      AND club_id = p_club_id
      AND active = true
    FOR UPDATE;

  IF NOT FOUND THEN
    status := 'no_reward';
    voucher_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Step 4: inventory guard (under the row lock).
  IF r.inventory_qty IS NOT NULL AND r.inventory_qty <= 0 THEN
    status := 'out_of_stock';
    voucher_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Step 5: balance guard (under the advisory lock). Same-member concurrent
  -- redemptions serialize on the advisory lock at Step 2, so the SUM here
  -- reflects any just-committed deductions from any earlier concurrent
  -- call. Guard fires BEFORE any INSERT — no path can drive balance
  -- negative.
  SELECT COALESCE(SUM(delta_points), 0) INTO v_balance
    FROM public.club_points_ledger
    WHERE club_id = p_club_id
      AND member_id = p_member_id;

  IF v_balance < r.point_cost THEN
    status := 'insufficient';
    voucher_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Step 6: all guards passed. Emit three writes in voucher-first order.
  -- Any unexpected exception (genuine DB failure, not a business outcome)
  -- rolls back the whole plpgsql body via the implicit transaction,
  -- releasing both locks automatically.

  -- 6a. Generate voucher_code first (needed by 6b's INSERT).
  v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));

  -- 6b. Voucher row FIRST (invariant: voucher exists before deduction).
  --     Columns verified against 20260703h:138-148 (club_points_redemptions).
  --     status defaults to 'issued' per schema; redeemed_at defaults to now().
  --     Note: the column list uses club_points_redemptions.voucher_code
  --     (table column) — NOT the OUT parameter of the same name. Column
  --     references in an INSERT column list are always target-table columns.
  INSERT INTO public.club_points_redemptions
      (club_id, member_id, reward_id, point_cost, voucher_code)
    VALUES (p_club_id, p_member_id, p_reward_id, r.point_cost, v_code)
    RETURNING id INTO v_rid;

  -- 6c. Inventory decrement SECOND (reward row locked by Step 3 FOR UPDATE).
  --     If NULL inventory_qty, reward is unlimited-supply — skip the write.
  IF r.inventory_qty IS NOT NULL THEN
    UPDATE public.club_rewards
      SET inventory_qty = inventory_qty - 1
      WHERE id = p_reward_id;
  END IF;

  -- 6d. Ledger deduction LAST. If any of 6b or 6c failed, we never reach
  --     here and plpgsql rolls back — deduction cannot exist without a
  --     matching voucher AND matching inventory-decremented (or NULL) state.
  --     Columns verified against 20260703h:106-115 (club_points_ledger).
  --     reason enum literal 'redeem' verified against 20260703h:50.
  INSERT INTO public.club_points_ledger
      (club_id, member_id, delta_points, reason, source_ref)
    VALUES (p_club_id, p_member_id, -r.point_cost, 'redeem', p_reward_id::text);

  -- Emit the success row. Assignments to OUT parameters `status` and
  -- `voucher_code`; RETURN NEXT appends the row to the result set.
  status := 'ok';
  voucher_code := v_code;
  RETURN NEXT;
END;
$function$;

COMMIT;
