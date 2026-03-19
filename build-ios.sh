#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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

echo "[1/6] Syncing and stripping web assets for consumer iOS build..."
bash "$SCRIPT_DIR/scripts/ios-build.sh"

echo "[2/6] Installing CocoaPods dependencies..."
(cd ios/App && pod install)

echo "[3/6] Creating build directory..."
mkdir -p build

echo "[4/6] Cleaning build folder..."
xcodebuild clean \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -quiet

echo "[5/6] Archiving..."
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  CODE_SIGN_STYLE=Automatic \
  -quiet

echo "[6/6] Exporting IPA for App Store upload..."
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -quiet

echo ""
echo "Build complete. IPA is at: $EXPORT_PATH"
echo "Upload to App Store Connect using Transporter or 'xcrun altool'."
