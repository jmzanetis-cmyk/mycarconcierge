-- ============================================================================
-- 20260921b_provider_rate_card_items.sql
--
-- Phase 2 of the auto-bid redesign (rate card). Each provider's own price
-- list — one row per (provider, item_key). Referenced by the eventual
-- prefill-notify engine to seed a suggested bid amount when a matching job
-- opens; already useful standalone (see the "Rate Card" panel in Provider
-- Settings) as a real provider-owned price list even if the notify engine
-- never lands.
--
-- KEY DESIGN CHOICES:
--   - item_key FK → service_menu_items.item_key (20260921a). Closed
--     vocabulary means the notify engine can match a job to a small set of
--     item_keys deterministically; free-text would fragment on spelling.
--   - price_cents integer with a positive-only CHECK. Currency stays in
--     cents throughout — matches how the rest of MCC stores money
--     (plan_bids.amount_cents, transactions.amount_cents).
--   - price_type CHECK ('fixed','starting_at'). 'starting_at' is the honest
--     answer for jobs that need diagnosis first (e.g. "Brake Pads — Front
--     starting at $180" for a shop that varies by pad tier). The prefill
--     engine still uses the number as the suggested bid; the label just
--     changes on the card.
--   - conditions text (nullable). Free-text for one-line qualifiers the
--     price depends on ("plus tire disposal", "includes free rotation").
--     Not parsed — displayed to the member alongside the price.
--   - active boolean — soft-delete alternative to DELETE. Also useful to
--     temporarily pull an item without losing history (e.g. supplier issue).
--   - UNIQUE (provider_id, item_key). A provider prices each catalog item
--     at most once; upserts (POST/PUT) always resolve to the same row.
--
-- RLS — mirrors provider_match_preferences (20260524:113-136) exactly:
--   self_read, self_upsert, self_update, service_all. No self_delete —
--   Phase 2's API routes deletes through the Netlify function (which uses
--   service_role and bypasses RLS anyway); direct-from-browser deletes can
--   be added later without a schema change if a use case shows up.
--
-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS + all policies wrapped in
-- DROP POLICY IF EXISTS ... CREATE POLICY. Trigger CREATE OR REPLACE +
-- DROP TRIGGER IF EXISTS. Re-runs are safe.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_rate_card_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_key      text NOT NULL REFERENCES public.service_menu_items(item_key),
  price_cents   integer NOT NULL CHECK (price_cents > 0),
  price_type    text NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'starting_at')),
  conditions    text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, item_key)
);

-- Common query paths: "give me all of provider X's rate card" (GET /rate-card)
-- and "does provider X price item Y?" (notify engine lookup, Phase 3+).
-- The UNIQUE constraint already covers (provider_id, item_key); add a
-- provider-only index so the GET-all path doesn't scan the whole table
-- once volume grows.
CREATE INDEX IF NOT EXISTS provider_rate_card_items_provider_idx
  ON public.provider_rate_card_items (provider_id)
  WHERE active = true;

-- ---------------------------------------------------------------------------
-- RLS — 4 policies, mirroring provider_match_preferences (20260524_...):
--   self_read   (SELECT)  → provider sees only their own rows
--   self_upsert (INSERT)  → provider can insert only for themselves
--   self_update (UPDATE)  → provider can update only their own rows
--   service_all (ALL)     → service_role bypasses (defense-in-depth; the
--                           service_role client bypasses RLS regardless,
--                           but the explicit policy makes intent readable)
-- No self_delete: the Netlify function handles DELETE with service_role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_rate_card_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prci_self_read   ON public.provider_rate_card_items;
DROP POLICY IF EXISTS prci_self_upsert ON public.provider_rate_card_items;
DROP POLICY IF EXISTS prci_self_update ON public.provider_rate_card_items;
DROP POLICY IF EXISTS prci_service_all ON public.provider_rate_card_items;

CREATE POLICY prci_self_read ON public.provider_rate_card_items
  FOR SELECT TO authenticated
  USING (provider_id = auth.uid());

CREATE POLICY prci_self_upsert ON public.provider_rate_card_items
  FOR INSERT TO authenticated
  WITH CHECK (provider_id = auth.uid());

CREATE POLICY prci_self_update ON public.provider_rate_card_items
  FOR UPDATE TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

CREATE POLICY prci_service_all ON public.provider_rate_card_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Touch updated_at on any UPDATE. Same pattern as
-- provider_match_preferences_touch_trg.
CREATE OR REPLACE FUNCTION public.provider_rate_card_items_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS provider_rate_card_items_touch_trg ON public.provider_rate_card_items;
CREATE TRIGGER provider_rate_card_items_touch_trg
  BEFORE UPDATE ON public.provider_rate_card_items
  FOR EACH ROW EXECUTE FUNCTION public.provider_rate_card_items_touch();
