# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace PWA with native app support across multiple platforms. It aims to be "Your complete auto ownership platform," connecting vehicle owners with service providers for booking, payment, vehicle tracking, and provider management. The platform focuses on security, user experience, service coordination, vehicle management, educational content, and smart shopping tools to enhance the car ownership journey.

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
The application uses a modern web stack (vanilla HTML, CSS, JS) with lazy-loaded JavaScript modules. It leverages PWA features for the web, Capacitor for mobile, and Electron for desktop applications.

Key architectural patterns and features include:
- **PWA Capabilities**: Install to Home Screen, offline support, and auto-updates.
- **User Role Management**: Supports `member`, `provider`, `pending_provider`, and `admin` roles, including dual roles.
- **Database Schema**: 29 core tables with 212 Row-Level Security (RLS) policies.
- **Authentication**: Two-Factor Authentication (2FA), Sign in with Apple, and Magic Link.
- **Account Management**: Self-service account deletion.
- **Team Management**: Providers can add team members with role-based access. Admin portal with 6 roles, session token auth, bcrypt password hashing, and self-service invite system.
- **Service Coordination**: Appointment scheduling, vehicle transfer tracking, and temporary location sharing.
- **Provider Management**: Rating and automated suspension system.
- **Vehicle Tools**: "My Next Car" (prospective purchases with VIN lookup), "Dream Car Finder" (AI-powered search), and Google Vision OCR for registration document verification with AI-enhanced field extraction.
- **Insurance Card Extraction**: AI-powered OCR for insurance cards, auto-filling details with a review UI.
- **OBD Diagnostic Scanner**: Manual entry or photo OCR for codes, AI explanations, severity ratings, cost estimates, and recommendations.
- **Notification System**: User-controlled preferences for push, email, and SMS.
- **E-commerce**: Integrated Merch Store via Printful with Stripe checkout.
- **Automated Reminders**: Maintenance and SMS appointment reminders.
- **Referral & Commission System**: Founder referral program with lifetime commissions and instant payouts.
- **Payout Management**: Comprehensive payout management for founders, including multiple methods and a Tax Center.
- **Payment System**: Escrow payment system using Stripe Connect for marketplace transactions, supporting manual capture, additional work requests, provider discounts, post-capture refunds, and split payments.
- **SaaS Billing Foundation**: `SAAS_PLANS` config (5 product lines × 3 tiers each), `checkPlanAccess()` helper, `saas_subscriptions` table, Stripe webhook handling for subscription lifecycle events, 6 `/api/saas/*` endpoints + `/api/admin/saas/subscriptions`, SaaS pricing modal + billing card in members.html.
- **White-label Platform (#87)**: `white_label_tenants` table with custom domain, branding colors, logo, and plan limits. CRUD `/api/admin/white-label/tenants` endpoints. Admin dashboard section with tenant management UI + create/edit modal. `GET /api/white-label/config` returns branding for custom domains.
- **Fleet SaaS (#88)**: Subscription status card + vehicle limit usage bar in fleet dashboard. Upgrade banner when near tier limit. `GET /api/fleet/subscription` and `POST /api/fleet/check-limits` endpoints with plan-based vehicle/driver limits (Starter: 10/5, Pro: 50/25, Business: unlimited).
- **Provider Shop SaaS (#89)**: Shop subscription status card in providers.html subscription section. Feature gating badges for SMS Reminders, Advanced Analytics, Car Club Loyalty. Upgrade prompt when on Starter plan.
- **Automotive AI API (#90)**: `developer_api_keys` table with SHA-256 key hashing. `POST/GET/DELETE /api/developer/keys` for key management. API key dashboard in members.html settings with one-time key reveal. Public AI API endpoints: `GET /api/v1/vin/:vin`, `GET /api/v1/recalls/:vin`, `POST /api/v1/obd-codes` (Pro+), `POST /api/v1/price-estimate`. Rate limiting by plan (Starter: 5K/mo, Pro: 50K/mo, Business: unlimited).
- **Outreach Engine SaaS (#91)**: `GET /api/saas/outreach/status` with plan-based lead limits (Starter: 500/mo, Pro: 5K/mo, Business: unlimited). Outreach SaaS status card in members.html settings with usage bar, monthly lead count, and upgrade prompt.
- **Job Workflow**: Member QR check-in for active jobs, provider confirmation.
- **Analytics**: Provider and Admin dashboards with Chart.js.
- **Security**: API Rate Limiting and Login Activity Log.
- **Mobile Native Features**: Biometric Login, Mobile Wallet Payments, and FCM Push Notifications via Capacitor. `members-push.js` handles native push (permission, token registration, foreground banners, tap deep-links). Device tokens stored in `device_push_tokens` table. `sendFCMPushNotification()` in server.js sends via FCM legacy API using `FCM_SERVER_KEY` env var; wired into bid and reminder notifications. Requires `npx cap sync` to install native plugin in iOS/Android projects. Web browser falls back to existing VAPID/Service Worker push.
- **UI/UX Decisions**: Homepage hero design, trust badges, signup progress indicators, password reassurance, dashboard onboarding checklists, and responsive design.
- **Performance Optimizations**: Lazy-loaded JS modules, preconnect hints, enhanced service worker caching, server-side pagination, and image lazy loading.
- **AI Smart Bid Analyzer**: AI-powered recommendation card ranks bids by value, provider reputation, ratings, completion rate, and response time.
- **AI Helpdesk Widget**: Anthropic Claude-powered chat with 3 modes (Car Expert, Provider Support, Car Academy), context-aware prompts, and feedback.
- **Admin AI Chat Insights**: Dashboard for monitoring chat widget usage and activity.
- **Traffic Monitoring**: Server-side analytics with client-side tracker for device detection, anonymous visitor IDs, and non-blocking beacon sends.
- **Marketing Hub Sharing**: Google Drive-style share modal for inviting collaborators with email invite, access list, and shareable link generation.
- **Marketing & Outreach**: Unified admin portal section with Outreach Engine (autonomous lead discovery, scoring, pipeline, re-engagement, referral nudges, lead scoring, Claude AI message drafting, auto-send with compliance guardrails, campaign management, bulk import, CRM deduplication, contact enrichment, chain shop filtering, member lead discovery, Gemini-powered community discovery), Email Campaigns, Content Generator, Social Media (AI-generated platform-specific posts), Campaign Strategy, Fundraising & Grants, Research & Outreach Agent (Gemini with Google Search grounding), Saved Content, and Growth Funnel.
- **Conversational Onboarding**: Progressive profiling signup flows for members (8-step) and providers (9-step pre-account + post-account member setup), utilizing white/light theme with blue accent, slide animations, one question per screen, mobile-first. Full Supabase auth integration.
- **Provider Onboarding Walkthrough**: 7-step interactive guided tour.
- **Snow Removal Services**: Property-based service category for members to create requests.
- **AI Review Summarization**: AI-generated summary of provider reviews displayed on provider dashboard and member-facing bid detail views.
- **Car Club Loyalty System**: Per-provider loyalty clubs with configurable punch card rewards.
- **AI Fair Price Estimator**: Queries historical accepted bid data by category/region, returning quartile-based price ranges.
- **AI Package Builder**: Debounced AI suggestion panel below description textarea in package creation modal, offering suggested category, clarifying questions, and missing field hints.
- **AI Bid Strategy Insights**: Provider Bid Insights card showing per-category win rate badges, AI tips, and top recommendation.
- **AI Provider Matching**: Scores active providers by category match, geo proximity, rating, win rate, and tier, sending notifications to top matches.
- **Smart Service Recommendations**: When a member selects a vehicle, a "Suggested for your [Vehicle]" panel shows up to 7 service recommendations based on client-side logic and an AI endpoint for make/model-specific suggestions.
- **iOS App Store Build**: Strips admin portal, outreach engine, marketing docs, investor files, and server-only code for a consumer-focused iOS app.
- **Deployment Architecture**: GitHub is the source of truth for production deploys. Netlify hosts the entire production stack (frontend, serverless functions). Replit is for development only.
- **Outreach Engine (Serverless)**: Fully serverless on Netlify using Scheduled Functions and Background Functions for lead discovery, scoring, drafting, auto-sending, follow-ups, and cleanup.
- **AI Ops Agent (Full Modules)**: Autonomous admin automation layer with 4 modules: (1) Dispute Resolver — Claude analyzes disputes, auto-applies Stripe refunds + Twilio SMS at confidence ≥ threshold; (2) Payment Tracker — tier-based commission calculation (Dipstick 15%, Pit Stop 12%, Pole Position 10%, Championship 8%) with Stripe Connect payouts and anomaly detection; (3) Outreach AI Decision Layer — runs after each outreach cycle, evaluates provider pipeline health and triggers follow_up_sms/re_engagement/pipeline_alert actions; (4) Daily Digest — generates narrative from ai_action_log + sends Twilio SMS to admin. All modules respect AI_CONFIDENCE_THRESHOLD (default 1.0 = shadow mode, everything escalates). Netlify Scheduled Functions: payment-tracker-scheduled (every 6h), daily-digest-scheduled (8 PM ET / 01:00 UTC). Dispute resolver exposed as Netlify Background Function (dispute-resolver-background.js) triggered by Supabase webhook. Supabase migration: supabase/migrations/20250317_ai_ops_dispute_webhook.sql.

## External Dependencies
- **Supabase**: Backend as a Service (PostgreSQL, authentication, storage).
- **Stripe**: Payment processing (Stripe Connect for marketplace, general payments).
- **Capacitor**: Cross-platform native runtime for web apps.
- **Electron**: Framework for building desktop applications.
- **Twilio**: SMS services (2FA, notifications).
- **Netlify**: PWA deployment and hosting.
- **OpenAI**: AI integration.
- **Anthropic**: AI fallback for Dream Car Finder, primary for AI Helpdesk Widget and AI Marketing Hub content generation.
- **Google Gemini**: Primary AI provider for Dream Car Finder and Research & Outreach Agent.
- **Resend**: Email delivery services.
- **Google Cloud Vision**: OCR for document verification.
- **HubSpot**: CRM integration.
- **Google Places API**: Used by AI Outreach Engine for provider discovery and contact enrichment.
- **Instantly.ai**: Cold email outreach platform for campaign delivery, warmup, A/B testing, and deliverability, integrating with the Outreach Engine via API v2.
- **BackgroundChecks.com**: Platform integration for provider and employee background screening (criminal check + MVR). MCC acts as a platform customer; providers get sub-accounts; employees receive applicant portal links. Requires `BACKGROUNDCHECKS_TOKEN` and optionally `BACKGROUNDCHECKS_ENV` (sandbox|production). Report viewing uses BackgroundChecks Connect Widget embedded in-app. API routes: `POST /api/bgcheck/initiate`, `GET /api/bgcheck/status/:providerId`, `GET /api/bgcheck/report-url/:checkId`, `POST /webhook/bgcheck`.