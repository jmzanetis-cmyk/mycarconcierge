-- Task #241 — One-shot backfill of profiles.facebook_user_id
--
-- Task #186 added profiles.facebook_user_id and an opportunistic backfill on
-- the Facebook deletion-callback path. Existing Facebook-signup users still
-- have NULL facebook_user_id, so the very first deletion ping for each of
-- them does an O(N) walk over auth.admin.listUsers (up to 10k accounts).
--
-- This migration copies provider_id from auth.identities WHERE provider =
-- 'facebook' into profiles.facebook_user_id for every matching user, so the
-- deletion callback (netlify/functions/facebook-data-deletion.js
-- lookupUserByFacebookId) hits the fast indexed lookup on the FIRST ping.
--
-- Notes:
-- * Uses DISTINCT ON (provider_id) so we deterministically pick one profile
--   per Facebook id even in the edge case of duplicate identity rows — the
--   partial unique index profiles_facebook_user_id_key would otherwise raise.
-- * Only updates rows where facebook_user_id is currently NULL, so re-runs
--   are no-ops and we never clobber a value the deletion endpoint already
--   wrote opportunistically.
-- * Filters out NULL/empty provider_id defensively.

UPDATE profiles p
SET facebook_user_id = src.provider_id
FROM (
  SELECT DISTINCT ON (i.provider_id)
         i.user_id,
         i.provider_id
  FROM auth.identities i
  WHERE i.provider = 'facebook'
    AND i.provider_id IS NOT NULL
    AND length(btrim(i.provider_id)) > 0
  ORDER BY i.provider_id, i.created_at ASC
) src
WHERE p.id = src.user_id
  AND p.facebook_user_id IS NULL;
