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
  # CORRECTED 2026-09-16: the original note here said "the mobile app loads
  # from server.url at runtime" — that stopped being true on 2026-06-09
  # (commit 7495414, "fix(ios): Phase 1 — remove server.url, ship bundled
  # assets (Guideline 4.2)"), and this file was never updated to match.
  # These marketing asset trees are excluded on a narrower, still-valid
  # basis: nothing in the shipped app (providers.html/providers-core.js/
  # providers-settings.js/index.html/login.html, checked directly) links to
  # them by a relative in-app path — only the public website's own pages
  # reference them, and any outbound link from inside the app is an
  # absolute https://www.mycarconcierge.com/... URL (same pattern the
  # 7495414 fix relied on for API calls), unaffected by server.url being
  # gone. Re-verify this if a new in-app feature ever links into one of
  # these trees with a relative path.
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
  # ---- Provider PRE-SIGNUP / marketing / legal pages only ----
  # CORRECTED 2026-09-16: this block used to also list providers.html and
  # every core provider-dashboard file (providers-core.js,
  # providers-settings.js, providers-care-plans.js, providers-jobs.js,
  # providers-bids.js, providers-analytics.js, provider-onboarding.js,
  # car-club-provider.html, job-board.html) as "dead weight" under the
  # same now-stale server.url assumption above. That was wrong even on its
  # own terms: www/login.html and www/index.html — both REQUIRED files —
  # explicitly redirect any profile.role === 'provider' straight to
  # providers.html on login, so stripping it (and everything it loads,
  # statically via <script src> or dynamically via providers-core.js's
  # loadModule('bids'/'jobs'/'analytics')) left every provider who opened
  # the native app with a dead redirect target. Verified directly (grep
  # against the shipped app files, not assumed) before removing them from
  # this list — see the corrected MOBILE_CRUFT_FILES entries below, which
  # keep ONLY the files confirmed to have zero references from
  # providers.html/providers-core.js/providers-settings.js/index.html/
  # login.html: pages a prospective provider sees on the public website
  # before they have the app installed, not anything the already-logged-in
  # native app ever navigates to.
  "signup-provider.html"
  "signup-provider.js"
  "onboarding-provider.html"
  "bgc-enroll-account.html"
  "for-shops.html"
  "provider-agreement.html"
  "provider-faq.html"
  "provider-info.html"
  "provider-pilot.html"
  "founding-partner-agreement.html"
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
  # admin.js was split into domain files (admin-core.js, admin-analytics.js,
  # etc.) on 2026-09-18 — glob catches all of them plus any added later,
  # instead of hardcoding each one into MOBILE_CRUFT_FILES below.
  "admin-*.js"
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
