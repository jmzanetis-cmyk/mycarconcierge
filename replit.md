# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace PWA with native app support, connecting vehicle owners with service providers for booking, payments, and vehicle management. It aims to be a comprehensive solution for car ownership, emphasizing security, user experience, service coordination, and smart shopping tools. The platform provides a full-service experience for auto care, from quotes to maintenance and smart purchasing decisions, with a business vision to become the complete auto ownership platform.

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
- **Lead Capture**: Public survey page for prospect lead generation. **Member Survey Analytics (Task #166)**: post-signup member survey persists 22 enum answers + raw payload + ip_hash to `public.survey_responses`; admin dashboard at `/admin.html#member-surveys` renders 4 headline cards (`ms-total`, `ms-week`, `ms-top-pain`, `ms-top-improvement`) and 6 doughnut charts via `loadMemberSurveyAnalytics()` (`MS_LABELS` in admin.js mirrors the server-side `ALLOWED` enum map exactly). Server endpoints: `POST /api/member/survey` (anon-allowed; only treats raw `42P01` table-missing as benign fallback, every other error → 500 with `code`+`detail`) and `GET /api/admin/survey-analytics` (admin-gated; emits `schema_pending:true` with empty buckets when it sees `42P01`/`42703`/`PGRST204` so the admin page can render a yellow "apply migration" banner instead of a blank panel). SQL: `supabase/migrations/20260428_survey_responses_columns_fix.sql` — focused, idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for all 22 question columns + `raw` + `ip_hash` + RLS policies; safe to re-apply. Run via Supabase SQL Editor whenever the admin page shows the schema-pending banner. Original `20260328_member_onboarding.sql` was patched in-place (missing comma after `vehicle_count text`, broken `pain_point` index swapped to `top_priority`).
- **Referral & Commission System**: Founder referral program with lifetime commissions.
- **Payment System**: Care plan completion lifecycle (`care_plan_completions` table — pending/completed/disputed/resolved) with member-side complete & dispute endpoints, admin-side oversight (list/create/patch), AI-assisted dispute resolution and a daily payment-anomaly scanner. **Stripe Connect escrow is wired (Task #155)**: when a member calls `POST /api/care-plans/:id/accept-bid`, the server creates a manual-capture PaymentIntent with `transfer_data.destination` pointing at the provider's `stripe_account_id` (metadata `flow=care_plan`). Funds sit in `requires_capture` state (held). On member `POST /api/care-plans/:id/complete`, the server captures the PI, marks the plan `payment_status='captured'`, and runs `processCarePlanFounderCommission` (90% to Chris Agrapidis, else 50%, idempotent via `care_plan_payout_{pi}_{founder}`). On `POST /api/care-plans/:id/dispute`, if funds are held the plan flips to `payment_status='disputed'` to freeze capture; admins resolve via the new `POST /api/admin/ai-ops/care-plan-completions/:id/capture` (releases to provider) or `/refund` (cancels held auth or refunds captured charge, full or partial). Webhook handler tracks the full lifecycle (`payment_intent.amount_capturable_updated|succeeded|canceled|payment_failed` + `charge.dispute.created`). Admin Care Plan Completions panel exposes Capture / Refund buttons. SQL: `supabase/migrations/20260428_care_plan_completions.sql` + `supabase/migrations/20260428b_care_plans_stripe_escrow.sql` (run via Supabase SQL Editor).
- **SaaS Billing Foundation**: Configurable plans, access control, and subscription management.
- **White-label Platform**: Custom branding, domains, and plan limits for tenants.
- **Fleet SaaS**: Subscription management for fleets with vehicle/driver limits and invitation systems.
- **Provider Shop SaaS**: Shop management platform with public profiles, embeddable booking widget, loyalty clubs, and kiosks.
- **Automotive AI API**: Developer API for VIN lookup, recalls, OBD codes, and price estimation.
- **Outreach Engine SaaS**: Plan-based lead limits for an autonomous outreach platform. Includes autonomous lead discovery, scoring, and outreach pipeline, with Google Places API integration for provider discovery, and compliance guardrails.
- **Job Workflow**: Member QR check-in and provider confirmation.
- **Analytics**: Provider and Admin dashboards with traffic monitoring.
- **Security**: API Rate Limiting, Login Activity Log, server-side gating for privileged mutations, and admin audit logs.
- **Mobile Native Features**: Biometric Login, Mobile Wallet Payments, and FCM Push Notifications.
- **UI/UX Decisions**: Responsive design, hero sections, trust badges, signup progress indicators, onboarding checklists, specific color schemes, and theme toggle.
- **Performance Optimizations**: Lazy-loaded JS modules, preconnect, enhanced service worker caching, server-side pagination, and image lazy loading.
- **AI Ops Agent Fleet**: Multi-agent system (Orchestrator, Analyst, Matchmaker, Treasurer, Gatekeeper, Concierge, Advocate, Hunter) for autonomous administration, social acquisition, and dispute resolution. **Gatekeeper enablement (Task #126)**: handler + producers + Apply/Suspend queue + prompt-edit admin all shipped in prior tasks (#123/#127/#128); the supervised production rollout is gated by the SQL `supabase/migrations/20260424_enable_gatekeeper.sql` (single `UPDATE public.agents SET enabled=true, autonomy='propose' WHERE slug='gatekeeper'` — apply via Supabase SQL Editor, or click the toggle at `/admin/agent-fleet.html`). Daily spend cap stays at the seeded $3. Verification: `node scripts/gatekeeper-enable-smoke.js` (env: SITE_URL, ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) fires one synthetic event of each subscribed type (`provider.applied`, `provider.bgc_completed`, `provider.flagged`), forces an orchestrator tick, polls `agent_actions` for proposed rows, and prints a recommendation/confidence/cost summary. Full operator playbook + 24h observation + rollback in `docs/gatekeeper-enablement-runbook.md`. Rollback is a single SQL line (`enabled=false`).
- **Conversational Onboarding**: Progressive profiling signup flows for members and providers.
- **Service Categories**: Property-based service category including Snow Removal Services.
- **Car Club Loyalty System**: Per-provider loyalty clubs with punch card rewards.
- **Smart Service Recommendations**: AI-driven service suggestions based on vehicle make/model.
- **AI Helpdesk Widget**: Anthropic Claude-powered chat with Car Expert, Provider Support, and Car Academy modes.
- **AI Marketing Hub**: Admin portal section for AI-powered marketing and business development, including content generation, email campaigns, campaign strategy, and fundraising modules. Integrates research and outreach agents.
- **Blog (`/blog/`)**: SEO-driven editorial pillar with 10 evergreen posts across the four pillars (Get Quotes, Manage Vehicles, Maintaining Your Ride, Shop Smarter). Static HTML generated by `scripts/build-blog.js` from an inline POSTS array. Article + BreadcrumbList JSON-LD on every post. SEO meta injection and sitemap generation are blog-aware via `scripts/inject-seo-meta.js` and `scripts/generate-sitemap.js`. Surfaced from the homepage ("From the Blog" 3-card section) and the global footer.
- **Provider Onboarding Walkthrough**: 7-step interactive guided tour for new providers.
- **E2E Testing**: Playwright with system Chromium for automated testing.
- **Mobile App Architecture**: Capacitor apps load from live URL (`mycarconcierge.com`), reducing need for App Store updates for web content changes.
- **Server Stability**: Uncaught exception/rejection handlers, EADDRINUSE retry logic, graceful shutdown.
- **Deployment Architecture**: GitHub for source control, Netlify for production hosting, Replit for development. Production deployments leverage Netlify's serverless functions for the outreach engine and other APIs.

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