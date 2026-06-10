-- totp_backup_codes: stores hashed recovery codes generated at TOTP enrolment.
-- Plaintext codes are returned ONCE at enrol-confirm time and never stored here.
-- Hashing uses SHA-256 (matching hash2faCode() in server.js).
-- Rows are deleted and regenerated on re-enrolment; used_at marks a consumed code.

create table if not exists totp_backup_codes (
  id         bigserial    primary key,
  user_id    uuid         not null references auth.users(id) on delete cascade,
  code_hash  text         not null,
  used_at    timestamptz  null,
  created_at timestamptz  not null default now()
);

create index totp_backup_codes_user_idx on totp_backup_codes(user_id);

alter table totp_backup_codes enable row level security;

-- Users may read their own rows (e.g. "N codes remaining" count).
-- All writes go via service-role and bypass RLS.
create policy "Users can view own backup codes"
  on totp_backup_codes for select
  using (auth.uid() = user_id);
