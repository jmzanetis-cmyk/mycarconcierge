# ============================================================================
# Shared cruft + required-file lists for the Capacitor mobile bundle.
#
# Sourced by both:
#   scripts/clean-mobile-bundle.sh   — strips these from ios/android public
#   scripts/verify-mobile-bundle.sh  — fails the build if any are present
#
# Single source of truth — when you add a new dev-only file pattern, edit it
# here once and both scripts stay in lock-step.
# ============================================================================

# Untracked dev cruft that gets re-copied every `cap sync` from www/
MOBILE_CRUFT_DIRS=(
  "node_modules"
  ".netlify"
  ".netlify-deploy"
  "tests"
  "test-results"
  "playwright-report"
  # Marketing / dev-only asset trees — referenced by public website pages,
  # but the mobile app loads from server.url at runtime so these are dead
  # weight in the offline fallback bundle.
  "social-media"
  "docs"
  "screenshots"
  # SQL migrations — applied via Supabase tooling, never read by the app.
  "migrations"
  "supabase-migrations"
  # One-off internal reference page.
  "ref"
)

# Specific files that must never ship in a mobile bundle
MOBILE_CRUFT_FILES=(
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
  "seed-test-data.js"
  # Replit-dev configs — capacitor.config.json at the repo root drives the
  # native build; the copy that lands inside public/ is never read at runtime.
  "capacitor.config.json"
  "playwright.config.js"
  ".eslintrc.json"
)

# Glob patterns to sweep recursively (find -name)
MOBILE_CRUFT_GLOBS=(
  "*.bak"
  "*.backup"
  "*.sql"
  "*.pptx"
  # Marketing PDFs (brand assets, brochures, investor deck, founder program,
  # bid packs). These are linked from the public website and downloaded
  # on-demand from the live origin; they do not need to ship in the
  # offline fallback bundle.
  "*.pdf"
  "stress-test-*.js"
  "*.test.js"
  "*.spec.js"
)

# Offline-shell essentials — every Capacitor mobile bundle MUST contain these
# so the splash + fallback page can render when the device is offline.
MOBILE_REQUIRED_FILES=(
  "index.html"
  "manifest.json"
  "sw.js"
  "login.html"
)
