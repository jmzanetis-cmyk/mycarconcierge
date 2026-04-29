#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_PUBLIC="$PROJECT_ROOT/ios/App/App/public"

echo "=== My Car Concierge iOS Build ==="
echo "Syncing web assets and stripping admin/marketing files..."

cd "$PROJECT_ROOT"
npx cap sync ios

echo "Stripping shared dev-only cruft (clean-mobile-bundle.sh)..."
bash "$PROJECT_ROOT/scripts/clean-mobile-bundle.sh"

echo "Removing admin portal files..."
rm -f "$IOS_PUBLIC/admin.html"
rm -f "$IOS_PUBLIC/admin.js"
rm -f "$IOS_PUBLIC/admin-outreach.js"
rm -f "$IOS_PUBLIC/admin-invite.html"
rm -f "$IOS_PUBLIC/admin-team.js"
rm -f "$IOS_PUBLIC/generate-admin-hash.html"
rm -f "$IOS_PUBLIC/accept-invite.html"
rm -f "$IOS_PUBLIC/signed-agreements.html"
rm -f "$IOS_PUBLIC/analytics-tracker.js"
rm -f "$IOS_PUBLIC/hubspot-client.js"

echo "Removing outreach engine files..."
rm -f "$IOS_PUBLIC/outreach-engine-api.js"
rm -f "$IOS_PUBLIC/outreach-engine-core.js"
rm -f "$IOS_PUBLIC/outreach-schema.sql"

