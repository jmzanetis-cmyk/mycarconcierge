-- ============================================================================
-- Task #123 — Gatekeeper agent producers
--
-- Adds two server-side triggers on `profiles` (the polymorphic providers
-- table) that emit fleet events whenever a provider's lifecycle changes:
--
--   provider.applied  — profile becomes role='pending_provider'
--                        (either INSERT directly into that role, or UPDATE
--                         from a different role into pending_provider).
--   provider.flagged  — profile becomes role='suspended'
--                        (UPDATE only — INSERTed-as-suspended is exotic
--                         enough we ignore it; flagged covers the operator
--                         action of moving an existing profile to suspended).
--
-- Both triggers are SECURITY DEFINER so they bypass RLS, and use a separate
-- search_path. They write to public.agent_events with source='trigger:profiles'
-- so the orchestrator picks them up on its next tick.
--
-- The third Gatekeeper input event — `provider.bgc_completed` — is emitted
-- in application code from `netlify/functions/background-check-webhook.js`
-- (see code change in the same task), not via a DB trigger, because the
-- webhook is the natural place where we already have the result context.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agent_emit_provider_applied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
BEGIN
  -- Fire only on the transition INTO pending_provider, not on every UPDATE.
  IF NEW.role = 'pending_provider'
     AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM NEW.role) THEN
    INSERT INTO public.agent_events (event_type, payload, source)
    VALUES (
      'provider.applied',
      jsonb_build_object(
        'provider_id',   NEW.id,
        'business_name', NEW.business_name,
        'full_name',     NEW.full_name,
        'email',         NEW.email,
        'phone',         NEW.phone,
        'previous_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.role ELSE NULL END
      ),
      'trigger:profiles'
    );
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS profile_provider_applied_emit ON public.profiles;
CREATE TRIGGER profile_provider_applied_emit
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_emit_provider_applied();


CREATE OR REPLACE FUNCTION public.agent_emit_provider_flagged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
BEGIN
  -- Fire only when a profile transitions INTO suspended (not when re-saved
  -- while already suspended).
  IF NEW.role = 'suspended' AND OLD.role IS DISTINCT FROM 'suspended' THEN
    INSERT INTO public.agent_events (event_type, payload, source)
    VALUES (
      'provider.flagged',
      jsonb_build_object(
        'provider_id',   NEW.id,
        'business_name', NEW.business_name,
        'previous_role', OLD.role,
        'reason',        'role_changed_to_suspended'
      ),
      'trigger:profiles'
    );
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS profile_provider_flagged_emit ON public.profiles;
CREATE TRIGGER profile_provider_flagged_emit
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_emit_provider_flagged();
