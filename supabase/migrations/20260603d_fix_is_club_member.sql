-- Fix is_club_member() — was querying car_club_members which is never written
-- by the live join flow. The running app (car-clubs.js) writes memberships
-- into club_memberships (with is_active for soft-deletes). The old function
-- returned false for every real member, breaking RLS policies that gate
-- member-visible rewards, coupons, comp-service claims, and reward redemptions.

CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_memberships m
    WHERE m.club_id   = p_club_id
      AND m.member_id = p_user
      AND m.is_active = true
  );
$$;
