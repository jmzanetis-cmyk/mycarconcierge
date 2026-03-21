#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/www-ios"
SRC_DIR="$PROJECT_ROOT/www"

echo "=================================================="
echo " My Car Concierge — iOS Consumer Build"
echo "=================================================="
echo ""
echo "Step 1/5: Preparing clean consumer build directory..."
rm -rf "$BUILD_DIR"
cp -r "$SRC_DIR" "$BUILD_DIR"
echo "  Copied www/ → www-ios/"

echo ""
echo "Step 2/5: Stripping admin portal files..."

rm -f "$BUILD_DIR/admin.html"
rm -f "$BUILD_DIR/admin.js"
rm -f "$BUILD_DIR/admin-outreach.js"
rm -f "$BUILD_DIR/admin-invite.html"
rm -f "$BUILD_DIR/admin-team.js"
rm -f "$BUILD_DIR/generate-admin-hash.html"
rm -f "$BUILD_DIR/accept-invite.html"
rm -f "$BUILD_DIR/signed-agreements.html"
rm -f "$BUILD_DIR/analytics-tracker.js"
rm -f "$BUILD_DIR/hubspot-client.js"
rm -f "$BUILD_DIR/founder-dashboard.js"
rm -f "$BUILD_DIR/founder-dashboard.html"
echo "  Admin portal files removed."

echo ""
echo "Step 3/5: Stripping outreach engine, server-only, and test files..."

rm -f "$BUILD_DIR/outreach-engine-api.js"
rm -f "$BUILD_DIR/server.js"
rm -f "$BUILD_DIR/emailService.js"
rm -f "$BUILD_DIR/emailservice.js"
rm -f "$BUILD_DIR/email-template.html"
rm -f "$BUILD_DIR/simulate.js"
rm -f "$BUILD_DIR/simulate-platform.js"
rm -f "$BUILD_DIR/playwright.config.js"
rm -f "$BUILD_DIR/seed-test-data.js"
rm -f "$BUILD_DIR/stripeutils.js"
rm -f "$BUILD_DIR/stripe-treasury.js"
rm -f "$BUILD_DIR/electron.js"

rm -f "$BUILD_DIR"/stress-test*.js
rm -f "$BUILD_DIR"/stress-test*.sh

