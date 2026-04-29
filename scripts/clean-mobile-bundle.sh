#!/usr/bin/env bash
# ============================================================================
# Task #215 — Strip dev-only files from the Capacitor mobile bundle.
#
# Background:
#   capacitor.config.json sets "webDir": "www", which causes `cap sync` to
#   copy the ENTIRE www/ tree (including dev-only artefacts that have no
#   business shipping in a mobile binary) into:
#     ios/App/App/public/
#     android/app/src/main/assets/public/
#
#   The Capacitor CLI does not natively support file-level include/exclude
#   filters in capacitor.config.json — so we post-process after every
#   `cap sync` to strip the cruft.
#
#   Without this script, recent runs leaked ~1.3 GB of dev cruft into the
#   iOS/Android bundles (148 MB www/node_modules, 912 MB .netlify cache,
#   plus *.bak orphan files) and committed a 1.2 MB Express dev server
#   plus an investor pitch deck (.pptx) into the Android tracked tree.
#
# Usage:
#   1. Run `npx cap sync ios` and/or `npx cap sync android` as usual.
#   2. Run `bash scripts/clean-mobile-bundle.sh` immediately after.
#   3. Then build/archive the mobile app from Xcode / Android Studio.
#
#   The script is idempotent — safe to run repeatedly. It only deletes
#   files that match the dev-cruft patterns; legitimate offline-shell
#   assets (HTML, JS, CSS, icons, manifest, service worker) are kept.
#
# When you add a new dev-only file pattern to www/, also add it here.
# ============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_PUBLIC="$ROOT_DIR/ios/App/App/public"
ANDROID_PUBLIC="$ROOT_DIR/android/app/src/main/assets/public"

# Untracked cruft that gets re-copied every `cap sync` from www/
CRUFT_DIRS=(
  "node_modules"
  ".netlify"
  ".netlify-deploy"
)

# Specific files that must never ship in a mobile bundle
CRUFT_FILES=(
  "server.js"
  "server.js.backup"
  "members.js.bak"
  "package.json"
  "package-lock.json"
  "replit.md"
  "My_Car_Concierge_Complete_Outline.html"
  "My_Car_Concierge_Investor_Deck.pptx"
  "SERVICE_SCHEDULING_SETUP.sql"
  "commission-system-sql.sql"
  "leaderboard_migration.sql"
)

# Glob patterns to sweep (find -name)
CRUFT_GLOBS=(
  "*.bak"
  "*.backup"
  "*.sql"
  "*.pptx"
)

clean_target() {
  local target="$1"
  local label="$2"
  if [ ! -d "$target" ]; then
    echo "  (skip) $label public dir does not exist: $target"
    return
  fi
  local before_kb
  before_kb=$(du -sk "$target" 2>/dev/null | awk '{print $1}')

  for d in "${CRUFT_DIRS[@]}"; do
    if [ -d "$target/$d" ]; then
      echo "  rm -rf $label/$d"
      rm -rf "${target:?}/$d"
    fi
  done

  for f in "${CRUFT_FILES[@]}"; do
    if [ -e "$target/$f" ]; then
      echo "  rm    $label/$f"
      rm -f "$target/$f"
    fi
  done

  for g in "${CRUFT_GLOBS[@]}"; do
    while IFS= read -r -d '' f; do
      echo "  rm    $label/${f#"$target"/} (glob: $g)"
      rm -f "$f"
    done < <(find "$target" -type f -name "$g" -print0 2>/dev/null)
  done

  local after_kb
  after_kb=$(du -sk "$target" 2>/dev/null | awk '{print $1}')
  local saved_mb=$(( (before_kb - after_kb) / 1024 ))
  printf "  %-12s before: %d KB → after: %d KB (freed %d MB)\n" \
         "$label total:" "$before_kb" "$after_kb" "$saved_mb"
}

echo "Stripping dev-only files from Capacitor mobile bundles..."
echo
echo "iOS bundle:"
clean_target "$IOS_PUBLIC" "ios"
echo
echo "Android bundle:"
clean_target "$ANDROID_PUBLIC" "android"
echo
echo "Done. Build/archive the mobile app from Xcode / Android Studio next."
