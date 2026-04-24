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
- **Lead Capture**: Public survey page for prospect lead generation.
- **Referral & Commission System**: Founder referral program with lifetime commissions.
- **Payment System**: Escrow payment system using Stripe Connect with manual capture, additional work, discounts, refunds, and split payments.
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
- **AI Ops Agent Fleet**: Multi-agent system (Orchestrator, Analyst, Matchmaker, Treasurer, Gatekeeper, Concierge, Advocate, Hunter) for autonomous administration, social acquisition, and dispute resolution.
- **Conversational Onboarding**: Progressive profiling signup flows for members and providers.
- **Service Categories**: Property-based service category including Snow Removal Services.
- **Car Club Loyalty System**: Per-provider loyalty clubs with punch card rewards.
- **Smart Service Recommendations**: AI-driven service suggestions based on vehicle make/model.
- **AI Helpdesk Widget**: Anthropic Claude-powered chat with Car Expert, Provider Support, and Car Academy modes.
- **AI Marketing Hub**: Admin portal section for AI-powered marketing and business development, including content generation, email campaigns, campaign strategy, and fundraising modules. Integrates research and outreach agents.
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