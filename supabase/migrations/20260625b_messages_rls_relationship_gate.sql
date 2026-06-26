-- ============================================================================
-- 20260625b — Messages RLS: record existing SELECT, TIGHTEN INSERT to require
--             an accepted-bid relationship between sender and recipient on the
--             referenced package_id / care_plan id.
--
-- BACKGROUND
--   The messages table + its current RLS policies live in production but were
--   created via Studio (not migrations). Verified live state:
--     SELECT: USING (auth.uid() = sender_id OR auth.uid() = recipient_id)   ✓
--     INSERT: WITH CHECK (auth.uid() = sender_id)                           ← loose
--
--   The INSERT policy is currently LOOSE: any authenticated user can spoof a
--   message TO any other user on ANY package_id (provided they set sender_id
--   to their own auth.uid). This migration tightens INSERT to require an
--   *accepted-bid relationship* between the two participants on the referenced
--   package/care_plan. The new client send path (netlify/functions/messages-send.js,
--   shipping in the same CR) uses the service-role key so it bypasses RLS and
--   serves as the canonical write entry point. The tightened RLS is defense-in-
--   depth for any direct client .insert() that still leaks through.
--
-- ⚠ DEPLOY ORDERING (READ BEFORE APPLYING IN STUDIO)
--   Tightening INSERT RLS breaks pre-acceptance client .insert() calls. Apply
--   this migration ONLY AFTER:
--     (a) netlify/functions/messages-send.js is deployed (service-role bypass)
--     (b) Client send paths (members-extras.js sendMessage, providers-jobs.js
--         sendMessage) are switched to POST /api/messages/send
--   Both are in the same CR as this file. If you apply this BEFORE the deploy
--   lands on Netlify, members + providers cannot send messages until the
--   code is live.
--
-- ⚠ EXISTING POLICY NAME — VERIFY BEFORE APPLYING
--   Run in Studio first:
--     SELECT polname FROM pg_policies
--     WHERE schemaname='public' AND tablename='messages' AND polcmd='a';
--   ('a' = INSERT). Add the live policy name to the DROP IF EXISTS list below
--   if it differs from the generic names listed. If you don't drop the live
--   policy, my new strict policy will OR with the existing loose one — and
--   loose-OR-strict = loose. The tighten won't tighten.
--
-- SCHEMA VERIFIED (no changes — for reviewer reference):
--   care_plans:               id, member_id, provider_id, status (CHECK includes
--                             'awarded' & 'completed' — both = past acceptance),
--                             accepted_bid_id REFERENCES plan_bids(id).
--   maintenance_packages:     id, member_id, accepted_bid_id (NO provider_id column
--                             — the provider comes via bids.accepted_bid_id only).
--   bids (legacy):            id, provider_id, status ('accepted' = past acceptance).
--   plan_bids (new flow):     id, care_plan_id, provider_id, status.
--   messages:                 id, sender_id, recipient_id, package_id, content,
--                             provider_alias, read_at, created_at.
--
--   IMPORTANT: messages.package_id is a single column used for BOTH legacy
--   maintenance_packages.id AND new care_plans.id (no FK enforces which table —
--   the platform is mid-migration). The RLS predicate covers both flows via OR.
-- ============================================================================

-- ── SELECT policy: re-state the existing policy for source-control parity.
-- (Drops any prior name first, recreates with a canonical name.)
DROP POLICY IF EXISTS "messages: participants read"           ON public.messages;
DROP POLICY IF EXISTS "Messages select"                       ON public.messages;
DROP POLICY IF EXISTS "messages_select"                       ON public.messages;
DROP POLICY IF EXISTS "Enable read access for participants"   ON public.messages;
DROP POLICY IF EXISTS "Users can view own messages"           ON public.messages;
-- ↑ Append the live SELECT policy name here if it differs from these.
--   (Live SELECT policy verified 2026-06-25 via pg_policies: "Users can view own messages".)

CREATE POLICY "messages: participants read"
  ON public.messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- ── INSERT policy: TIGHTEN to require an accepted-bid relationship on the
--    package_id between sender (= auth.uid()) and recipient_id.
DROP POLICY IF EXISTS "messages: sender inserts own"                ON public.messages;
DROP POLICY IF EXISTS "messages: sender inserts on accepted relationship" ON public.messages;
DROP POLICY IF EXISTS "Messages insert"                             ON public.messages;
DROP POLICY IF EXISTS "messages_insert"                             ON public.messages;
DROP POLICY IF EXISTS "Enable insert for authenticated sender"      ON public.messages;
DROP POLICY IF EXISTS "Users can send messages"                     ON public.messages;
-- ↑ Append the live INSERT policy name here if it differs from these.
--   Without dropping the existing loose INSERT policy, the new strict policy
--   below will OR with it and the tighten has no effect.
--   (Live INSERT policy verified 2026-06-25 via pg_policies: "Users can send messages".)

CREATE POLICY "messages: sender inserts on accepted relationship"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND auth.uid() IS NOT NULL
    AND recipient_id IS NOT NULL
    AND recipient_id <> sender_id
    AND (
      -- ── New care_plans flow ─────────────────────────────────────────
      -- package_id maps to a care_plan that has been awarded (or beyond),
      -- and (member_id, provider_id) is the {sender, recipient} pair in
      -- either direction.
      EXISTS (
        SELECT 1
        FROM public.care_plans cp
        WHERE cp.id = messages.package_id
          AND cp.status IN ('awarded', 'completed')
          AND cp.provider_id IS NOT NULL
          AND (
            (cp.member_id = auth.uid()   AND cp.provider_id = messages.recipient_id)
            OR
            (cp.provider_id = auth.uid() AND cp.member_id   = messages.recipient_id)
          )
      )
      OR
      -- ── Legacy maintenance_packages flow ────────────────────────────
      -- package_id maps to a maintenance_package whose accepted_bid_id
      -- resolves to a bids row with status='accepted'. The {sender,
      -- recipient} pair must be {mp.member_id, bids.provider_id} in
      -- either direction.
      EXISTS (
        SELECT 1
        FROM public.maintenance_packages mp
        JOIN public.bids b
          ON b.id = mp.accepted_bid_id
         AND b.status = 'accepted'
        WHERE mp.id = messages.package_id
          AND (
            (mp.member_id = auth.uid()    AND b.provider_id = messages.recipient_id)
            OR
            (b.provider_id = auth.uid()   AND mp.member_id  = messages.recipient_id)
          )
      )
    )
  );

-- ── UPDATE / DELETE: NOT granted to `authenticated`.
--    Service-role (admin via Netlify functions) bypasses RLS for moderation.
--    Absence of a policy = denied for normal roles. If existing UPDATE/DELETE
--    policies are in place for normal users, drop them explicitly — messages
--    should be append-only from the user perspective.
DROP POLICY IF EXISTS "messages: sender updates own" ON public.messages;
DROP POLICY IF EXISTS "messages: sender deletes own" ON public.messages;
-- (Add any live UPDATE/DELETE policy names here to revoke.)

-- ============================================================================
-- End of 20260625b_messages_rls_relationship_gate.sql
--
-- Post-apply check (run in Studio after):
--   SELECT polname, polcmd, qual::text, with_check::text
--   FROM pg_policies WHERE schemaname='public' AND tablename='messages'
--   ORDER BY polcmd;
-- Expected: one SELECT row (participants read), one INSERT row (accepted
-- relationship). No other INSERT/UPDATE/DELETE policies for `authenticated`.
-- ============================================================================
