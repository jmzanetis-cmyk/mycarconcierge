-- ============================================================================
-- 20260707a — Fix redeem RPCs: schema-qualify pgcrypto's gen_random_bytes.
--
-- Root cause (discovered 2026-07-07 during Car Club backend integration test):
--
--   Both redeem RPCs — the 3-param SECURITY DEFINER
--   redeem_reward_for_member (20260706a) and the 2-param redeem_reward
--   (20260703h:180) — call gen_random_bytes(6) to generate the voucher_code
--   at their write step. Both are declared with SET search_path TO 'public'.
--
--   gen_random_bytes is provided by the pgcrypto extension. On Supabase-
--   managed Postgres, pgcrypto is installed in the `extensions` schema
--   (verified 2026-07-07 via `SELECT nspname FROM pg_extension JOIN
--   pg_namespace ON pg_namespace.oid = extnamespace WHERE extname =
--   'pgcrypto'` → 'extensions'). With search_path restricted to public
--   (plus the implicit pg_catalog), the extensions schema is not on the
--   path, and the call fails with:
--
--     SQLSTATE 42883
--     function gen_random_bytes(integer) does not exist
--     hint: No function matches the given name and argument types.
--
--   In the 3-param RPC, this propagates back to _redeemViaRpc in
--   car-clubs.js:662 as a populated `error` object, which the handler maps
--   to `500 { error: 'Redemption failed' }` — the opaque error that blocked
--   the smoke test at Step 3.
--
--   The 2-param variant has the identical bug but has never been exercised
--   in prod (it uses auth.uid() and no JS caller hits it via an
--   authenticated Supabase session — only PostgREST-with-JWT via the anon
--   client would reach it, and no client code does).
--
--   Neither RPC has EVER produced a live voucher in production. The pilot
--   was blocked here before we tripped over the missing club_rewards row
--   for Chris (the OTHER gap from 2026-07-06).
--
-- Fix: fully qualify the call as `extensions.gen_random_bytes(6)`. This is
-- surgical (no search_path expansion — the SECURITY DEFINER function
-- doesn't inherit any new schema exposure), makes the extension dependency
-- explicit at the callsite, and is immune to future search_path changes.
--
-- Alternatives considered:
--   • SET search_path TO 'public, extensions' — works, but adds an implicit
--     dependency on the extensions schema name and increases attack surface
--     of the SECURITY DEFINER function by exposing more callable names.
--     Fully qualifying is tighter.
--   • Replace gen_random_bytes with pg_catalog.encode + random() — no,
--     random() is not cryptographically strong enough for a voucher code.
--     gen_random_bytes is the correct primitive.
--
-- Signature-preserving update:
--   Both are CREATE OR REPLACE FUNCTION. Return types unchanged. Same
--   argument lists. Same SECURITY DEFINER / LANGUAGE / SET search_path.
--   Only the body's gen_random_bytes reference changes. Idempotent — safe
--   to replay.
--
-- No outer BEGIN/COMMIT: Supabase runs each migration in its own
-- transaction. When applied via Studio SQL Editor, each CREATE OR REPLACE
-- FUNCTION is a single auto-committing statement, so partial application
-- (first succeeded, second failed) would leave the fixed 3-param in place
-- and the unused 2-param still broken — which is harmless (2-param is
-- never called).
-- ============================================================================

-- ─── 3-param: redeem_reward_for_member (the one actually used by handlers) ───
-- Body verbatim from 20260706a EXCEPT line marked "PATCHED 2026-07-07".
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
  IF NOT public.is_club_member(p_club_id, p_member_id) THEN
    status := 'not_member';
    voucher_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Step 2: advisory transaction lock on (club_id, member_id).
  PERFORM pg_advisory_xact_lock(
    hashtext(p_club_id::text),
    hashtext(p_member_id::text)
  );

  -- Step 3: lock the reward row (also enforces reward ↔ club ownership).
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

  -- Step 5: balance guard (under the advisory lock).
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

  -- Step 6a: generate voucher_code.
  -- PATCHED 2026-07-07: schema-qualify gen_random_bytes so the function
  -- resolves under SET search_path = 'public'. pgcrypto lives in the
  -- `extensions` schema on Supabase-managed Postgres (verified 2026-07-07).
  v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));

  -- Step 6b: voucher row FIRST (invariant: voucher exists before deduction).
  INSERT INTO public.club_points_redemptions
      (club_id, member_id, reward_id, point_cost, voucher_code)
    VALUES (p_club_id, p_member_id, p_reward_id, r.point_cost, v_code)
    RETURNING id INTO v_rid;

  -- Step 6c: inventory decrement (skipped when unlimited).
  IF r.inventory_qty IS NOT NULL THEN
    UPDATE public.club_rewards
      SET inventory_qty = inventory_qty - 1
      WHERE id = p_reward_id;
  END IF;

  -- Step 6d: ledger deduction LAST.
  INSERT INTO public.club_points_ledger
      (club_id, member_id, delta_points, reason, source_ref)
    VALUES (p_club_id, p_member_id, -r.point_cost, 'redeem', p_reward_id::text);

  status := 'ok';
  voucher_code := v_code;
  RETURN NEXT;
