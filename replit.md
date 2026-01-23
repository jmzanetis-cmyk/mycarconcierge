# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace PWA with broad native app support (iOS, Android, Windows, Mac, Linux). It connects vehicle owners with service providers, offering comprehensive solutions for booking, payment, vehicle tracking, and provider management, with a strong emphasis on security and user experience. The project aims to provide a robust platform for automotive service coordination.

## User Preferences
- **Automotive Theme**: Warmer dark slate backgrounds (#12161c) with bronze/copper gold accents and coolant teal highlights
- Premium, luxury garage-inspired aesthetic with metallic gradients on buttons and cards
- Less harsh dark mode with improved contrast and depth

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
- **Branded Email Templates**: Professional HTML email templates matching the app's dark theme.
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

## Performance Optimizations
- **Lazy-Loaded JS Modules**: Member and provider dashboards split into feature modules loaded on-demand, reducing initial load from ~500KB to ~25KB.
- **Preconnect Hints**: Early connection establishment for external APIs (Supabase, Stripe, CDN) to reduce latency.
- **Enhanced Service Worker Caching**: Cache-first for static assets, network-first with fallback for APIs, stale-while-revalidate for HTML pages.
- **Admin Dashboard Lazy Loading**: Sections load data on-demand when clicked, not on initial page load.
- **Server-Side Pagination**: Admin tables use paginated API endpoints with 25 items per page.

## External Dependencies
- **Supabase**: Backend services (PostgreSQL, authentication, storage).
- **Stripe**: Payment processing.
- **Capacitor**: Mobile app development.
- **Electron**: Desktop app development.
- **Twilio**: SMS for 2FA and notifications.
- **Netlify**: PWA deployment.
- **OpenAI**: Integrated for the helpdesk widget.
- **Anthropic**: AI search for Dream Car Finder.
- **Resend**: Email delivery.
- **Google Cloud Vision**: OCR for document verification.