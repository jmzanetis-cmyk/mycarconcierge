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
  # Admin portal — never ships to consumer App Store build.
  "admin"
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
  # ---- Admin portal (consumer App Store build must never include these) ----
  "admin.html"
  "admin.js"
  "admin-invite.html"
  "admin-agent-activity.js"
  "admin-audit-log.js"
  "admin-outreach.js"
  "generate-admin-hash.html"
  "iOS_App_Store_Submission_Guide.html"
  # ---- Provider-only pages & scripts ----
  "providers.html"
  "providers.js"
  "providers-jobs.js"
  "providers-bids.js"
  "providers-care-plans.js"
  "providers-core.js"
  "providers-settings.js"
  "providers-analytics.js"
  "provider-onboarding.js"
  "signup-provider.html"
  "signup-provider.js"
  "onboarding-provider.html"
  "bgc-enroll-account.html"
  "for-shops.html"
  "provider-agreement.html"
  "provider-faq.html"
  "provider-info.html"
  "provider-pilot.html"
  "car-club-provider.html"
  "founding-partner-agreement.html"
  "job-board.html"
  # ---- Fleet-operator pages (not consumer member UI) ----
  "fleet.html"
  "fleet.js"
  "fleet-driver.html"
  "fleet-join.html"
  "fleet-landing.html"
  "fleet-signup.html"
  # ---- Marketing / internal sales collateral ----
  "ad-deck.html"
  "MCC-Brand-Assets.html"
  "MCC-Brand-Assets-ES.html"
  "MCC-Provider-Brochure.html"
  "MCC-Provider-Brochure-V2.html"
  "MCC-Provider-Presentation.html"
  "MCC-Provider-Presentation-Visual.html"
  "MCC-Provider-Presentation-Visual-ES.html"
  "MCC-Services-Proposal.html"
  "MCC-Service-Credits.html"
  "member-founder-deck.html"
  "email-template.html"
  "developers.html"
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
