#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/www-ios}"

if [ ! -d "$BUILD_DIR" ]; then
  echo "ERROR: Build directory not found: $BUILD_DIR"
  echo "Run scripts/build-ios.sh first."
  exit 1
fi

echo "Validating consumer iOS build at: $BUILD_DIR"
echo ""

PASS=0
WARN=0
FAIL=0

check_pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
check_warn() { echo "  WARN: $1"; WARN=$((WARN + 1)); }
check_fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "[1] Checking for admin files..."
ADMIN_FILES=()
for f in admin.html admin.js admin-outreach.js admin-team.js admin-invite.html \
          generate-admin-hash.html accept-invite.html signed-agreements.html \
          founder-dashboard.html founder-dashboard.js; do
  [ -f "$BUILD_DIR/$f" ] && ADMIN_FILES+=("$f")
done
if [ ${#ADMIN_FILES[@]} -eq 0 ]; then
  check_pass "No admin files present"
else
  for f in "${ADMIN_FILES[@]}"; do
    check_fail "Admin file present: $f"
  done
fi

echo ""
echo "[2] Checking for outreach engine files..."
OUTREACH_FILES=()
for f in outreach-engine-api.js outreach-engine-core.js outreach-schema.sql; do
  [ -f "$BUILD_DIR/$f" ] && OUTREACH_FILES+=("$f")
done
if [ ${#OUTREACH_FILES[@]} -eq 0 ]; then
  check_pass "No outreach engine files present"
else
  for f in "${OUTREACH_FILES[@]}"; do
    check_fail "Outreach file present: $f"
  done
fi

echo ""
echo "[3] Checking for server-only files..."
SERVER_FILES=()
for f in server.js emailService.js emailservice.js simulate.js simulate-platform.js \
          playwright.config.js seed-test-data.js electron.js; do
  [ -f "$BUILD_DIR/$f" ] && SERVER_FILES+=("$f")
done
if [ ${#SERVER_FILES[@]} -eq 0 ]; then
  check_pass "No server-only files present"
else
  for f in "${SERVER_FILES[@]}"; do
    check_fail "Server file present: $f"
  done
fi

echo ""
echo "[4] Checking for stress-test files..."
STRESS_FILES=$(find "$BUILD_DIR" -maxdepth 1 -name "stress-test*.js" 2>/dev/null || true)
if [ -z "$STRESS_FILES" ]; then
  check_pass "No stress-test files present"
else
  check_fail "Stress-test files still present: $(echo "$STRESS_FILES" | xargs -I{} basename {})"
fi

echo ""
echo "[5] Checking for SQL files..."
SQL_FILES=$(find "$BUILD_DIR" -name "*.sql" 2>/dev/null || true)
if [ -z "$SQL_FILES" ]; then
  check_pass "No SQL files present"
else
  check_fail "SQL files still present in build: $SQL_FILES"
fi

echo ""
echo "[6] Checking for admin-route references in HTML/JS files..."
ADMIN_REFS=$(grep -rl "admin\.html" "$BUILD_DIR"/*.html "$BUILD_DIR"/*.js 2>/dev/null || true)
if [ -z "$ADMIN_REFS" ]; then
  check_pass "No admin.html references in consumer HTML/JS"
else
  for ref in $ADMIN_REFS; do
    BASENAME=$(basename "$ref")
    check_fail "admin.html reference found in: $BASENAME"
  done
fi

echo ""
echo "[7] Checking for marketing/investor documents..."
MARKETING_FILES=()
for f in ad-deck.html member-founder-deck.html \
          MCC-Provider-Brochure.html MCC-Provider-Brochure-V2.html \
          MCC-Provider-Presentation.html MCC-Provider-Presentation-Visual.html \
          MCC-Brand-Assets.html member-founder.html \
          My_Car_Concierge_Complete_Outline.html; do
  [ -f "$BUILD_DIR/$f" ] && MARKETING_FILES+=("$f")
done
if [ ${#MARKETING_FILES[@]} -eq 0 ]; then
  check_pass "No marketing/investor documents present"
else
  for f in "${MARKETING_FILES[@]}"; do
    check_fail "Marketing file present: $f"
  done
fi

echo ""
echo "[8] Checking for netlify directory..."
if [ ! -d "$BUILD_DIR/netlify" ]; then
  check_pass "No netlify/ directory in build"
else
  check_fail "netlify/ directory still present in iOS build"
fi

echo ""
echo "[9] Checking admin redirect patches..."
if [ -f "$BUILD_DIR/login.js" ]; then
  if grep -q "window\.location\.href = 'admin\.html'" "$BUILD_DIR/login.js" 2>/dev/null; then
    check_fail "login.js still redirects to admin.html — patch did not apply"
  else
    check_pass "login.js admin redirect patched"
  fi
else
  check_warn "login.js not found in build directory"
fi

echo ""
echo "[10] Checking required consumer files are present..."
REQUIRED_FILES=(members.html members.js login.html signup-member.html onboarding-member.html \
                members-core.js members-vehicles.js members-push.js biometric-auth.js \
                sw.js manifest.json mcc-config.js supabaseclient.js)
MISSING_REQUIRED=()
for f in "${REQUIRED_FILES[@]}"; do
  [ ! -f "$BUILD_DIR/$f" ] && MISSING_REQUIRED+=("$f")
done
if [ ${#MISSING_REQUIRED[@]} -eq 0 ]; then
  check_pass "All required consumer files present"
else
  for f in "${MISSING_REQUIRED[@]}"; do
    check_fail "Required consumer file missing: $f"
  done
fi

echo ""
echo "=================================================="
TOTAL_FILES=$(find "$BUILD_DIR" -type f | wc -l | tr -d ' ')
echo "Total files in build: $TOTAL_FILES"
echo "Results: $PASS passed, $WARN warnings, $FAIL failed"
echo "=================================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BUILD CHECK FAILED — $FAIL check(s) did not pass."
  echo "Fix the issues above before submitting to the App Store."
  exit 1
else
  echo ""
  echo "BUILD CHECK PASSED — Consumer build is clean."
  exit 0
fi
