# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace connecting vehicle owners (members) with service providers. The application is built as a Progressive Web App (PWA) with native app support for iOS, Android, Windows, Mac, and Linux.

## Tech Stack
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Payments**: Stripe (integration configured)
- **PWA Features**: Service Worker, Web App Manifest, Offline Support
- **Mobile Apps**: Capacitor (iOS & Android)
- **Desktop Apps**: Electron (Windows, Mac, Linux)

## PWA Features
The app supports:
- **Install to Home Screen**: Users can add the app to their device's home screen
- **Offline Support**: Core pages are cached for offline access
- **App-like Experience**: Full-screen mode without browser chrome
- **Auto-updates**: Service worker handles app updates seamlessly

## Key Files

### PWA Files
- `manifest.json` - Web app manifest for installation
- `sw.js` - Service worker for offline support and caching
- `pwa-init.js` - PWA initialization and install prompt handling
- `icons/` - App icons for various sizes

### Application Files
- `index.html` - Landing page
- `login.html` - Authentication
- `signup-member.html` - Member registration
- `signup-provider.html` - Provider registration
- `members.html` - Member dashboard
- `providers.html` - Provider dashboard
- `admin.html` - Admin panel
- `fleet.html` - Fleet management
- `supabaseclient.js` - Supabase client + helper functions

### Database SQL Files
- `COMPLETE_DATABASE_SETUP.sql` - All 29 tables schema (run first)
- `RLS_POLICIES.sql` - Row-Level Security policies (212 policies for all tables)
- `SEED_DATA.sql` - Initial data including bid pack pricing tiers
- `SERVICE_SCHEDULING_SETUP.sql` - Service scheduling and coordination tables
- `RATING_SUSPENSION_SETUP.sql` - Provider rating suspension system with credit refunds

### Server
- `server.js` - Node.js static file server

### Native App Files
- `capacitor.config.json` - Capacitor configuration for mobile apps
- `android/` - Android native project (Capacitor)
- `ios/` - iOS native project (Capacitor)
- `electron/` - Desktop app (Electron)
  - `electron/main.js` - Main process entry point
  - `electron/preload.js` - Preload script for security
- `www/` - Web assets folder for native builds
- `scripts/build-www.sh` - Build script for native apps
- `NATIVE_APP_BUILD_GUIDE.md` - Complete build instructions

## Running the App
```bash
node server.js
```
Server runs on port 5000.

## User Roles
- `member` - Vehicle owners seeking services
- `provider` - Service professionals
- `pending_provider` - Awaiting admin approval
- `admin` - Platform administrators

## Dual Roles
Users can have dual roles:
- `is_also_member` - Provider who is also a member
- `is_also_provider` - Member who is also a provider

## Supabase Configuration
- **Project URL**: `https://ifbyjxuaclwmadqbjcyp.supabase.co`
- **Anon Key**: Configured in `supabaseclient.js`

## Database Setup Instructions

### Step 1: Run Table Schema
Run `COMPLETE_DATABASE_SETUP.sql` in Supabase SQL Editor to create all 29 tables:
- profiles, vehicles, maintenance_packages, bids
- notifications, messages, payments, disputes
- dispute_evidence, provider_applications, provider_documents
- provider_references, provider_external_reviews, provider_stats
- provider_reviews, upsell_requests, service_history, service_reminders
- bid_packs, bid_credit_purchases, package_photos
- support_tickets, ticket_messages, email_queue, sms_queue
- circumvention_reports, fleets, fleet_vehicles, fleet_approvals

### Step 2: Run RLS Policies
Run `RLS_POLICIES.sql` to enable Row-Level Security with 212 policies covering:
- 4 helper functions: is_admin(), is_provider(), is_member(), get_user_role()
- SELECT/INSERT/UPDATE/DELETE policies for all tables
- Role-based access control (member, provider, pending_provider, admin)
- Dual-role support

### Step 3: Run Seed Data
Run `SEED_DATA.sql` to populate initial data:
- Bid pack pricing tiers (Starter, Pro, Business, Enterprise)

## Bid Pack Pricing
| Pack | Bids | Bonus | Total | Price | Per Bid |
|------|------|-------|-------|-------|---------|
| Starter | 5 | 0 | 5 | $25 | $5.00 |
| Pro | 15 | 2 | 17 | $60 | $3.53 |
| Business | 30 | 5 | 35 | $100 | $2.86 |
| Enterprise | 75 | 15 | 90 | $200 | $2.22 |

## Stripe Integration
Stripe is configured for:
- Member payments for accepted services
- Provider bid credit purchases
- Platform fee collection (MCC fee)

To complete Stripe setup:
1. Enable the Stripe integration in Replit
2. Create Supabase Edge Functions for payment processing
3. Set up webhook endpoints for payment events

## Deployment
- **Live Site**: https://mycarconcierge.co
- **Netlify Site ID**: 9d5045cd-8b8e-4949-868a-8a92fa54d2e0
- **Deploy Command**: `NETLIFY_AUTH_TOKEN=$NETLIFY_AUTH_TOKEN npx netlify deploy --prod --dir=. --site=9d5045cd-8b8e-4949-868a-8a92fa54d2e0`

## Service Scheduling & Coordination System

