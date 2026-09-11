-- Fixes a live production bug: POST /api/member/survey
-- (netlify/functions/member-survey.js, ported in bb1c402 "feat(B9): port
-- POST /api/member/survey to Netlify function") upserts into
-- survey_responses with { onConflict: 'user_id' }:
--
--   const { error } = await sb.from('survey_responses')
--     .upsert({ user_id: auth.user.id, ...answers }, { onConflict: 'user_id' });
--
-- but survey_responses has only ever had a *non-unique* index on user_id
-- (see idx_survey_responses_user_id in 20260328_member_onboarding.sql).
-- Postgres requires a unique constraint or unique index matching the
-- ON CONFLICT target for an upsert to work at all -- without one, every
-- single call to this endpoint fails at the database layer with:
--
--   42P10: there is no unique or exclusion constraint matching the ON
--   CONFLICT specification
--
-- The frontend (www/onboarding-member.html's submitSurveyAndClose()) only
-- console.warn()s on a non-2xx response and always advances to the
-- thank-you screen regardless of success or failure, so this has been
-- failing silently in production since the endpoint was ported: every
-- member's 22 post-signup survey answers have been discarded on every
-- submission, and survey_responses' answer columns are NULL for every
-- authenticated member row.
--
-- A plain (non-partial) unique index on user_id is safe for the separate,
-- pre-existing anonymous prospect-survey flow that also writes to this
-- table (20260328_prospect_survey.sql / netlify/functions/survey-response.js):
-- Postgres does not treat NULL = NULL for uniqueness purposes, so any number
-- of rows with user_id IS NULL remain allowed. Only real (non-null) user_id
-- values are constrained to at most one row, which is exactly the "one
-- survey response per member" invariant member-survey.js's upsert relies on.

DROP INDEX IF EXISTS idx_survey_responses_user_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_user_id_unique
  ON survey_responses(user_id);
