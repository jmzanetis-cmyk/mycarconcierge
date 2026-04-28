-- ============================================================================
-- provider_applications — DB-level guard against duplicate submissions
--
-- Why:
--   /api/provider-application enforces a "1 application per user per 24h"
--   policy by SELECTing then INSERTing in two separate steps. Two requests
--   that arrive in the same millisecond (e.g. a double-click on the submit
--   button) can both pass the SELECT before either INSERTs, producing two
--   duplicate provider_applications rows in the same second.
--
--   This migration closes that race at the database level by adding a
--   PARTIAL UNIQUE INDEX on (user_id, day-of-created_at). Two concurrent
--   inserts for the same user on the same UTC day will now have one of
--   them fail with Postgres error 23505 (unique_violation), which the
--   endpoint translates back into the same friendly 429 response that the
--   application-level fast path returns.
--
-- Why partial / why "AT TIME ZONE 'UTC'":
--   - date_trunc('day', timestamptz) is STABLE (timezone-dependent) and
--     therefore cannot be used in an index expression. Forcing the value
--     into UTC first (`(created_at AT TIME ZONE 'UTC')::date`) yields an
--     IMMUTABLE expression, which Postgres will accept.
--   - The WHERE predicate restricts the constraint to rows created from
--     the next UTC midnight onward (this migration is authored on
--     2026-04-28). Any same-day duplicates that already exist on the
--     authoring day — including any race-created rows produced by the
--     very bug this migration is closing — are grandfathered in and
--     cannot cause `CREATE UNIQUE INDEX` to fail. Once the boundary is
--     crossed the constraint engages permanently.
--   - That one-day grace window is intentional: the application-level
--     24h SELECT in /api/provider-application still rejects same-user
--     repeat submissions during that window, so we lose no real
--     protection — only the milliseconds-scale race that the DB-level
--     constraint is designed to close, and only for at most ~24h.
--
-- The application-level 24h check in netlify/functions/provider-application.js
-- intentionally stays in place as a friendly fast path that returns 429
-- before we even attempt the insert.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS provider_applications_one_per_user_per_day
  ON public.provider_applications (
    user_id,
    ((created_at AT TIME ZONE 'UTC')::date)
  )
  WHERE created_at >= TIMESTAMPTZ '2026-04-29 00:00:00+00';

COMMENT ON INDEX public.provider_applications_one_per_user_per_day IS
  'Prevents duplicate provider applications from the same user on the same UTC day. '
  'Closes the read-then-write race in /api/provider-application when a user '
  'double-clicks submit. The partial WHERE clause grandfathers in historical '
  'rows from before this constraint was introduced.';