After a bid is accepted, members and providers can coordinate the service:

### Features
- **Service Scheduling**: Propose, confirm, or counter-propose appointment times
- **Vehicle Transfer Coordination**: Track vehicle handoff status (pickup, at provider, work in progress, returning, returned)
- **Location Sharing**: Share real-time location via Google Maps links

### Transfer Methods
- Member drop-off at provider location
- Provider pickup from member location
- Mobile service (provider comes to member)
- Towing service

### Vehicle Status Flow
1. With Member → 2. In Transit → 3. At Provider → 4. Work In Progress → 5. Work Complete → 6. Returning → 7. Returned

### Database Tables (SERVICE_SCHEDULING_SETUP.sql)
- `service_appointments` - Tracks scheduled service dates
- `vehicle_transfers` - Tracks vehicle handoff between parties
- `location_shares` - Temporary location sharing

### Supabase Functions (supabaseclient.js)
- Appointment functions: createAppointment(), getAppointment(), confirmAppointment(), proposeNewTime()
- Transfer functions: createVehicleTransfer(), getVehicleTransfer(), updateVehicleStatus()
- Location functions: shareLocation(), getActiveLocationShare()

## Provider Rating & Suspension System

### Overview
Providers are rated 1-5 stars by members after service completion. If a provider's average rating drops below 4 stars (with 3+ reviews), they are automatically suspended from bidding and their remaining bid credits are refunded.

### Suspension Rules
- **Threshold**: Average rating below 4.0 stars
- **Minimum reviews**: 3 reviews required before suspension can trigger
- **When suspended**:
  - Cannot place new bids
  - All remaining bid credits are automatically refunded
  - Provider receives notification
- **Resolution**: Admin can lift suspension via `lift_provider_suspension()` function

### Database Setup (RATING_SUSPENSION_SETUP.sql)
Run this SQL migration in Supabase SQL Editor to enable the system:

**New Columns in provider_stats**:
- `suspended` (boolean) - Whether provider is suspended
- `suspended_reason` (text) - Reason for suspension
- `suspended_at` (timestamp) - When suspension occurred
- `suspension_lifted_at` (timestamp) - When admin lifted suspension

**New Table**: `credit_refunds`
- Tracks all refunds given to suspended providers

**Database Functions**:
- `calculate_provider_rating(provider_id)` - Calculate average rating
- `check_provider_suspension(provider_id)` - Check and suspend if needed
- `is_provider_suspended(provider_id)` - Check suspension status
- `lift_provider_suspension(provider_id, admin_id)` - Admin lifts suspension
- `get_provider_reviews_summary(provider_id)` - Get review statistics

**Trigger**: `check_suspension_after_review`
- Automatically checks for suspension after every new review

### Client Functions (supabaseclient.js)
- `checkProviderSuspension(providerId)` - Trigger suspension check
- `isProviderSuspended(providerId)` - Check if provider is suspended
- `getProviderReviewsSummary(providerId)` - Get review stats
- `getProviderReviews(providerId, limit, offset)` - Get review list
- `submitProviderReview(reviewData)` - Submit a review (triggers check)
- `getProviderCreditRefunds(providerId)` - Get refund history
- `canProviderBid(providerId)` - Check if provider can place bids

### UI Components
- **providers.html**: Suspension alert banner, rating warning banner
- **members.html**: Review submission modal with star rating

## Recent Changes
- **January 2026**:
  - Added expanded Turo-style footer with collapsible sections (Founder Programs, For Providers, For Members, Company)
  - Footer includes accessible button elements with ARIA attributes for screen readers
  - Footer accordion is responsive (collapsible on mobile, expanded on desktop)
  - Switched helpdesk widget from Anthropic to OpenAI for production reliability
  - Fixed iOS native app AI chat connectivity with CORS headers and production URL detection

- **December 2024**: 
  - Converted website to PWA with manifest.json and service worker
  - Created app icons from logo
  - Added PWA meta tags to all HTML pages
  - Created install prompt banner
  - Connected to Netlify for deployment
  - Set up complete database schema (29 tables) in Supabase
  - Created RLS_POLICIES.sql with 212 security policies
  - Created SEED_DATA.sql with bid pack pricing tiers
  - Configured Stripe integration for payments
  - Added Capacitor for mobile app builds (iOS/Android)
  - Added Electron for desktop app builds (Windows/Mac/Linux)
  - Created NATIVE_APP_BUILD_GUIDE.md with complete build instructions
  - Added service scheduling and coordination system (scheduling, vehicle transfer tracking, location sharing)
  - Created SERVICE_SCHEDULING_SETUP.sql with 3 new tables
  - Added logistics dashboard to members.html and providers.html
  - Added provider rating and suspension system with automatic refunds
  - Created RATING_SUSPENSION_SETUP.sql for database migration

## User Preferences
- Dark theme UI with gold and blue accents
- Premium, luxury aesthetic

## Next Steps
1. Run RATING_SUSPENSION_SETUP.sql in Supabase SQL Editor (file created at www/RATING_SUSPENSION_SETUP.sql)
2. Test provider rating and suspension flow
3. Create Supabase Edge Functions for Stripe payment processing
4. Test end-to-end payment flow
