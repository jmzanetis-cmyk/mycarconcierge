# For Claude Code — validate THEN apply (do not run blind)

These five files are a **design spec**, not finished migrations to run against
production. Both `.sql` files were written against *assumed* column names. Your
job is to reconcile them with the real schema first, validate on a non-prod
target, and only then apply.

## Files in this folder

- `custody_chain_schema.sql` — chain-of-custody photo verification + return fees
- `custody.types.ts` / `custody.client.ts` — TS types + client helper (React/Capacitor)
- `car_club_programs_schema.sql` — opt-in points / coupons / comp-services for car clubs
- `car_club_programs_endpoints.md` — endpoint contract for `car-clubs.js`

## Step 1 — Read the real schema (Supabase MCP)

Pull actual definitions for: `jobs`, `profiles`/providers, `car_clubs`,
`car_club_members`, and `auth.users`. Note the real column names.

## Step 2 — Reconcile the assumptions and fix references

**custody_chain_schema.sql** assumes:

- `jobs.member_id` and `jobs.provider_user_id`. If the provider link is
  `jobs.provider_id → providers.owner_id`, rewrite `is_job_party()` accordingly.
- Both MCC repos point at the **same Supabase project**. CONFIRM THIS. If they
  are separate projects, stop and flag — the shared-bucket / shared-RLS design
  changes (one becomes backend of record).

**car_club_programs_schema.sql** assumes:

- `car_clubs(id, provider_id)` and `car_club_members(club_id, member_id)`.
  If `provider_id` resolves through a providers table, fix `is_club_provider()`.
- The `ALTER TABLE car_clubs ADD COLUMN IF NOT EXISTS …` toggles are safe to
  re-run; verify they don’t collide with existing columns.

## Step 3 — Validate on a non-prod target FIRST

Run both files against a branch DB / shadow / dev project — **not** the prod
SQL editor. These create enums, append-only tables with immutability triggers,
SECURITY DEFINER functions, and `ALTER PUBLICATION supabase_realtime ADD TABLE`.
Those are not trivially reversible on a live DB, so prove them in non-prod.

## Step 4 — Prove RLS does what it should

With test users, confirm:

- A member sees their own custody chain / points ledger; a non-party sees nothing.
- A provider can manage only their own club’s programs and read their members’ rows.
- Attestations + points ledger are append-only (UPDATE/DELETE rejected).
- `redeem_reward()` refuses when balance < cost or inventory is 0.
- `accrue_points()` is a no-op when `points_enabled` is false.

## Step 5 — Apply, then wire

Only after Steps 1–4: apply to prod.

- Drop `custody.types.ts` + `custody.client.ts` into **both** repos
  (`mycarconcierge` and `mcc_driver`), same folder, after the tables exist.
- Implement the `car-clubs.js` routes per `car_club_programs_endpoints.md`,
  gating each write behind its `car_clubs` toggle and returning only enabled
  sections to members.

## Open questions to answer during this session

1. Do both repos share one Supabase project? (gates the custody design)
1. What is the real provider link on `jobs` and on `car_clubs`?
1. Should car-club points accrue only on MCC-processed payments, or also on
   manually-logged in-person spend? (default in schema: MCC-processed only)