# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace PWA with broad native app support (iOS, Android, Windows, Mac, Linux). It connects vehicle owners with service providers, offering comprehensive solutions for booking, payment, vehicle tracking, and provider management, with a strong emphasis on security and user experience. The project aims to provide a robust platform for automotive service coordination.

## User Preferences
- **Brand Messaging**: "Your complete car ownership platform" - positions MCC as the all-in-one solution for car owners
- **Tone**: Professional, informative, memorable, and witty without being gimmicky
- **Key Headlines**: "One app. Every car need. Zero hassle." - short, benefit-driven (follows advertising stats: 6-9 words perform best)
- **Four Pillars**: Find Service, Manage Vehicles, Learn About Cars, Shop Smarter - each clearly explains platform features
- **Automotive Theme**: Warmer dark slate backgrounds (#12161c) with bronze/copper gold accents and coolant teal highlights
- Premium, luxury garage-inspired aesthetic with metallic gradients on buttons and cards
- Less harsh dark mode with improved contrast and depth
- **Light Mode**: Research-backed color scheme optimized for trust and conversion (navy blue #1e3a5f for trust, deeper gold #b8942d for 23% higher CTA contrast, warmer off-white #fefdfb for approachability). WCAG-compliant text contrast with white button text on gold.
- **Theme Toggle**: Pill-shaped button with sun/moon icons and "Day"/"Night" text labels in header/navbar for clear accessibility
- **Languages**: English, Spanish, French, Greek, Chinese, Hindi, Arabic (RTL supported)

## System Architecture
The application uses a modern web stack with vanilla HTML, CSS, and JavaScript. JavaScript modules are lazy-loaded. Supabase provides the backend (PostgreSQL, authentication, storage). The system is multi-platform, utilizing PWA features for web, Capacitor for mobile, and Electron for desktop applications.

Key features include:
- **PWA Capabilities**: Install to Home Screen, offline support, app-like experience, and auto-updates.
- **User Role Management**: Supports `member`, `provider`, `pending_provider`, and `admin` roles, including dual roles.
- **Database Schema**: 29 core tables cover profiles, vehicles, maintenance packages, bids, notifications, payments, and provider applications.
- **Row-Level Security (RLS)**: Implemented with 212 policies for robust role-based access control.
- **Service Scheduling & Coordination**: Facilitates appointment scheduling, vehicle transfer tracking, and temporary location sharing.
- **Provider Rating & Suspension System**: Automatically suspends underperforming providers; admins can lift suspensions.
- **Two-Factor Authentication (2FA)**: SMS-based 2FA using Twilio, with server-side enforcement and rate limiting.
- **Provider Team Management**: Allows providers to add team members with role-based access.
- **My Next Car (Car Shopping Tool)**: Enables members to track and compare prospective vehicle purchases with VIN lookup and comparison features.
- **Dream Car Finder (AI Search)**: AI-powered automated car search with customizable criteria (makes, models, trims/versions, body styles, fuel types, colors, features), notifications, and match scoring.
- **Vehicle Ownership Verification (Google Vision OCR)**: Simplifies verification using OCR for registration documents; includes admin review and referral-based bypass.
- **Notification Preferences**: Members can control notification delivery (push, email, SMS) for various alerts.
- **Push Notifications**: Web push notifications for instant alerts across devices.
- **Merch Store (Printful Integration)**: E-commerce shop for branded merchandise with Stripe checkout.
- **Merch Manager (Admin Tool)**: Admin interface for creating and managing Printful products, including catalog browsing, design library, and product creation.
- **Automated Maintenance Reminders**: Tracks vehicle maintenance schedules and sends reminders.
- **Provider Push Notifications**: Providers receive push notifications for opportunities, appointments, and messages.
- **Branded Email Templates**: Professional HTML email templates matching the app's light theme for transactional emails.
- **Automated Welcome Emails**: Personalized welcome emails sent to new members and providers on first login after email verification. Uses light theme (navy #1e3a5f, gold #b8942d, off-white #fefdfb) with role-specific content, quick-start guides, logo, and unique QR referral codes.
- **Founder Referral Commission System**: Both members and providers automatically become "founders" who can refer new providers. Members receive MF-prefixed codes (stored in `member_founder_profiles`), providers receive PR-prefixed codes (stored in `provider_referral_codes`). Welcome emails include QR codes linking to provider signup. When referred providers purchase bid packs, the referrer earns 50% lifetime commission via `record_bid_pack_commission` RPC, tracked in `founder_referrals` and `founder_commissions` tables. Exception: Chris Agrapidis has a special Founding Provider Partner Agreement with 90% commission rate plus milestone bonuses.
- **Provider Loyalty Referral System**: Comprehensive program with three QR code types (Loyal Customer, New Member, Provider referral), exclusive bidding windows, and private job options.
- **Referral Program**: Member referral system with credits for both referrer and new members.
- **Vehicle Recall Alerts**: Weekly checks against the NHTSA database for safety recalls.
- **Fuel Cost Tracking**: Allows tracking fill-ups, calculating MPG, and analyzing spending.
- **Insurance Card Storage**: Securely store insurance documents with expiration tracking.
- **Service History Export**: Download service records as PDF or CSV.
- **API Rate Limiting**: In-memory rate limiting to prevent abuse across different API endpoints.
- **Login Activity Log**: Tracks login history and alerts on failed attempts.
- **SMS Appointment Reminders**: Sends automated reminders 24 hours before scheduled service.
- **Light/Dark Theme Toggle**: Premium dark mode and a dramatic light mode with smooth transitions and persistent preference.
- **Vehicle Trim/Version Selector**: Members can select from predefined trim levels (Sport, Turbo, GTI, Mk 7.5, CLA 45, etc.) or type custom versions for accurate vehicle identification.
- **Admin Dashboard Charts**: Visualizes revenue, user growth, and order statistics using Chart.js.
- **Escrow Payment System (Stripe Connect)**: Secure marketplace payments using manual capture. Funds are held when member confirms card, then captured and transferred to provider (minus 2% platform fee) when job is marked complete. Features server-side amount validation, status state machine enforcement, idempotent operations, and server-side atomic updates for payment release.
- **Additional Work Requests**: Providers can request additional payment during active jobs when discovering extra work needed. Members approve/decline with separate Stripe payment authorization. Uses two-step flow: authorization_pending → approved after successful card confirmation. Captured separately during final escrow release.
- **Provider Discounts**: Providers can offer fixed or percentage discounts on active jobs (max 95% of original amount). Members can accept offers, which are applied at final payment capture time, reducing the captured amount.
- **Provider Stripe Connect Onboarding**: Providers can connect their Stripe account to receive payments directly. Includes onboarding flow, status verification, and payout management.
- **Member Payment Confirmation UI**: Members see payment status badges on packages (Awaiting Payment, Payment Authorized, Payment Held, Payment Complete) and can confirm job completion to release funds.
- **Provider Analytics Dashboard**: Comprehensive analytics for providers including earnings trends, bid success rates, average job value, top services by revenue, and customer insights with Chart.js visualizations.
- **Biometric Login (Capacitor)**: Face ID / fingerprint authentication for native mobile apps with graceful web fallback.
- **Mobile Wallet Payments**: Apple Pay and Google Pay integration for native apps (requires Capacitor Stripe plugin and merchant ID configuration).

## UX Optimizations (Consumer Psychology)
- **Homepage Hero**: Outcome-focused headline, single dominant CTA, reduced cognitive load
- **Trust Strip**: 3 visual trust badges (Vetted Providers, Escrow Protection, Verified Registration) using shield iconography
- **Signup Progress Indicator**: 2-step visual progress bar for member signup reducing perceived complexity
- **Password Reassurance**: Microcopy near password field to reduce security anxiety
- **Dashboard Onboarding Checklist**: 3-step checklist for new users (Add Vehicle, Create Package, Verify Registration) with progress tracking and auto-hide on completion
- **Mobile Touch Targets**: All buttons have 48px minimum height for proper touch targets
- **Responsive Typography**: Hero headline and CTAs scale appropriately on mobile devices

## Performance Optimizations
- **Lazy-Loaded JS Modules**: Member and provider dashboards split into feature modules loaded on-demand, reducing initial load from ~500KB to ~25KB.
- **Preconnect Hints**: Early connection establishment for external APIs (Supabase, Stripe, CDN) to reduce latency.
- **Enhanced Service Worker Caching**: Cache-first for static assets, network-first with fallback for APIs, stale-while-revalidate for HTML pages.
- **Admin Dashboard Lazy Loading**: Sections load data on-demand when clicked, not on initial page load.
- **Server-Side Pagination**: Admin tables use paginated API endpoints with 25 items per page.
- **Shared Styles & Utilities**: Centralized CSS (shared-styles.css) and JavaScript utilities (utils.js) reduce code duplication and improve caching.
- **Image Lazy Loading**: Offscreen images use native lazy loading for faster initial page loads.
- **CSS Skeleton Loaders**: Smooth loading states for dashboard sections with animated skeleton placeholders.

## External Dependencies
- **Supabase**: Backend services (PostgreSQL, authentication, storage).
- **Stripe**: Payment processing.
- **Capacitor**: Mobile app development.
- **Electron**: Desktop app development.
- **Twilio**: SMS for 2FA and notifications.
- **Netlify**: PWA deployment.
- **OpenAI**: Integrated for the helpdesk widget.
- **Anthropic**: AI fallback for Dream Car Finder.
- **Google Gemini**: Primary AI provider for Dream Car Finder (uses user's own API key, with Anthropic as fallback).
- **Resend**: Email delivery.
- **Google Cloud Vision**: OCR for document verification.