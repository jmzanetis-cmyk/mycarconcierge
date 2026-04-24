# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace PWA with native app support, connecting vehicle owners with service providers for booking, payments, and vehicle management. The platform aims to be a comprehensive solution for car ownership, emphasizing security, user experience, service coordination, and smart shopping tools. It provides a full-service platform for auto care, offering services from quotes to maintenance and smart purchasing decisions.

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
- **Provider Management**: Rating system, automated suspension, and employee-level background checks with compliance tracking and notifications.
- **Vehicle Tools**: "My Next Car" (prospective purchases with VIN lookup) and "Dream Car Finder" (AI-powered search).
- **AI Features**: OCR for insurance cards, AI explanations for OBD codes, AI bid analysis, AI Helpdesk, AI review summarization, AI fair price estimator, AI package builder, AI bid strategy insights, and AI provider matching.
- **Notification System**: User-controlled push, email, and SMS notifications, including automated reminders.
- **E-commerce**: Integrated Merch Store.
- **Lead Capture**: Public survey page for prospect lead generation with admin management.
- **Referral & Commission System**: Founder referral program with lifetime commissions.
- **Payment System**: Escrow payment system using Stripe Connect with manual capture, additional work, discounts, refunds, and split payments.
- **SaaS Billing Foundation**: Configurable plans, access control, and subscription management for various modules.
- **White-label Platform**: Custom branding, domains, and plan limits for tenants.
- **Fleet SaaS**: Subscription management for fleets with vehicle/driver limits and invitation systems.
- **Provider Shop SaaS**: Shop management platform with public profiles, embeddable booking widget, loyalty clubs, and kiosks.
- **Automotive AI API**: Developer API for VIN lookup, recalls, OBD codes, and price estimation.
- **Outreach Engine SaaS**: Plan-based lead limits for an autonomous outreach platform. Canonical schema lives at `supabase/migrations/20260420_outreach_engine_initial.sql` (Task #137 — `www/outreach-schema.sql` is now a SYMLINK to that migration so the admin "Copy Schema SQL" fetch button keeps working without code changes). Task #134 closed CRM-bridge gaps: `supabase/migrations/20260425_outreach_crm_bridge.sql` re-applies pieces from the canonical schema that the live DB had drifted away from — `check_crm_duplicate(p_email, p_phone)` RPC (used by every import path with a phone-aware fallback in `outreach-engine-core.js::checkCrmDuplicate`), `increment_engine_stat(p_field, p_amount)` whitelisted atomic counter RPC, `trg_auto_link_outreach_lead` AFTER-INSERT trigger on `profiles` (SECURITY DEFINER, exception-swallows so signup never breaks, fires on email/phone match and stamps `outreach_lead_id`/`outreach_source`/`outreach_converted_at`), and `provider_applications.outreach_lead_id` FK (NULLABLE, ON DELETE SET NULL). Migration applied manually via Supabase SQL Editor (same pattern as `20260424_admin_audit_log.sql`); smoke tests in `_smoke-test.js` (STEP 27–30) detect a missing migration and emit ⚠ rather than failing. Outreach History panel is now mounted in two CRM detail modals (`openUserEditModal` + `viewApplication` in `www/admin.js`) via `window.renderOutreachHistoryPanel(containerId, profileId)` defined in `www/admin-outreach.js`.
- **Job Workflow**: Member QR check-in and provider confirmation.
- **Analytics**: Provider and Admin dashboards.
- **Security**: API Rate Limiting, Login Activity Log, and server-side gating for privileged provider mutations. `netlify/functions/provider-admin.js` (proxied at `/api/admin/provider-actions/*`) requires the `x-admin-password` header (matched against `ADMIN_PASSWORD`), uses the service-role Supabase client to bypass RLS, and writes an `admin_audit_log` row + sends Resend emails for every suspend/activate/check-low-rated action. `netlify/functions/provider-application.js` (proxied at `/api/provider-application`) validates the user's Supabase JWT, takes `user_id` from the JWT (clients cannot spoof it), captures the real client IP from `x-forwarded-for`, enforces a 1-application-per-user-per-24h rate limit, emits a `provider.application_submitted` event into `agent_events`, and replaces the previous browser-side inserts in `www/signup-provider.js` and `www/onboarding-provider.html`. Audit table created by `supabase/migrations/20260424_admin_audit_log.sql` (RLS-tightening statements included as commented-out follow-ups, to be applied via SQL Editor after one clean rollout).
- **Mobile Native Features**: Biometric Login, Mobile Wallet Payments, and FCM Push Notifications.
- **UI/UX Decisions**: Responsive design, hero sections, trust badges, signup progress indicators, and onboarding checklists, with specific color schemes and theme toggle.
- **Performance Optimizations**: Lazy-loaded JS modules, preconnect, enhanced service worker caching, server-side pagination, and image lazy loading.
- **AI Ops Agent Fleet**: Multi-agent system (Orchestrator, Analyst, Matchmaker, Treasurer, Gatekeeper, Concierge, Advocate, Hunter) for autonomous administration, social acquisition, and dispute resolution, using Anthropic Claude.
- **Conversational Onboarding**: Progressive profiling signup flows for members and providers.
- **Snow Removal Services**: Property-based service category.
- **Car Club Loyalty System**: Per-provider loyalty clubs with punch card rewards.
- **Smart Service Recommendations**: AI-driven service suggestions based on vehicle make/model.
- **AI Helpdesk Widget**: Anthropic Claude-powered chat with 3 modes (Car Expert, Provider Support, Car Academy), localStorage persistence with 50-message cap, context-aware prompts by page, thumbs up/down feedback, conversation copy/email export, client-side + server-side rate limiting.
- **Admin AI Chat Insights**: Dashboard section for monitoring chat widget usage, session counts, mode distribution, and recent activity.
- **Traffic Monitoring**: Server-side analytics with POST /api/analytics/track and GET /api/analytics/data endpoints. Client-side tracker (analytics-tracker.js) with device detection (iOS app, Android app, mobile web, desktop web), anonymous visitor IDs, and non-blocking beacon sends. Admin portal Traffic section with daily page views/visitors charts, device breakdown, top pages, referral sources, and active visitor count. In-memory storage with 90-day retention.
- **AI Marketing Hub**: Admin portal section for AI-powered marketing and business development. Content Generator (social posts, email campaigns, ad copy, blog outlines, outreach emails, press releases) with platform-specific formatting (Instagram, Facebook, X/Twitter, LinkedIn). Email Campaign sender via Resend with preview and bulk send (max 50 recipients). Campaign Strategy builder with goal/budget/timeline/channel inputs. Fundraising & Grants module for Kickstarter campaigns, grant applications, investor pitches, and funding opportunity research. Saved Content library for storing and retrieving generated materials. All AI content powered by Anthropic Claude via existing generateAIContent() function. Research & Outreach Agent uses Gemini with Google Search grounding (@google/genai SDK) to search the internet for real opportunities (grants, investors, accelerators, partnerships, media, competitions), generates personalized outreach emails for each, and sends them via Resend. In-memory outreach queue with draft/sent tracking.
- **Provider Onboarding Walkthrough**: 7-step interactive guided tour for new providers covering platform overview, profile setup, bid packs, job flow, payments, Car Club setup, and getting started.
- **AI Outreach Engine**: Fully autonomous lead discovery, scoring, and outreach pipeline in admin portal. Auto-starts on server boot and runs continuously. Discovers providers via Google Places API, re-engages dormant members (with context-aware notes based on vehicle count and days since signup) and stalled applications from CRM. Referral nudges for active members who have completed service requests (30-day cooldown). Claude AI scores leads (0-100) and drafts personalized email/SMS messages. Auto-send mode: provider and member outreach is drafted, approved, and sent automatically without admin intervention. Investor messages always require manual approval (compliance guardrail). Auto-send toggle in engine settings. Campaign management for organized outreach. CSV and Google Places bulk import with CRM deduplication. Analytics dashboard with funnel metrics. Compliance guardrails: investor messages always require approval, unsubscribed leads blocked, duplicate detection. Supabase Realtime for live pipeline updates. Server-side schedulers: discovery cycle (15min), follow-ups (daily), cleanup (weekly). Database: 7 tables (engine_state with auto_send column, outreach_leads, outreach_messages, outreach_campaigns, campaign_leads, outreach_activity_log, opportunity_pipeline). API: www/outreach-engine-api.js (20+ endpoints under /api/admin/outreach/). UI: www/admin-outreach.js with 6 tabs (Pipeline, Queue, Leads, Campaigns, Import, Analytics). Outreach History Panel embeddable in provider/member detail views. Requires GOOGLE_PLACES_API_KEY for automated provider discovery (manual entry works without it). Legal compliance: CAN-SPAM (physical address, unsubscribe link, List-Unsubscribe header, truthful subject lines), TCPA (SMS opt-out "Reply STOP"), daily send cap (100/day), unsubscribe page at /unsubscribe, SMS STOP webhook at /api/sms/incoming, AI-drafted messages include compliance instructions. Contact enrichment: Google Places Details API fetches phone numbers and websites for discovered leads; website scraper extracts email addresses from homepage, /contact, /about, and /contact-us pages. Chain shop filtering: blocklist of 40+ major chains (Pep Boys, Firestone, Midas, Jiffy Lube, etc.) ensures only independent shops are targeted. "Enrich Contacts" button in admin UI triggers manual backfill. Message preview modal shows draft email/SMS with compliance footers before sending.
- **E2E Testing**: Playwright with system Chromium for automated testing (49 test files including chat widget, car club, and outreach engine tests).
- **Mobile App Architecture**: Capacitor apps load from live URL (`mycarconcierge.com`), reducing need for App Store updates for web content changes.
- **Server Stability**: Uncaught exception/rejection handlers, EADDRINUSE retry logic, graceful shutdown on SIGTERM/SIGINT.
- **Deployment Architecture**: GitHub for source control, Netlify for production hosting, Replit for development.
- **Car Club Loyalty System**: Per-provider loyalty clubs with configurable punch card rewards (up to 3 active per club). Members auto-join on first job completion, earn punches toward rewards, browse all clubs. Free bid credits for providers when referred members book (10 bids per booking, no expiration, no cap, FIFO consumption before paid bids). Database: 9 new tables (car_clubs, reward_type_templates, club_reward_rules, club_memberships, member_club_balances, club_activity_log, club_reward_redemptions, free_bid_credits, notification_queue) in Replit PostgreSQL with on_job_complete_car_club() trigger and consume_bid() function. API: www/car-club-api.js module. UI: www/car-club-provider.html (provider management), www/car-club-member.html (member browsing/progress). Reward engine: www/lib/reward-engine.js (shared client/server). Phase 1 = punch cards; spend-based and visit milestones are stubbed for future phases.

## iOS App Store Build
- **Version**: 1.1, **Build**: 3
- **Bundle ID**: `com.zanetisholdings.mycarconcierge`
- **Build Script**: `scripts/ios-build.sh` — syncs web assets via `npx cap sync ios`, then strips admin portal, outreach engine, marketing docs, investor files, and server-only code from `ios/App/App/public/`. Patches consumer pages to remove admin nav links and redirects. Includes verification step.
- **Architecture**: iOS app loads from `https://www.mycarconcierge.com` (live Netlify site). Local public assets serve as offline fallback. Website updates deploy instantly without App Store resubmission.
- **Excluded from iOS**: admin.html/js, admin-outreach.js, outreach-engine-api.js, all brochures/presentations/investor docs, marketing directory, analytics-tracker.js, hubspot-client.js, server.js, email service files.
- **Submission Guide**: `www/docs/apple-submission-guide.md`
- **Demo Account**: `applereview@mycarconcierge.com` / `AppleReview2024!`

## Deployment Architecture
- **GitHub Repo**: `jmzanetis-cmyk/my-car-concierge` (private). Source of truth for production deploys. Push to `main` branch to deploy.
- **Netlify**: Hosts entire production stack at mycarconcierge.com — all frontend HTML/CSS/JS plus serverless Netlify Functions for the outreach engine, admin API, email tracking, webhooks, and unsubscribe handling. Continuous deployment linked to GitHub repo. Build command: `cd netlify/functions && npm install`. Functions are bundled with esbuild and deployed as zip archives via the Netlify API.
- **Outreach Engine (Serverless)**: Fully serverless on Netlify using Scheduled Functions and Background Functions:
  - `outreach-cycle.js` (scheduled every 15min) → invokes `outreach-cycle-background.js` (15-min timeout) for lead discovery, scoring, drafting, and auto-sending
  - `outreach-followups.js` (scheduled every 6h) → invokes `outreach-followups-background.js` for follow-up drafts (step 2/3)
  - `outreach-cleanup.js` (scheduled weekly, Sundays) for pipeline cleanup
  - `outreach-admin.js` handles all `/api/admin/outreach/*` API routes
  - `outreach-unsubscribe.js` handles `/unsubscribe` page
  - `outreach-resend-webhook.js` handles `/api/webhooks/resend` POST
  - `outreach-engine-core.js` is the shared module with all engine logic
- **Replit**: Development environment only. `outreach-runner/` directory kept as reference but no longer deployed. Code changes should be pushed to GitHub for production deployment.
- **Deploy Process**: Functions are bundled locally with esbuild into self-contained JS files, zipped, and deployed via the Netlify API alongside static files. The GitHub repo can also be linked to Netlify for automatic continuous deployment (requires Netlify GitHub App installation on the GitHub account).
- **Scoring Bug Fix**: The scoring query now excludes already-scored leads from the database query using `.not('id', 'in', ...)` filter, preventing the cycle from returning the same leads and producing empty `toScore` arrays.
- **Tracking URLs**: Email tracking pixels and click redirects now point to `mycarconcierge.com/t/o` and `mycarconcierge.com/t/c` (Netlify Functions), replacing the old Replit runner URLs.

## External Dependencies
- **Supabase**: Backend as a Service (PostgreSQL, authentication, storage).
- **Stripe**: Payment processing (Stripe Connect).
- **Capacitor**: Cross-platform native runtime.
- **Electron**: Desktop application framework.
- **Twilio**: SMS services.
- **Netlify**: Deployment and hosting.
- **OpenAI**: AI integration.
- **Anthropic**: AI (fallback for Dream Car Finder, primary for AI Helpdesk & Marketing Hub, agent fleet). All call sites (helpdesk, dispute-resolver, payment-tracker, daily-digest, ai-ops-admin, outreach-engine, agent-fleet-runtime) read the key as `ANTHROPIC_API_KEY_MCC_FLEET1 || ANTHROPIC_API_KEY` to allow a workspace-billing override when the canonical key's billing is broken upstream. Reddit publishing uses `scripts/reddit-oauth-dance.js` to mint a permanent refresh token; the social Hunter monitor scheduled function (`netlify/functions/social-monitor-scheduled.js`, every 15 min) polls enabled `social_channels` and emits `social.lead_discovered` events. The monitor exports `runOnce(supabase, { channelId })` so the admin "Run now" per-channel button can re-use the same logic; per-run health (`last_run_at`, `last_error_at`, `last_error_message`) is stamped into `social_channels.config` jsonb so no schema change is needed. Admin social UI (`www/admin/agent-fleet.html`) supports inline-editable post bodies (race-safe PATCH rejects publishing/published with 409), expandable lead drawers showing raw_text + Hunter reasoning + context json, channel edit/delete/run-now actions, and bulk draft variants (1-10) sharing a `variant_group` correlation id in the event payload.
- **Google Gemini**: Primary AI (Dream Car Finder & Research & Outreach Agent).
- **Resend**: Email delivery services.
- **Google Cloud Vision**: OCR for document verification.
- **HubSpot**: CRM integration.
- **Google Places API**: Used by AI Outreach Engine.
- **Instantly.ai**: Cold email outreach platform.
- **BackgroundChecks.com**: Background screening integration for providers and employees.

## Activity Simulation Tool
- **Script**: `www/simulate.js` — Comprehensive end-to-end activity simulation using live Supabase database.
- **Run**: `cd www && node simulate.js run` — Creates full realistic activity across the platform.
- **Cleanup**: `cd www && node simulate.js cleanup` — Removes all SIM-prefixed test data and auth users.
- **Identifiers**: All simulation data uses `SIM-` prefix (emails: `SIM-*@sim-mcc.test`, business names, vehicle nicknames, package titles, team member names, dream car search names). Password for all sim accounts: `SimPass123!`
- **Safety**: Uses Supabase service role key to bypass RLS. Cleanup identifies data by `@sim-mcc.test` email domain and handles FK constraint ordering correctly.
- **Simulated Data Coverage**:
  - **Core Flow**: 8 members, 5 providers, 9-16 vehicles, 14-21 service requests, 36-60 bids, 10-15 jobs accepted, 5-9 completed with payments, 4-7 reviews
  - **Founder Referrals & Commissions**: 8+ referrals (member & provider), 8-11 commission records with bid pack payouts, 3 member_founder_profiles with referral codes
  - **Notifications**: 70-85 notifications across all types (welcome, vehicle_added, bid_received, bid_accepted, job_started, job_completed, payment_released, review_posted, maintenance_reminder, appointment_reminder, suspension, suspension_lifted)
  - **OBD Diagnostic Scans**: 10-15 scans with real OBD-II codes (P0300, P0171, P0420, etc.) across multiple vehicles and sources (manual, photo_ocr)
  - **Dream Car Finder**: 4 saved searches with criteria (makes, styles, features, price ranges) and 7-10 matched listings with scores, dealer info, and locations
  - **Provider Team Members**: 7-15 team members with roles (Lead Technician, Service Advisor, Brake Specialist, etc.), certifications, and specialties
  - **Maintenance Reminders**: 10-16 pending reminders with future service dates for various maintenance types (Oil Change, Tire Rotation, Brake Inspection, etc.)
  - **Admin Portal - Provider Applications**: 5 applications (3 approved, 1 rejected, 1 pending) with business details, admin notes, and verification flags
  - **Admin Portal - Bid Credit Adjustments**: 5 providers receive randomized bid credits (10-75 each)
  - **Admin Portal - Suspension Workflow**: 1 provider suspended and lifted by admin, with cascading notifications
  - **Escrow Payment Lifecycle**: 5-6 escrow payments (captured + 1 refunded), with stripe_payment_intent_id simulation and refund records
  - **Service Appointments**: 10-12 appointments with proposed/confirmed dates, time windows, and QR check-ins (5-7 check-ins)
  - **Platform Connectivity Verification**: 15 cross-table integrity checks validating: role consistency, provider_stats linkage, vehicle ownership, bid-package relationships, notification delivery, founder profile chains, escrow references, review linkage, diagnostic scan integrity, bid credits, and appointment-job associations
- **Cleanup Tables**: service_appointments, refunds, escrow_payments, provider_applications, notifications, provider_reviews, payments, founder_commissions, founder_referrals, member_founder_profiles, dream_car_matches, dream_car_searches, team_members, maintenance_reminders, diagnostic_scans, bids, maintenance_packages, vehicles, provider_stats, profiles, auth users
