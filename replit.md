# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace PWA with native app support, aiming to be a comprehensive platform for vehicle owners. It connects owners with service providers for booking, payments, vehicle tracking, and provider management. The platform emphasizes security, user experience, service coordination, vehicle management, and smart shopping tools to enrich the car ownership experience.

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
The application is built with a modern web stack (vanilla HTML, CSS, JS) and uses PWA capabilities for web, Capacitor for mobile, and Electron for desktop.

Key architectural patterns and features include:
- **PWA Features**: Installability, offline support, and auto-updates.
- **User Roles**: Supports `member`, `provider`, `pending_provider`, and `admin` roles, including dual roles.
- **Authentication**: Two-Factor Authentication (2FA), Sign in with Apple, and Magic Link.
- **Account & Team Management**: Self-service account deletion and provider team management with role-based access.
- **Service Coordination**: Appointment scheduling, vehicle transfer tracking, and temporary location sharing.
- **Provider Management**: Rating system and automated suspension.
- **Vehicle Tools**: "My Next Car" (prospective purchases with VIN lookup), "Dream Car Finder" (AI-powered search), and Google Vision OCR for document verification.
- **AI Features**: OCR for insurance cards, AI explanations for OBD codes, AI bid analysis, AI Helpdesk, AI review summarization, AI fair price estimator, AI package builder, AI bid strategy insights, and AI provider matching.
- **Notification System**: User-controlled push, email, and SMS notifications.
- **E-commerce**: Integrated Merch Store via Printful with Stripe checkout.
- **Automated Reminders**: Maintenance and appointment reminders.
- **Prospect Survey & Lead Capture**: Public `/survey` page (no auth required) with 8-feature rating cards (👍/🤔/👎), 3-step flow (rate → profile → job listing), not-interested email capture branch, and animated progress bar. Admin "Survey Leads" panel with stat cards, paginated lead table + CSV export, feature heatmap, Chart.js trend chart, and not-interested emails tab.
- **Referral & Commission System**: Founder referral program with lifetime commissions and instant payouts.
- **Payment System**: Escrow payment system using Stripe Connect with support for manual capture, additional work, discounts, refunds, and split payments.
- **SaaS Billing Foundation**: Configurable plans, access control, and Stripe webhook integration for subscription management.
- **White-label Platform**: Custom branding, domains, and plan limits for tenants.
- **Fleet SaaS**: Subscription management for fleets with vehicle/driver limits, invitation system, and CSV vehicle import.
- **Provider Shop SaaS**: Shop management platform with public profiles, embeddable booking widget, shop-specific features like loyalty clubs and kiosks, and subscription-based feature gating.
- **Automotive AI API**: Developer API with rate limiting for VIN lookup, recalls, OBD codes, and price estimation.
- **Outreach Engine SaaS**: Plan-based lead limits for an autonomous outreach platform including lead discovery, scoring, and campaign management.
- **Job Workflow**: Member QR check-in and provider confirmation.
- **Analytics**: Provider and Admin dashboards with Chart.js.
- **Security**: API Rate Limiting and Login Activity Log.
- **Mobile Native Features**: Biometric Login, Mobile Wallet Payments, and FCM Push Notifications via Capacitor.
- **UI/UX Decisions**: Responsive design, hero sections, trust badges, signup progress indicators, and onboarding checklists.
- **Performance Optimizations**: Lazy-loaded JS modules, preconnect, enhanced service worker caching, server-side pagination, and image lazy loading.
- **AI Ops Agent**: Autonomous admin automation for dispute resolution, payment tracking, outreach AI decision layer, and daily digests.
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
- **Anthropic**: AI (fallback for Dream Car Finder, primary for AI Helpdesk & Marketing Hub).
- **Google Gemini**: Primary AI (Dream Car Finder & Research & Outreach Agent).
- **Resend**: Email delivery.
- **Google Cloud Vision**: OCR for document verification.
- **HubSpot**: CRM integration.
- **Google Places API**: Used by AI Outreach Engine.
- **Instantly.ai**: Cold email outreach platform.
- **BackgroundChecks.com**: Background screening integration for providers and employees.