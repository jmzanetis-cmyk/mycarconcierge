# My Car Concierge - PWA & Native Apps

## Overview
My Car Concierge (MCC) is an automotive service marketplace connecting vehicle owners (members) with service providers. It is built as a Progressive Web App (PWA) with broad native app support for iOS, Android, Windows, Mac, and Linux. The project aims to provide a comprehensive platform for automotive service coordination, from booking and payment to vehicle tracking and provider management, with a strong focus on security and user experience.

## User Preferences
- Dark theme UI with gold and blue accents
- Premium, luxury aesthetic

## System Architecture
The application is built with a modern web stack, leveraging vanilla HTML, CSS, and JavaScript for the frontend. Supabase serves as the backend, providing PostgreSQL for the database, authentication, and storage. The system is designed for multi-platform availability, utilizing PWA features for web access, Capacitor for iOS and Android mobile applications, and Electron for Windows, Mac, and Linux desktop applications.

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

## External Dependencies
- **Supabase**: Backend services including PostgreSQL database, authentication, and storage.
- **Stripe**: Payment processing for member services, provider bid credit purchases, and platform fee collection.
- **Capacitor**: Framework for building native iOS and Android mobile applications from web code.
- **Electron**: Framework for building cross-platform desktop applications (Windows, Mac, Linux).
- **Twilio**: Used for SMS-based Two-Factor Authentication (2FA) code delivery.
- **Netlify**: Deployment platform for the PWA.
- **OpenAI**: Integrated for the helpdesk widget.