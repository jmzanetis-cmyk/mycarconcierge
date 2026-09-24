-- Supersedes 20260602_totp_backup_codes.sql (never applied to prod per the
-- supabase_migrations ledger + information_schema check on 2026-09-24).
-- Corrections vs the 20260602 version:
--   1. No SELECT policy for authenticated. Backup-code hashes are service-role
--      only. Users learn "N codes remaining" via the plaintext response at
--      confirm-enroll time, not by querying the table later.
--   2. Explicit REVOKE on anon/authenticated + the underlying sequence, so the
--      intent is audit-visible in prod grants (belt-and-suspenders with RLS).
--
-- If the 20260602 version was ever applied out-of-band, its policy is dropped
-- defensively before the REVOKE below.
--
-- Dry-run 2026-09-24 (BEGIN/apply/probe/ROLLBACK):
--   table_regclass=totp_backup_codes, rls_enabled=true, policy_count=0,
--   anon_{select,insert,update,delete}=false,
--   authenticated_{select,insert,update,delete}=false,
--   service_role_{select,insert}=true.
-- Post-ROLLBACK to_regclass=null (no persistence).
--
-- Rollback DDL (if apply ever needs to be undone):
--   drop table if exists public.totp_backup_codes cascade;

create table if not exists public.totp_backup_codes (
  id         bigserial    primary key,
  user_id    uuid         not null references auth.users(id) on delete cascade,
  code_hash  text         not null,
  used_at    timestamptz  null,
  created_at timestamptz  not null default now()
);

create index if not exists totp_backup_codes_user_idx
  on public.totp_backup_codes(user_id);

alter table public.totp_backup_codes enable row level security;

drop policy if exists "Users can view own backup codes" on public.totp_backup_codes;

revoke all on public.totp_backup_codes from anon, authenticated;
revoke all on sequence public.totp_backup_codes_id_seq from anon, authenticated;