rm -f "$BUILD_DIR"/outreach-schema.sql
rm -f "$BUILD_DIR"/*.sql

rm -rf "$BUILD_DIR/netlify/"
rm -rf "$BUILD_DIR/supabase/"
rm -rf "$BUILD_DIR/migrations/"
rm -rf "$BUILD_DIR/data/"
rm -rf "$BUILD_DIR/screenshots/"
rm -rf "$BUILD_DIR/test-results/"
rm -rf "$BUILD_DIR/tests/"
rm -rf "$BUILD_DIR/twilio-screenshots/"
rm -f "$BUILD_DIR/package.json"
rm -f "$BUILD_DIR/package-lock.json"
rm -f "$BUILD_DIR/netlify.toml"
rm -f "$BUILD_DIR/.netlifyignore"
echo "  Server, outreach, and test files removed."

echo ""
echo "Step 4/5: Stripping marketing and investor documents..."

rm -f "$BUILD_DIR/ad-deck.html"
rm -f "$BUILD_DIR/MCC-Provider-Brochure.html"
rm -f "$BUILD_DIR/MCC-Provider-Brochure-V2.html"
rm -f "$BUILD_DIR/MCC-Provider-Presentation.html"
rm -f "$BUILD_DIR/MCC-Provider-Presentation-Visual.html"
rm -f "$BUILD_DIR/MCC-Provider-Presentation-Visual-ES.html"
rm -f "$BUILD_DIR/MCC-Brand-Assets.html"
rm -f "$BUILD_DIR/MCC-Brand-Assets-ES.html"
rm -f "$BUILD_DIR/member-founder-deck.html"
rm -f "$BUILD_DIR/member-founder.html"
rm -f "$BUILD_DIR/member-founder-agreement.html"
rm -f "$BUILD_DIR/My_Car_Concierge_Complete_Outline.html"
rm -f "$BUILD_DIR/iOS_App_Store_Submission_Guide.html"
rm -f "$BUILD_DIR/founding-provider-chris-agrapidis.html"
rm -f "$BUILD_DIR/founding-partner-agreement.html"
rm -f "$BUILD_DIR/MCC-Service-Credits.html"
rm -f "$BUILD_DIR/MCC-Services-Proposal.html"
rm -f "$BUILD_DIR/MCC-Brand-Assets.pdf" 2>/dev/null || true
rm -f "$BUILD_DIR/MCC-Provider-Brochure.pdf" 2>/dev/null || true
rm -f "$BUILD_DIR/MCC-Provider-Presentation.pdf" 2>/dev/null || true
rm -f "$BUILD_DIR/MCC-Founding-Provider-Agreement-Chris-Agrapidis.pdf" 2>/dev/null || true
rm -rf "$BUILD_DIR/marketing/"
rm -rf "$BUILD_DIR/docs/"
rm -rf "$BUILD_DIR/images/social/" 2>/dev/null || true
echo "  Marketing and investor files removed."

echo ""
echo "Step 5/5: Patching HTML and JS for consumer-only mode..."

if [ -f "$BUILD_DIR/members.html" ]; then
  sed -i 's|<div class="nav-item"[^>]*>.*admin\.html.*</div>||g' "$BUILD_DIR/members.html"
  echo "  members.html: Admin nav link removed."
fi

if [ -f "$BUILD_DIR/login.js" ]; then
  sed -i "s|window\.location\.href = 'admin\.html'|window.location.href = 'members.html'|g" "$BUILD_DIR/login.js"
  echo "  login.js: Admin redirect patched → members.html."
fi

if [ -f "$BUILD_DIR/index.html" ]; then
  sed -i "s|window\.location\.href = 'admin\.html'|window.location.href = 'members.html'|g" "$BUILD_DIR/index.html"
  sed -i "s|window\.location\.href = \"admin\.html\"|window.location.href = 'members.html'|g" "$BUILD_DIR/index.html"
  echo "  index.html: Admin redirect patched → members.html."
fi

if [ -f "$BUILD_DIR/mcc-config.js" ]; then
  sed -i "s|const REPLIT_API_URL = '.*'|const REPLIT_API_URL = ''|g" "$BUILD_DIR/mcc-config.js"
  echo "  mcc-config.js: Replit API URL cleared."
fi

if [ -f "$BUILD_DIR/sw.js" ]; then
  sed -i "/['\"]\/admin\.html['\"],/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/admin\.js['\"],/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/admin-outreach\.js['\"],/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/admin-team\.js['\"],/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/admin-invite\.html['\"],/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/analytics-tracker\.js['\"],/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/hubspot-client\.js['\"],/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/outreach-engine-api\.js['\"],/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/stress-test/d" "$BUILD_DIR/sw.js"
  sed -i "/['\"]\/founder-dashboard/d" "$BUILD_DIR/sw.js"
  echo "  sw.js: Admin/outreach entries removed from precache list."
fi

echo ""
echo "=================================================="
echo " Running validation checks..."
echo "=================================================="
bash "$(dirname "$0")/build-ios-check.sh" "$BUILD_DIR"

echo ""
echo "=================================================="
echo " Syncing consumer build to Capacitor..."
echo "=================================================="

ORIGINAL_WEB_DIR="$(node -e "const c=require('$PROJECT_ROOT/capacitor.config.json'); console.log(c.webDir);")"
TMP_CONFIG="$PROJECT_ROOT/.capacitor-ios-build.json"

node -e "
const cfg = require('$PROJECT_ROOT/capacitor.config.json');
cfg.webDir = 'www-ios';
const fs = require('fs');
fs.writeFileSync('$PROJECT_ROOT/capacitor.config.json', JSON.stringify(cfg, null, 2) + '\n');
"

cd "$PROJECT_ROOT"
npx cap copy ios
npx cap sync ios

node -e "
const cfg = require('$PROJECT_ROOT/capacitor.config.json');
cfg.webDir = '$ORIGINAL_WEB_DIR';
const fs = require('fs');
fs.writeFileSync('$PROJECT_ROOT/capacitor.config.json', JSON.stringify(cfg, null, 2) + '\n');
"

echo ""
echo "=================================================="
echo " Consumer iOS build complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "  1. Open Xcode:  npx cap open ios"
echo "  2. Set your Team ID in Signing & Capabilities"
echo "  3. Set version/build number (e.g., 1.0.0 / 1)"
echo "  4. Product → Archive"
echo "  5. Distribute App → App Store Connect → Upload"
echo ""
echo "Or run the full automated archive + export:"
echo "  bash $PROJECT_ROOT/build-ios.sh"
echo ""
TOTAL_FILES=$(find "$BUILD_DIR" -type f | wc -l | tr -d ' ')
echo "Consumer build: $TOTAL_FILES files in www-ios/"
