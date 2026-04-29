# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace PWA with native app support. It connects vehicle owners with service providers for booking, payments, and vehicle management, aiming to be a comprehensive solution for car ownership. The platform focuses on security, user experience, service coordination, and smart shopping tools, providing a full-service experience for auto care. The business vision is to become the complete auto ownership platform.

## User Preferences
- **Brand Messaging**: "Your complete auto ownership platform"
- **Tone**: Professional, informative, memorable, and witty without being gimmicky
- **Key Headlines**: "One app. Every auto need. Zero hassle."
- **Four Pillars**: Get Quotes, Manage Vehicles, Maintaining Your Ride, Shop Smarter
- **Copy Terminology**: Use "auto" for general references (auto care, auto ownership), "ride" for casual/friendly tone (your ride, your next ride), "vehicle" for formal contexts (vehicle owners). Brand name "My Car Concierge" stays unchanged.
- **Automotive Theme**: Warmer dark slate backgrounds (#12161c) with bronze/copper gold accents and coolant teal highlights; premium, luxury garage-inspired aesthetic with metallic gradients on buttons and cards; less harsh dark mode with improved contrast and depth.
- **Light Mode**: Navy blue #1e3a5f for trust, deeper gold #b8942d for 23% higher CTA contrast, warmer off-white #fefdfb for approachability. WCAG-compliant text contrast with white button text on gold.
- **Theme Toggle**: Pill-shaped button with sun/moon icons and "Day"/"Night" text labels in header/navbar for clear accessibility.
- **Languages**: English, Spanish, French, Greek, Chinese, Hindi, Arabic (RTL supported).

## System Architecture
The application is built with a modern web stack (vanilla HTML, CSS, JS) and utilizes PWA capabilities for web, Capacitor for mobile, and Electron for desktop.

Key architectural patterns and features include:
- **PWA Features**: Installability, offline support, and auto-updates.
- **User Roles**: Supports `member`, `provider`, `pending_provider`, and `admin` roles, including dual roles.
- **Authentication**: Two-Factor Authentication (2FA), Sign in with Apple, and Magic Link.
- **Account & Team Management**: Self-service account deletion and provider team management with role-based access.
- **Service Coordination**: Appointment scheduling, vehicle transfer tracking, and temporary location sharing.
- **Provider Management**: Rating system, automated suspension, employee background checks, and compliance tracking.
- **Vehicle Tools**: "My Next Car" (prospective purchases with VIN lookup) and "Dream Car Finder" (AI-powered search).
- **AI Features**: OCR for insurance cards, AI explanations for OBD codes, AI bid analysis, AI Helpdesk, AI review summarization, AI fair price estimator, AI package builder, AI bid strategy insights, and AI provider matching.
- **Notification System**: User-controlled push, email, and SMS notifications, including automated reminders.
- **E-commerce**: Integrated Merch Store.
- **Lead Capture**: Public survey page for prospect lead generation with analytics dashboard.
- **Referral & Commission System**: Founder referral program with lifetime commissions.
- **Payment System**: Care plan completion lifecycle with member-side complete & dispute endpoints, admin oversight, AI-assisted dispute resolution, and Stripe Connect escrow integration for holding and releasing funds.
- **SaaS Billing Foundation**: Configurable plans, access control, and subscription management.
- **White-label Platform**: Custom branding, domains, and plan limits for tenants.
- **Fleet SaaS**: Subscription management for fleets with vehicle/driver limits and invitation systems.
- **Provider Shop SaaS**: Shop management platform with public profiles, embeddable booking widget, loyalty clubs, and kiosks.
- **Automotive AI API**: Developer API for VIN lookup, recalls, OBD codes, and price estimation.
- **Outreach Engine SaaS**: Plan-based lead limits for an autonomous outreach platform, including lead discovery, scoring, outreach pipeline, Google Places API integration, and compliance guardrails.
- **Job Workflow**: Member QR check-in and provider confirmation.
- **Analytics**: Provider and Admin dashboards with traffic monitoring.
- **Security**: API Rate Limiting, Login Activity Log, server-side gating for privileged mutations, and admin audit logs.
- **Mobile Native Features**: Biometric Login, Mobile Wallet Payments, and FCM Push Notifications.
- **UI/UX Decisions**: Responsive design, hero sections, trust badges, signup progress indicators, onboarding checklists, specific color schemes, and theme toggle.
- **Performance Optimizations**: Lazy-loaded JS modules, preconnect, enhanced service worker caching, server-side pagination, and image lazy loading.
- **AI Ops Agent Fleet**: Multi-agent system (Orchestrator, Analyst, Matchmaker, Treasurer, Gatekeeper, Concierge, Advocate, Hunter) for autonomous administration, social acquisition, and dispute resolution. Includes a supervised rollout for the Gatekeeper agent.
- **Conversational Onboarding**: Progressive profiling signup flows for members and providers.
- **Service Categories**: Property-based service category including Snow Removal Services.
- **Car Club Loyalty System**: Per-provider loyalty clubs with punch card rewards.
- **Smart Service Recommendations**: AI-driven service suggestions based on vehicle make/model.
- **AI Helpdesk Widget**: Anthropic Claude-powered chat with Car Expert, Provider Support, and Car Academy modes.
- **Anthropic Model Health Check**: `netlify/functions/anthropic-health-scheduled.js` pings every Claude model listed in `MODELS_IN_USE` with a 1-token probe daily at 04:00 UTC. Failures (e.g. `model_not_found` after a deprecation) write to `ai_action_log` and trigger a Resend alert to `ADMIN_EMAIL`. On-demand: `POST` with `x-admin-password` header. When rotating Claude model literals in production code, also update `MODELS_IN_USE` in that file.
- **AI Marketing Hub**: Admin portal section for AI-powered marketing and business development, including content generation, email campaigns, campaign strategy, and fundraising modules. Integrates research and outreach agents.
- **Blog (`/blog/`)**: SEO-driven editorial pillar with evergreen posts, static HTML generation, JSON-LD, SEO meta injection, and sitemap generation.
- **Provider Onboarding Walkthrough**: 7-step interactive guided tour for new providers.
- **E2E Testing**: Playwright with system Chromium for automated testing.
- **Mobile App Architecture**: Capacitor apps load from live URL (`mycarconcierge.com`). Note: a stale dev-only tree at `www-ios/` (frozen March 2026 snapshot of `www/` with `webDir: "."`) was removed as a 1.2 GB local-only cleanup; the `.gitignore` entry for `www-ios/` remains harmless and prevents accidental re-tracking if a future build tool re-creates the path.
- **Capacitor Bundle Hygiene**: `capacitor.config.json` sets `webDir: "www"` and the Capacitor CLI has no native include/exclude filter — every `cap sync` would otherwise copy the entire `www/` tree (including `node_modules/`, `.netlify/` cache, `*.bak` orphans, `server.js`, and similar dev-only cruft) into `ios/App/App/public/` and `android/app/src/main/assets/public/`. **Always run `npm run cap:sync`** instead of raw `npx cap sync`: it chains three steps automatically — `npx cap sync` → `bash scripts/clean-mobile-bundle.sh` (strips dev cruft) → `bash scripts/verify-mobile-bundle.sh` (asserts the offline-shell essentials are present AND no forbidden patterns leaked through). The verifier exits non-zero on any failure, so the chain stops the build before bad bytes can ship. `npm run cap:sync:raw` is a debug-only escape hatch (use only when diagnosing the wrapper itself, never for normal builds — it intentionally skips the cleaner and verifier); `npm run mobile:clean` and `npm run mobile:verify` are also exposed for ad-hoc use. `scripts/ios-build.sh` (the iOS App Store build flow under `npm run ios:prep` / `ios:store`) also invokes the cleaner on top of its own iOS-specific stripping so the safety net works for both flows. The cruft + required-file lists live in `scripts/lib/mobile-bundle-cruft.sh` (single source of truth — both the cleaner and the verifier source it). When you add a new dev-only file pattern under `www/`, edit that lib file ONCE and also mirror the pattern into `.gitignore`. Initial cleanup (Task #215) freed 1.34 GB locally and removed 9 tracked dev-only files (the 1.2 MB Express dev `server.js`, the investor pitch deck `.pptx`, three SQL migration files, an internal product outline, plus stale `package.json`/`package-lock.json`/`replit.md` copies) that had leaked into the Android bundle through past `cap sync` + `git add` cycles.
- **MCC Verified Launch Broadcast**: One-shot Resend broadcast (`scripts/send-bgc-launch-broadcast.js`) for the BGC launch announcement. Segments members vs providers off `profiles.role`, renders `www/email-templates/bgc-launch-{customer,provider}.html` with `first_name` / `provider_name` / `browse_url` / `get_verified_url` / `unsubscribe_url`, honors three suppression sources (`email_unsubscribes`, `outreach_leads.status IN ('unsubscribed','bounced')`, and `member_notification_preferences.marketing_emails=false`), dedupes against prior runs via `bgc_launch_email_sends`, and adds `List-Unsubscribe` / `List-Unsubscribe-Post: One-Click` headers. CLI flags: `--audience`, `--dry-run`, `--preview-to`, `--limit`, `--rate`. Apply `www/migrations/launch_email_broadcast.sql` first. The existing `/unsubscribe` handler and Resend webhook (`www/outreach-engine-api.js`) now mirror unsubscribes/bounces/complaints into `email_unsubscribes` and update `bgc_launch_email_sends` lifecycle status. Offline coverage: `scripts/bgc-launch-broadcast-smoke.js` exercises segmentation, suppression, dedupe, merge vars, failure handling, and dry-run with no DB or network access.
- **Server Stability**: Uncaught exception/rejection handlers, EADDRINUSE retry logic, graceful shutdown.
- **Deployment Architecture**: GitHub for source control, Netlify for production hosting, Replit for development.

## External Dependencies
- **Supabase**: Backend as a Service (PostgreSQL, authentication, storage).
- **Stripe**: Payment processing (Stripe Connect).
- **Capacitor**: Cross-platform native runtime.
- **Electron**: Desktop application framework.
- **Twilio**: SMS services.
- **Netlify**: Deployment and hosting.
- **OpenAI**: AI integration.
- **Anthropic**: AI (fallback for Dream Car Finder, primary for AI Helpdesk & Marketing Hub, agent fleet).
- **Google Gemini**: Primary AI (Dream Car Finder & Research & Outreach Agent).
- **Resend**: Email delivery services.
- **Google Cloud Vision**: OCR for document verification.
- **HubSpot**: CRM integration.
- **Google Places API**: Used by AI Outreach Engine.
- **Instantly.ai**: Cold email outreach platform.
- **BackgroundChecks.com**: Background screening integration.