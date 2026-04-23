-- ============================================================================
-- Add 'publishing' to social_posts.status check constraint
--
-- The publish admin endpoint now performs a race-safe atomic claim:
--   approved|draft -> publishing -> published
-- This intermediate state ensures only one caller ever invokes the platform
-- adapter for a given post (no duplicate Reddit threads on double-click).
-- ============================================================================

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_status_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('draft','approved','publishing','published','rejected'));
