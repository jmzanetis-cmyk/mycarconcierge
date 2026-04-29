# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace PWA with native app support, connecting vehicle owners with service providers for booking, payments, and vehicle management. It aims to be a comprehensive solution for car ownership, focusing on security, user experience, service coordination, and smart shopping tools. The platform's vision is to become the complete auto ownership platform, offering a full-service experience for auto care.

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
- **AI Features**: OCR for insurance cards, AI explanations for OBD codes, AI bid analysis, AI Helpdesk, AI review summarization, AI fair price estimator, AI package builder, AI bid strategy insights, AI provider matching, and an AI Marketing Hub.
- **Notification System**: User-controlled push, email, and SMS notifications, including automated reminders.
- **E-commerce**: Integrated Merch Store.
- **Lead Capture**: Public survey page for prospect lead generation with analytics dashboard.
- **Referral & Commission System**: Founder referral program with lifetime commissions.
- **Payment System**: Care plan completion lifecycle with dispute endpoints, admin oversight, AI-assisted dispute resolution, and Stripe Connect escrow.
- **SaaS Billing Foundation**: Configurable plans, access control, and subscription management for various offerings including White-label Platform, Fleet SaaS, and Provider Shop SaaS.
- **Automotive AI API**: Developer API for VIN lookup, recalls, OBD codes, and price estimation.
- **Outreach Engine SaaS**: Plan-based lead limits for an autonomous outreach platform with lead discovery, scoring, and outreach pipeline.
- **Job Workflow**: Member QR check-in and provider confirmation.
- **Analytics**: Provider and Admin dashboards with traffic monitoring.
- **Security**: API Rate Limiting, Login Activity Log, server-side gating for privileged mutations, and admin audit logs.
- **Mobile Native Features**: Biometric Login, Mobile Wallet Payments, and FCM Push Notifications.
- **UI/UX Decisions**: Responsive design, hero sections, trust badges, signup progress indicators, onboarding checklists, specific color schemes, and theme toggle.
- **Performance Optimizations**: Lazy-loaded JS modules, preconnect, enhanced service worker caching, server-side pagination, and image lazy loading.
- **Linting (ESLint)**: Flat-config `eslint.config.js` at repo root with `eslint-plugin-unicorn` + `eslint-plugin-html` (all in `devDependencies`). Run `npm run lint` to check or `npm run lint:fix` to auto-fix. Only mechanical, auto-fixable rules are enabled (`unicorn/prefer-number-properties`, `unicorn/prefer-global-this`, `unicorn/prefer-string-replace-all`, `unicorn/prefer-class-fields`, `prefer-object-has-own`, `no-unused-vars`, `no-negated-condition`) so unrelated SonarCloud-style noise does not surface. All seven are configured at `warn` severity (auto-fixers still apply on warnings) so `npm run lint` exits 0; the leave-alone warnings are findings the fixer can't safely resolve (e.g. `unicorn/prefer-number-properties` on `isNaN()` calls where the arg isn't provably numeric). Nested-ternary, Cognitive Complexity, accessibility, and security/SRI findings are intentionally left out — they need human refactors. Ignored paths: `node_modules`, `www/`, `android/`, `ios/`, `dist/`, `.netlify/`, `.netlify-deploy/`, `.cache/`, `attached_assets/`, `test-results/`, `playwright-report/`, `rideshare-calculator/` and `outreach-runner/` (both ESM subprojects with their own builds), `electron/`, `supabase/`, `tools/`, `netlify/`, `.local/`, `.playwright/`, and `**/*.min.js`. After running `lint:fix`, run `npm run cap:sync` so the Android-bundled HTML copies pick up the changes.
- **AI Ops Agent Fleet**: Multi-agent system (Orchestrator, Analyst, Matchmaker, Treasurer, Gatekeeper, Concierge, Advocate, Hunter, Director, Promoter) for autonomous administration, social acquisition, and dispute resolution. Includes editable prompt versioning with rollback and a side-by-side diff viewer.
- **Conversational Onboarding**: Progressive profiling signup flows for members and providers.
- **Service Categories**: Property-based service categories including Snow Removal Services.
- **Car Club Loyalty System**: Per-provider loyalty clubs with punch card rewards.
- **Smart Service Recommendations**: AI-driven service suggestions based on vehicle make/model.
- **AI Helpdesk Widget**: Anthropic Claude-powered chat with Car Expert, Provider Support, and Car Academy modes.
- **Blog (`/blog/`)**: SEO-driven editorial pillar with evergreen posts, static HTML generation, JSON-LD, SEO meta injection, and sitemap generation.
- **Provider Onboarding Walkthrough**: 7-step interactive guided tour for new providers.
- **Facebook Page Connection (Admin)**: OAuth-driven picker in the admin Marketing → Outreach panel that satisfies Meta App Review for the `pages_show_list` permission. Server endpoints under `/api/admin/facebook/*` (oauth-start / oauth-callback / pending-pages / select-page / disconnect / connection); HMAC-signed one-time `state` param protects the callback; persisted Page ID + name only (no access tokens) in the singleton `facebook_page_connections` Supabase table. Dev: `www/server.js` (in-memory caches). Prod: `netlify/functions/admin-facebook.js` (stateless — pending /me/accounts result is held in a short-lived HMAC-signed httpOnly Secure `mcc_fb_pending_pages` cookie between callback and selection); `_redirects` routes `/api/admin/facebook/*` → `/.netlify/functions/admin-facebook`. Admin auth on prod is `x-admin-password` matching `ADMIN_PASSWORD`. UI renderer (`renderFacebookPageCard` / `initFacebookPageConnection` in `www/admin-outreach.js`) populates `#facebook-page-connection-card` whenever the Marketing & Outreach panel becomes visible (auto-init from the panel's setup) and handles `?picking=facebook-page` and `?fb_error=` callback params via `fbAutoSwitchOnCallbackReturn`. The select-page POST sends only `page_id`; the Netlify function authoritatively reads `page_name` from the signed pending-pages cookie so the client can't spoof it. Requires `FACEBOOK_APP_SECRET` env var on prod.
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