# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace connecting vehicle owners (members) with service providers. It is built as a Progressive Web App (PWA) with broad native app support for iOS, Android, Windows, Mac, and Linux. The project aims to provide a comprehensive platform for automotive service coordination, from booking and payment to vehicle tracking and provider management, with a strong focus on security and user experience.

## User Preferences
- **Automotive Theme**: Warmer dark slate backgrounds (#12161c) with bronze/copper gold accents and coolant teal highlights
- Premium, luxury garage-inspired aesthetic with metallic gradients on buttons and cards
- Less harsh dark mode with improved contrast and depth

## System Architecture
The application is built with a modern web stack, leveraging vanilla HTML, CSS, and JavaScript for the frontend. JavaScript has been extracted into separate cached files for improved performance:
- `members.js` (~14,000 lines) - Member dashboard logic
- `providers.js` (~11,000 lines) - Provider dashboard logic

Supabase serves as the backend, providing PostgreSQL for the database, authentication, and storage. The system is designed for multi-platform availability, utilizing PWA features for web access, Capacitor for iOS and Android mobile applications, and Electron for Windows, Mac, and Linux desktop applications.

Key features include:
- **PWA Capabilities**: Install to Home Screen, offline support, app-like experience, and auto-updates through a service worker.
- **User Role Management**: Supports `member`, `provider`, `pending_provider`, and `admin` roles, with provisions for dual roles (`is_also_member`, `is_also_provider`).
- **Database Schema**: Comprises 29 core tables covering profiles, vehicles, maintenance packages, bids, notifications, payments, disputes, provider applications, service history, and more.
- **Row-Level Security (RLS)**: Implemented with 212 policies and helper functions (`is_admin()`, `is_provider()`, `is_member()`, `get_user_role()`) to ensure robust role-based access control.
- **Service Scheduling & Coordination**: Facilitates appointment scheduling, vehicle transfer tracking (pickup, at provider, work in progress, returning, returned), and temporary location sharing via Google Maps links.
- **Provider Rating & Suspension System**: Automatically suspends providers whose average rating drops below 4.0 stars (with 3+ reviews), refunds remaining bid credits, and notifies the provider. Admins can lift suspensions.
- **Two-Factor Authentication (2FA)**: SMS-based 2FA using Twilio, with server-side enforcement on over 65 protected API endpoints. Features include hashed codes, 5-minute expiry, 1-hour session validity, and database-backed rate limiting.
- **Provider Team Management**: Allows provider accounts to add multiple team members (Owner, Admin, Staff) with role-based access to the provider dashboard via an email invitation system.
- **My Next Car (Car Shopping Tool)**: Allows members to track and compare prospective vehicle purchases. Features include VIN lookup via free NHTSA API, manual vehicle entry, side-by-side comparison (2-4 vehicles), personal preferences with match scoring, and status tracking (considering, test driven, offer made, purchased, passed). Database tables: `prospect_vehicles`, `member_car_preferences`.
- **Dream Car Finder (AI Search)**: AI-powered automated car search that runs in the background to find vehicles matching member preferences. Features include customizable search criteria (make, model, year range, price range, mileage, location radius), search frequency settings (hourly, twice daily, daily), SMS/email notifications when matches are found, match scoring with reasons, and ability to save/dismiss matches or add them to prospects. Database tables: `dream_car_searches`, `dream_car_matches`. Uses Anthropic API for intelligent search.
- **Vehicle Ownership Verification (Google Vision OCR)**: Simplified vehicle ownership verification using Google Cloud Vision API. Members upload vehicle registration documents, system extracts owner name via OCR and compares to profile. Auto-approves if name match score >= 85%, flags for admin review if 65-85%, rejects if < 65%. Also extracts VIN and plate numbers. Admin dashboard section for reviewing flagged verifications. Loyal customer referrals (via provider QR codes) skip verification entirely. Database table: `registration_verifications`. Migration file: `registration_verification_migration.sql`. Requires GOOGLE_VISION_API_KEY.
- **Notification Preferences**: Members can control which notifications they receive via push, email, or SMS. Includes toggles for bid alerts, vehicle status updates, Dream Car Finder matches, maintenance reminders, and marketing communications. Database table: `notification_preferences`. Migration file: `notification_preferences_migration.sql`.
- **Push Notifications**: Web push notifications for instant alerts on desktop and mobile browsers. Supports bid alerts, vehicle status updates, Dream Car matches, and maintenance reminders. Requires VAPID_PUBLIC_KEY environment variable for production. Service worker handles push events and notification clicks.
- **Merch Store (Printful Integration)**: E-commerce shop for branded merchandise integrated with Printful print-on-demand. Features product catalog, shopping cart with localStorage persistence, Stripe checkout, and order tracking. Requires PRINTFUL_API_KEY for live products. Database table: `merch_orders`. Migration file: `merch_orders_migration.sql`.
- **Merch Manager (Admin Tool)**: Admin-only interface for creating and managing Printful products directly from the admin dashboard. Features include:
  - **Catalog Browser**: Browse t-shirts, hoodies, hats, drinkware, stickers, phone cases, bags with 30-minute caching
  - **Design Library**: Upload designs to Supabase storage with permanent URLs, auto-converts to PNG for print quality, drag-and-drop support, copy URL button
  - **Product Creator**: Color/size variant selection, design picker from library, retail price setting, mockup preview before creation
  - **Bulk Creator**: Create products across multiple categories at once with one design and default variants
  - **Admin Preferences**: Save default price, markup percentage, and favorite colors in localStorage
  - API endpoints: `/api/admin/printful/catalog`, `/api/admin/printful/products`, `/api/admin/printful/mockup`, `/api/admin/designs/*`. All endpoints require admin authentication.
- **Automated Maintenance Reminders**: System tracks vehicle maintenance schedules (oil changes, tire rotations, inspections, etc.) and sends reminders via email/SMS/push when service is due. Default schedules created for new vehicles. Database table: `maintenance_schedules`. Migration file: `maintenance_schedules_migration.sql`.
- **Provider Push Notifications**: Providers can receive push notifications for new bid opportunities, appointment reminders, payment received, and customer messages. Database table: `provider_notification_preferences`. Migration file: `provider_notification_preferences_migration.sql`.
- **Branded Email Templates**: Professional HTML email templates with dark theme matching the app. Includes Dream Car match notifications, maintenance reminders, bid alerts with improved styling.

## Performance Optimizations
- **Gzip Compression**: All text-based responses (HTML, CSS, JS, JSON) are compressed, reducing transfer size by 60-80%
- **Product Caching**: Shop products are cached for 5 minutes to reduce Printful API calls
- **Lazy Loading**: Shop product images use lazy loading with skeleton placeholders
- **Admin Stats Caching**: Dashboard statistics cached for 5 minutes to reduce database queries
- **Static Asset Caching**: JS/CSS cached 1 day, images cached 7 days, fonts cached 30 days with stale-while-revalidate
- **Resource Preloading**: Critical JS, CSS, and images preloaded in HTML head for faster initial render
- **Scheduled Tasks**: Maintenance reminder checks run automatically every 24 hours (configurable via ENABLE_MAINTENANCE_SCHEDULER env var)
- **Login Activity Cleanup**: Automatically removes login activity entries older than 90 days (runs daily)
- **Admin Dashboard Lazy Loading**: Sections load data on-demand when clicked, not on initial page load. Uses efficient count queries for dashboard stats.
- **Server-Side Pagination**: Admin tables (providers, members, packages) use paginated API endpoints with 25 items per page, server-side search and filtering.
- **Consolidated Chat Widgets**: AI chat and helpdesk widgets share a common ChatWidgetBase class (www/chat-widget-base.js) reducing code duplication by ~70%.
- **Configurable URLs**: Site URLs loaded from /api/config endpoint and SITE_URL environment variable via www/mcc-config.js for easy environment switching.

## Business Features
- **Provider Loyalty Referral System**: Comprehensive provider-driven referral program with three QR code types:
  - **Loyal Customer QR (Gold)**: Provider vouches for existing customers. Benefits: skip identity verification, 0% platform fee forever, auto-linked as preferred provider, loyalty badges (VIP Member, Trusted Customer). Signup page: `signup-loyal-customer.html`.
  - **New Member QR (Blue)**: Standard member signup with referral tracking and bonus credits. Modified `signup-member.html`.
  - **Provider QR (Green)**: Refer other service providers to the platform with tracking. Modified `signup-provider.html`.
  - **Exclusive First Look**: Preferred providers get 24-hour exclusive bidding window before jobs open to all providers.
  - **Private Jobs**: Loyal customers can send service requests directly to their preferred provider without public bidding.
  - **Loyalty Network Dashboard**: Provider section showing referral stats, QR code usage, and recent referrals list.
  - Database fields: `referred_by_provider_id`, `provider_referral_type`, `platform_fee_exempt`, `provider_verified`, `preferred_provider_id`, `exclusive_provider_id`, `exclusive_until`, `is_private_job`. Tables: `provider_referral_codes`, `provider_referrals`. Migration file: `provider_referrals_migration.sql`.
  - Server-side enforcement for exclusive/private job visibility to prevent API bypass.
- **Referral Program**: Members earn $10 credit for referring friends, new members get $10 welcome bonus. Unique referral codes, share via email/SMS. Database table: `referrals`, `member_credits`. Migration file: `referrals_migration.sql`.
- **Vehicle Recall Alerts**: Auto-check NHTSA database for safety recalls. Weekly scheduled checks. Badge on vehicles with active recalls. Database table: `vehicle_recalls`. Migration file: `vehicle_recalls_migration.sql`.
- **Fuel Cost Tracking**: Track fill-ups, calculate MPG, monthly/yearly spending, cost per mile with trend charts. Database table: `fuel_logs`. Migration file: `fuel_logs_migration.sql`.
- **Insurance Card Storage**: Upload and store insurance documents with expiration tracking. Supports PDF, JPG, PNG. Database table: `insurance_documents`. Migration file: `insurance_documents_migration.sql`.
- **Service History Export**: Download service records as PDF or CSV with professional formatting.

## Security Features
- **API Rate Limiting**: In-memory rate limiting to prevent abuse. Login: 5/min, SMS/2FA: 3/min, API: 100/min, Public: 30/min.
- **Login Activity Log**: Track login history with device, browser, IP. Alert on failed attempts. Database table: `login_activity`. Migration file: `login_activity_migration.sql`.
- **SMS Appointment Reminders**: Text members 24 hours before scheduled service. Runs hourly. Migration file: `appointment_reminders_migration.sql`.

## UX Features
- **Theme Toggle**: Light/dark mode preference saved to localStorage. Sun/moon toggle in sidebar.
- **Admin Dashboard Charts**: Revenue, user growth, and order statistics with Chart.js visualizations.

## External Dependencies
- **Supabase**: Backend services including PostgreSQL database, authentication, and storage.
- **Stripe**: Payment processing for member services, provider bid credit purchases, and platform fee collection.
- **Capacitor**: Framework for building native iOS and Android mobile applications from web code.
- **Electron**: Framework for building cross-platform desktop applications (Windows, Mac, Linux).
- **Twilio**: Used for SMS-based Two-Factor Authentication (2FA) code delivery and Dream Car Finder match notifications.
- **Netlify**: Deployment platform for the PWA.
- **OpenAI**: Integrated for the helpdesk widget.
- **Anthropic**: Used for Dream Car Finder AI search functionality.
- **Resend**: Email delivery for Dream Car Finder notifications and other transactional emails.
- **Google Cloud Vision**: OCR for vehicle registration document verification.