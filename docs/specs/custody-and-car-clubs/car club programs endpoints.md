# Car Club Programs — endpoint contract (`netlify/functions/car-clubs.js`)

Additions to the existing car-clubs function. Every write below must first check
the relevant **toggle** on `car_clubs`; member-facing GETs return only enabled
sections. Provider-only routes verify `car_clubs.provider_id === caller`.

## Feature toggles

- `PATCH /api/car-clubs/:id/features` *(provider)* — set any of
  `{ points_enabled, coupons_enabled, comp_services_enabled, punch_card_enabled }`.
  Turning a feature **off** hides it from members but keeps existing rows intact.

## Points

- `PUT  /api/car-clubs/:id/points-config` *(provider, requires points_enabled)* —
  `{ points_per_dollar, points_label, accrual_source }` → upserts `club_points_config`.
- `GET  /api/car-clubs/:id/members/:memberId/points` — `{ balance, history[] }`
  (member sees own; provider sees any member of their club).
- **Accrual is internal**, not a public route: your payment-settlement webhook
  calls the `accrue_points(club_id, member_id, amount_cents, source_ref)` RPC when
  an MCC-processed charge to the provider succeeds. Self-guards on the toggle.

## Reward catalog (merch + point-priced comp services)

- `GET    /api/car-clubs/:id/rewards` — active rewards (members + provider).
- `POST   /api/car-clubs/:id/rewards` *(provider)* —
  `{ kind, title, description, point_cost, image_url, inventory_qty }`.
- `PATCH  /api/car-clubs/:id/rewards/:rewardId` *(provider)* — edit / set `active`.
- `POST   /api/car-clubs/:id/rewards/:rewardId/redeem` *(member)* — calls
  `redeem_reward` RPC (atomic balance + inventory check) → returns `{ voucher_code }`.
- `POST   /api/car-clubs/:id/redemptions/:redemptionId/fulfill` *(provider)* —
  marks the voucher fulfilled at their location.

## Coupons

- `GET    /api/car-clubs/:id/coupons` — active coupons (members + provider).
- `POST   /api/car-clubs/:id/coupons` *(provider, requires coupons_enabled)* —
  `{ code, title, discount_type, discount_value, min_spend_cents, eligible_services, max_redemptions, per_member_limit, starts_at, expires_at }`.
- `POST   /api/car-clubs/:id/coupons/:code/redeem` *(member)* — validate window,
  caps, per-member limit, min spend → insert `club_coupon_redemptions`,
  return discount to apply. (Validation in the function; no balance race here.)

## Complimentary services (conditional/free perks)

- `GET    /api/car-clubs/:id/comp-services` — active offers.
- `POST   /api/car-clubs/:id/comp-services` *(provider, requires comp_services_enabled)* —
  `{ title, description, service_type, condition_min_spend_cents, per_member_limit, starts_at, expires_at }`.
- `POST   /api/car-clubs/:id/comp-services/:csId/claim` *(member)* — check
  eligibility + per-member limit → insert `club_comp_service_grants` (status `granted`).
- `POST   /api/car-clubs/:id/grants/:grantId/use` *(provider)* — mark `used`.

## Notes

- Provider dashboard (`car-club-provider.html`): render each program section behind
  its toggle; the toggle row is the entry point (“Turn on Points → set earn rate”).
- Member club page (`car-club-member.html`): show points balance, redeemable catalog,
  active coupons, and comp-service perks **only** for enabled features; a club with
  none enabled shows branding + join.
- Returning-member bonus: keep the existing 3 bonus bid-credit grant on club-member
  rebooking — it’s independent of which programs are on.