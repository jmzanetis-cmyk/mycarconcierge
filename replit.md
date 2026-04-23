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
- **Deployment Architecture**: GitHub for source control, Netlify for production hosting, Replit for development.

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
- **Resend**: Email delivery.
- **Google Cloud Vision**: OCR for document verification.
- **HubSpot**: CRM integration.
- **Google Places API**: Used by AI Outreach Engine.
- **Instantly.ai**: Cold email outreach platform.
- **BackgroundChecks.com**: Background screening integration for providers and employees.