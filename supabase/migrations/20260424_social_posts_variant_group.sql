-- ============================================================================
-- Add variant_group / variant_index / variant_total to social_posts
--
-- The admin "request draft" form can ask Promoter for N alternative drafts
-- (variants 1-10). Each variant emits its own social.post_requested event
-- sharing a vg_… correlation id in the payload. Promoter persists that id and
-- the index/total onto the resulting social_posts row so the admin posts table
-- can render them clustered side-by-side for comparison.
--
-- All three columns are nullable; single drafts have no group.
-- ============================================================================

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS variant_group  text,
  ADD COLUMN IF NOT EXISTS variant_index  integer,
  ADD COLUMN IF NOT EXISTS variant_total  integer;

CREATE INDEX IF NOT EXISTS social_posts_variant_group_idx
  ON public.social_posts (variant_group)
  WHERE variant_group IS NOT NULL;
