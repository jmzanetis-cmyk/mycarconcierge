#!/usr/bin/env bash
set -euo pipefail

SCHEME="App"
WORKSPACE="ios/App/App.xcworkspace"
ARCHIVE_PATH="build/MyCarConcierge.xcarchive"
EXPORT_PATH="build/export"
EXPORT_OPTIONS="ios/ExportOptions.plist"

echo "=== My Car Concierge — iOS App Store Build ==="
echo ""
echo "Prerequisites:"
echo "  1. macOS with Xcode 15+ installed"
echo "  2. Apple Developer account with valid signing certificates"
echo "  3. Update REPLACE_WITH_TEAM_ID in ios/ExportOptions.plist with your Apple Team ID"
echo "     (find it at https://developer.apple.com/account → Membership Details)"
echo ""

echo "[1/5] Syncing web assets into iOS project..."
npx cap sync ios

echo "[2/5] Installing CocoaPods dependencies..."
(cd ios/App && pod install)

echo "[3/5] Cleaning build folder..."
xcodebuild clean \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -quiet

echo "[4/5] Archiving..."
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  CODE_SIGN_STYLE=Automatic \
  -quiet

echo "[5/5] Exporting IPA for App Store upload..."
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -quiet

echo ""
echo "Build complete. IPA is at: $EXPORT_PATH"
echo "Upload to App Store Connect using Transporter or 'xcrun altool'."
