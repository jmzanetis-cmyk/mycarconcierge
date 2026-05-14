-- ============================================================================
-- Task #210 — Saved language preference on profiles
--
-- Adds `preferred_language` to `profiles` so server-side dispatchers (the BGC
-- launch broadcast, future transactional emails) can pick the right language
-- template/subject for each recipient. Client-side i18n.js writes this whenever
-- the signed-in user changes their language; the historical default `null`
-- means "no preference saved → fall back to English."
--
-- Constrained to the seven languages currently supported by the app's i18n
-- system (English, Spanish, French, Greek, Chinese, Hindi, Arabic).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_preferred_language_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_preferred_language_check
      CHECK (preferred_language IS NULL OR preferred_language IN ('en','es','fr','el','zh','hi','ar'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.preferred_language IS
  'ISO 639-1 code (en/es/fr/el/zh/hi/ar) of the user''s saved UI language. Written by www/i18n.js when a signed-in user changes language; consumed by transactional + broadcast email dispatchers to pick the matching template + subject. NULL means no preference saved → English fallback.';
