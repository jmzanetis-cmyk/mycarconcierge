#!/usr/bin/env bash
# ============================================================================
# Task #219 — Verify the Capacitor mobile bundle is clean and complete.
#
# Run this AFTER scripts/clean-mobile-bundle.sh (or `npm run cap:sync`,
# which chains everything automatically). Two assertions per platform:
#
#   1. Every file in MOBILE_REQUIRED_FILES exists (offline shell intact)
#   2. No file matches MOBILE_CRUFT_DIRS/FILES/GLOBS (no dev cruft leaked)
#
# Exit codes:
#   0  — both bundles clean and complete
#   1  — one or more assertions failed (build must not ship)
#
# This is the safety net that catches mistakes humans would otherwise
# make: forgetting to run the cleaner, accidentally committing a
# dev-only file under ios/ or android/, etc.
# ============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_PUBLIC="$ROOT_DIR/ios/App/App/public"
ANDROID_PUBLIC="$ROOT_DIR/android/app/src/main/assets/public"

# Load shared cruft + required-file lists (single source of truth)
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/mobile-bundle-cruft.sh"

PASS=0
FAIL=0
FAILURES=()
TARGETS_VERIFIED=0

check_pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
check_fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); FAILURES+=("$1"); }

verify_target() {
  local target="$1"
  local label="$2"
  echo
  echo "[$label] $target"
  if [[ ! -d "$target" ]]; then
    echo "  (skip) public dir does not exist — likely no \`cap sync\` has been"
    echo "         run for this platform yet on this machine. Not a failure;"
    echo "         the cross-target check below will fail loudly if BOTH are"
    echo "         missing (i.e. nothing was ever synced)."
    return
  fi
  TARGETS_VERIFIED=$((TARGETS_VERIFIED + 1))

  # --- Assertion 1: required offline-shell files present ---
  for f in "${MOBILE_REQUIRED_FILES[@]}"; do
    if [[ -f "$target/$f" ]]; then
      check_pass "required file present: $f"
    else
      check_fail "[$label] required offline-shell file MISSING: $f"
    fi
  done

  # --- Assertion 2: no forbidden directories (local count, not global) ---
  local found_dirs=0
  for d in "${MOBILE_CRUFT_DIRS[@]}"; do
    if [[ -d "$target/$d" ]]; then
      check_fail "[$label] forbidden directory present: $d/"
      found_dirs=$((found_dirs + 1))
    fi
  done
  if [[ "$found_dirs" -eq 0 ]]; then
    check_pass "no forbidden directories"
  fi

  # --- Assertion 3: no forbidden specific files (local count, not global) ---
  local found_files=0
  for f in "${MOBILE_CRUFT_FILES[@]}"; do
    if [[ -e "$target/$f" ]]; then
      check_fail "[$label] forbidden file present: $f"
      found_files=$((found_files + 1))
    fi
  done
  if [[ "$found_files" -eq 0 ]]; then
    check_pass "no forbidden named files"
  fi

  # --- Assertion 4: no files matching forbidden globs ---
  local glob_hits=()
  for g in "${MOBILE_CRUFT_GLOBS[@]}"; do
    while IFS= read -r -d '' hit; do
      glob_hits+=("${hit#"$target/"} (matches $g)")
    done < <(find "$target" -type f -name "$g" -print0 2>/dev/null)
  done
  if [[ "${#glob_hits[@]}" -eq 0 ]]; then
    check_pass "no forbidden glob matches"
  else
    for hit in "${glob_hits[@]}"; do
      check_fail "[$label] forbidden glob match: $hit"
    done
  fi
}

echo "Verifying Capacitor mobile bundles..."

verify_target "$IOS_PUBLIC" "ios"
verify_target "$ANDROID_PUBLIC" "android"

# Cross-target: at least one bundle must have been synced. If both public
# dirs are missing, nothing was ever built — fail loudly so a CI-style
# build pipeline doesn't quietly green-light an empty release.
if [[ "$TARGETS_VERIFIED" -eq 0 ]]; then
  echo
  check_fail "no mobile bundle exists — both ios/App/App/public/ AND android/app/src/main/assets/public/ are missing. Run 'npm run cap:sync' first."
fi

echo
echo "=================================================="
echo "Results: $PASS passed, $FAIL failed"
echo "=================================================="

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "MOBILE BUNDLE VERIFY FAILED — $FAIL check(s) did not pass:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  echo
  echo "Fix:"
  echo "  - Required file missing? Restore it under www/ and re-run 'npm run cap:sync'."
  echo "  - Forbidden file present? Run 'bash scripts/clean-mobile-bundle.sh'."
  echo "  - Pattern not on the cruft list? Add it to scripts/lib/mobile-bundle-cruft.sh."
  exit 1
fi

echo "MOBILE BUNDLE VERIFY PASSED — both bundles are clean and complete."
exit 0
