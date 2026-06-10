#!/usr/bin/env bash
# Wrapper around seed-app-store-reviewer.js that prompts for secrets
# so they never have to be pasted inline (avoiding terminal line-wrap issues).
set -e

cd "$(dirname "$0")/.."

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  printf 'Supabase service role key: '
  read -rs SUPABASE_SERVICE_ROLE_KEY
  echo
fi
export SUPABASE_SERVICE_ROLE_KEY

if [ -z "$REVIEWER_PASSWORD" ]; then
  printf 'Reviewer password (must match App Store Connect): '
  read -rs REVIEWER_PASSWORD
  echo
fi
export REVIEWER_PASSWORD

node scripts/seed-app-store-reviewer.js
