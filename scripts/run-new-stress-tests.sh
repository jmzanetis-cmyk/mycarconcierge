#!/usr/bin/env bash
# Task #231 — One-command runner for the five Task #227 stress tests.
#
# Runs each of the five new stress tests sequentially at low CI-safe intensity
# and aggregates the per-test exit codes. Exits non-zero if any individual
# test exits non-zero. Tests that self-skip (e.g. stress-test-bgc-webhook.js
# when BGC_WEBHOOK_SECRET is unset) are surfaced as SKIPPED, not FAIL.
#
# Usage:
#   bash scripts/run-new-stress-tests.sh
#   npm run stress:new
#
# Override defaults with env vars:
#   STRESS_CONCURRENCY=10 STRESS_DURATION=15 bash scripts/run-new-stress-tests.sh

set -u

CONCURRENCY="${STRESS_CONCURRENCY:-5}"
DURATION="${STRESS_DURATION:-10}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Each entry: "label|script-path|extra-args"
# stress-test-bgc-broadcast.js doesn't accept --concurrency/--duration; use its
# own small-pool flags to keep the run fast and CI-safe.
TESTS=(
  "care-plan-lifecycle|www/stress-test-care-plan-lifecycle.js|--concurrency=${CONCURRENCY} --duration=${DURATION} --plans=5"
  "bgc-webhook|www/stress-test-bgc-webhook.js|--concurrency=${CONCURRENCY} --duration=${DURATION}"
  "bgc-broadcast|www/stress-test-bgc-broadcast.js|--warmup=5 --sustained=20 --spike=10 --cooldown=5 --rate=20 --idempotency-preseed=5 --suppression-preseed=3"
  "survey-intake|www/stress-test-survey-intake.js|--concurrency=${CONCURRENCY} --duration=${DURATION} --allow-analytics-skip"
  "shop-checkout|www/stress-test-shop-checkout.js|--concurrency=${CONCURRENCY} --duration=${DURATION}"
)

LABELS=()
DURATIONS=()
RESULTS=()
FAIL_COUNT=0

echo "========================================================"
echo "  Task #227 Stress Test Suite — concurrency=${CONCURRENCY} duration=${DURATION}s"
echo "========================================================"

for entry in "${TESTS[@]}"; do
  label="${entry%%|*}"
  rest="${entry#*|}"
  script="${rest%%|*}"
  args="${rest#*|}"

  echo ""
  echo "--------------------------------------------------------"
  echo "  ▶ ${label}  (${script} ${args})"
  echo "--------------------------------------------------------"

  log_file="$(mktemp -t mcc-stress-${label}.XXXXXX.log)"
  start_ts=$(date +%s)

  # shellcheck disable=SC2086
  node "$script" $args 2>&1 | tee "$log_file"
  exit_code="${PIPESTATUS[0]}"

  end_ts=$(date +%s)
  elapsed=$((end_ts - start_ts))

  status="FAIL"
  if [ "$exit_code" -eq 0 ]; then
    if grep -qE "SKIPPED|— SKIPPED" "$log_file"; then
      status="SKIPPED"
    else
      status="PASS"
    fi
  fi

  if [ "$status" = "FAIL" ]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  LABELS+=("$label")
  DURATIONS+=("$elapsed")
  RESULTS+=("$status")

  rm -f "$log_file"
done

echo ""
echo "========================================================"
echo "  Stress Test Summary"
echo "========================================================"
printf "  %-26s %10s   %s\n" "Test" "Duration" "Result"
printf "  %-26s %10s   %s\n" "----" "--------" "------"
for i in "${!LABELS[@]}"; do
  printf "  %-26s %8ss   %s\n" "${LABELS[$i]}" "${DURATIONS[$i]}" "${RESULTS[$i]}"
done
echo "========================================================"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "  ✗ ${FAIL_COUNT} test(s) FAILED"
  exit 1
fi

echo "  ✓ All tests passed (or skipped cleanly)"
exit 0
