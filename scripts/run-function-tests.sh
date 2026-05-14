#!/usr/bin/env bash
# Task #285 — Run every in-process Netlify function regression test.
#
# Discovers every `netlify/functions/*.test.js` file and runs it with
# `node`. Each test file is self-contained (own `assert` calls, prints
# its own pass/fail tally, exits non-zero on failure) — see the headers
# of admin-routes-auth.test.js / provider-application.test.js for the
# convention. Aggregates pass/fail across files and exits non-zero if
# any single file fails so `npm test` can be wired into CI without
# masking regressions.

set -u
shopt -s nullglob

cd "$(dirname "$0")/.."

files=(netlify/functions/tests/*.test.js)

# Task #202 — Offline smokes for scripts that don't live under
# netlify/functions/ but should still be guarded by `npm test`. Each entry
# must be a self-contained Node script that exits non-zero on failure and
# requires no external credentials (stub out Supabase / Resend / Twilio).
extra=(
  scripts/bgc-reminders-prefs-smoke.js
  scripts/queue-flush-skip-test.js
  scripts/queue-flush-followup-test.js
  scripts/paused-digest-rendering-test.js
)
files+=("${extra[@]}")

total=${#files[@]}

if [ "$total" -eq 0 ]; then
  echo "No test files found at netlify/functions/*.test.js — nothing to run."
  exit 0
fi

echo "Running $total Netlify-function test file(s)…"
echo ""

passed=0
failed_files=()

for f in "${files[@]}"; do
  echo "=== $f ==="
  if node "$f"; then
    passed=$((passed + 1))
  else
    failed_files+=("$f")
  fi
  echo ""
done

echo "================================================================"
echo "Summary: $passed/$total test file(s) passed"
if [ "${#failed_files[@]}" -gt 0 ]; then
  echo "Failed:"
  for f in "${failed_files[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
echo "All test files passed."