echo "Removing all SQL migration files..."
rm -f "$IOS_PUBLIC"/*.sql
rm -rf "$IOS_PUBLIC/migrations/"
rm -rf "$IOS_PUBLIC/supabase-migrations/"

echo "Removing marketing and investor docs..."
rm -f "$IOS_PUBLIC/ad-deck.html"
rm -f "$IOS_PUBLIC/MCC-Provider-Brochure.html"
rm -f "$IOS_PUBLIC/MCC-Provider-Brochure.pdf"
rm -f "$IOS_PUBLIC/MCC-Provider-Brochure-V2.html"
rm -f "$IOS_PUBLIC/MCC-Provider-Presentation.html"
rm -f "$IOS_PUBLIC/MCC-Provider-Presentation.pdf"
rm -f "$IOS_PUBLIC/MCC-Provider-Presentation-Visual.html"
rm -f "$IOS_PUBLIC/MCC-Provider-Presentation-Visual-ES.html"
rm -f "$IOS_PUBLIC/MCC-Brand-Assets.html"
rm -f "$IOS_PUBLIC/MCC-Brand-Assets.pdf"
rm -f "$IOS_PUBLIC/member-founder-deck.html"
rm -f "$IOS_PUBLIC/My_Car_Concierge_Complete_Outline.html"
rm -f "$IOS_PUBLIC/My_Car_Concierge_Investor_Deck.pptx"
rm -f "$IOS_PUBLIC/iOS_App_Store_Submission_Guide.html"
rm -rf "$IOS_PUBLIC/docs/"
rm -rf "$IOS_PUBLIC/marketing/"

echo "Removing data directory..."
rm -rf "$IOS_PUBLIC/data/"

echo "Removing netlify directory..."
rm -rf "$IOS_PUBLIC/netlify/"

echo "Removing server-only files..."
rm -f "$IOS_PUBLIC/server.js"
rm -f "$IOS_PUBLIC/simulate.js"
rm -f "$IOS_PUBLIC/playwright.config.js"
rm -f "$IOS_PUBLIC/emailservice.js"
rm -f "$IOS_PUBLIC/emailService.js"
rm -f "$IOS_PUBLIC/email-template.html"

echo "Patching members.html (removing Admin Portal nav item)..."
if [ -f "$IOS_PUBLIC/members.html" ]; then
  sed -i '/<div class="nav-item".*admin\.html/d' "$IOS_PUBLIC/members.html"
fi

echo "Patching login.js (redirect admins to members dashboard)..."
if [ -f "$IOS_PUBLIC/login.js" ]; then
  sed -i "s|window\.location\.href = 'admin\.html'|window.location.href = 'members.html'|g" "$IOS_PUBLIC/login.js"
fi

echo "Patching sw.js (removing admin files from precache)..."
if [ -f "$IOS_PUBLIC/sw.js" ]; then
  sed -i "/['\"]\/admin\.html['\"],/d" "$IOS_PUBLIC/sw.js"
  sed -i "/['\"]\/admin\.js['\"],/d" "$IOS_PUBLIC/sw.js"
  sed -i "/['\"]\/admin-outreach\.js['\"],/d" "$IOS_PUBLIC/sw.js"
  sed -i "/['\"]\/admin-team\.js['\"],/d" "$IOS_PUBLIC/sw.js"
  sed -i "/['\"]\/admin-invite\.html['\"],/d" "$IOS_PUBLIC/sw.js"
  sed -i "/['\"]\/analytics-tracker\.js['\"],/d" "$IOS_PUBLIC/sw.js"
  sed -i "/['\"]\/hubspot-client\.js['\"],/d" "$IOS_PUBLIC/sw.js"
  sed -i "/['\"]\/outreach-engine-api\.js['\"],/d" "$IOS_PUBLIC/sw.js"
  sed -i "/['\"]\/stress-test.*\.js['\"],/d" "$IOS_PUBLIC/sw.js"
fi

echo "Patching index.html (removing admin redirect)..."
if [ -f "$IOS_PUBLIC/index.html" ]; then
  sed -i "s|window\.location\.href = 'admin\.html'|window.location.href = 'members.html'|g" "$IOS_PUBLIC/index.html"
fi

echo "Patching mcc-config.js (removing Replit API URL for iOS)..."
if [ -f "$IOS_PUBLIC/mcc-config.js" ]; then
  sed -i "s|const REPLIT_API_URL = '.*'|const REPLIT_API_URL = ''|g" "$IOS_PUBLIC/mcc-config.js"
fi

echo "Removing additional internal files..."
rm -f "$IOS_PUBLIC/stripeutils.js"
rm -f "$IOS_PUBLIC/car-club-api.js"
rm -f "$IOS_PUBLIC/stress-test-analytics.js"
rm -f "$IOS_PUBLIC/stress-test-outreach.js"
rm -rf "$IOS_PUBLIC/images/social/"
rm -rf "$IOS_PUBLIC/screenshots/"
rm -f "$IOS_PUBLIC/package.json"
rm -f "$IOS_PUBLIC/package-lock.json"
rm -f "$IOS_PUBLIC/.netlifyignore"
rm -f "$IOS_PUBLIC/netlify.toml"
rm -f "$IOS_PUBLIC/capacitor.config.json"
rm -f "$IOS_PUBLIC/electron.js"

echo ""
echo "=== Verification ==="
ADMIN_REFS=$(grep -rl "admin\.html" "$IOS_PUBLIC"/*.html "$IOS_PUBLIC"/*.js 2>/dev/null || true)
if [ -n "$ADMIN_REFS" ]; then
  echo "WARNING: Admin references found in:"
  echo "$ADMIN_REFS"
else
  echo "PASS: No admin.html references in consumer pages"
fi

ADMIN_FILES=$(ls "$IOS_PUBLIC"/admin*.html "$IOS_PUBLIC"/admin*.js "$IOS_PUBLIC"/generate-admin-hash.html 2>/dev/null || true)
if [ -n "$ADMIN_FILES" ]; then
  echo "WARNING: Admin files still present:"
  echo "$ADMIN_FILES"
else
  echo "PASS: No admin files in iOS build"
fi

SQL_FILES=$(find "$IOS_PUBLIC" -name "*.sql" 2>/dev/null || true)
if [ -n "$SQL_FILES" ]; then
  echo "WARNING: SQL files still present:"
  echo "$SQL_FILES"
else
  echo "PASS: No SQL files in iOS build"
fi

REPLIT_URL=$(grep -l "replit\.app" "$IOS_PUBLIC/mcc-config.js" 2>/dev/null || true)
if [ -n "$REPLIT_URL" ]; then
  echo "WARNING: Replit API URL still present in mcc-config.js"
else
  echo "PASS: Replit API URL removed from mcc-config.js"
fi

TOTAL_FILES=$(find "$IOS_PUBLIC" -type f | wc -l)
echo ""
echo "=== Build Complete ==="
echo "Total files in iOS build: $TOTAL_FILES"
echo "Ready for Xcode archive at: ios/App/App.xcworkspace"