END;
$function$;


-- ─── 2-param: redeem_reward (latent same-bug; unused by any live JS caller) ───
-- Body verbatim from 20260703h:180-209 EXCEPT the same schema-qualify patch.
CREATE OR REPLACE FUNCTION public.redeem_reward(p_club_id uuid, p_reward_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r    public.club_rewards%ROWTYPE;
  bal  int;
  code text;
  rid  uuid;
BEGIN
  IF NOT (SELECT points_enabled FROM public.car_clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Points are not enabled for this club.';
  END IF;
  IF NOT public.is_club_member(p_club_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of this club.';
  END IF;

  SELECT * INTO r FROM public.club_rewards
    WHERE id = p_reward_id AND club_id = p_club_id FOR UPDATE;
  IF NOT FOUND OR NOT r.active THEN RAISE EXCEPTION 'Reward unavailable.'; END IF;
  IF r.inventory_qty IS NOT NULL AND r.inventory_qty <= 0 THEN
    RAISE EXCEPTION 'Reward out of stock.';
  END IF;

  bal := public.club_points_balance(p_club_id, auth.uid());
  IF bal < r.point_cost THEN
    RAISE EXCEPTION 'Not enough points (% of %).', bal, r.point_cost;
  END IF;

  INSERT INTO public.club_points_ledger(club_id, member_id, delta_points, reason, source_ref)
    VALUES (p_club_id, auth.uid(), -r.point_cost, 'redeem', p_reward_id::text);

  -- PATCHED 2026-07-07: schema-qualify gen_random_bytes (see 3-param above).
  code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));

  INSERT INTO public.club_points_redemptions(club_id, member_id, reward_id, point_cost, voucher_code)
    VALUES (p_club_id, auth.uid(), p_reward_id, r.point_cost, code)
    RETURNING id INTO rid;

  IF r.inventory_qty IS NOT NULL THEN
    UPDATE public.club_rewards SET inventory_qty = inventory_qty - 1 WHERE id = p_reward_id;
  END IF;
  RETURN rid;
END;
$function$;


-- ─── Post-apply verification ────────────────────────────────────────────────
-- Run these AFTER the two CREATE OR REPLACE statements complete. The first
-- confirms both function bodies now reference extensions.gen_random_bytes.
-- The second is a synthetic invocation that exercises the fixed path (using
-- the parameters from the current smoke-test stage — dummy provider club).
--
-- IMPORTANT: the synthetic invocation is a REAL redemption. It will consume
-- 10 points from Jordan's balance on the dummy club and INSERT a voucher
-- row. Only run this if the dummy club currently has balance >= 10 AND
-- Jordan is an active member (both conditions met after the recent
-- Steps 1-2 of the interrupted smoke test). If not sure, skip the
-- invocation and re-run the backend integration test instead.

-- Check both bodies contain the qualified call.
SELECT proname,
       CASE WHEN prosrc LIKE '%extensions.gen_random_bytes%' THEN 'PATCHED'
            WHEN prosrc LIKE '%gen_random_bytes%'            THEN 'STILL UNQUALIFIED (BUG)'
            ELSE 'NO gen_random_bytes reference' END AS status
  FROM pg_proc
 WHERE proname IN ('redeem_reward_for_member', 'redeem_reward')
 ORDER BY proname;
-- Expected: two rows, both status='PATCHED'.
