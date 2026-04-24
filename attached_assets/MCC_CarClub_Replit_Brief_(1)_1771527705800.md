# MCC Car Club — Replit Research Brief

## Project Context

My Car Concierge (MCC) is an automotive service marketplace that connects vehicle owners with vetted service providers through competitive bidding. The platform is built with:

- **Frontend:** React + Capacitor (iOS/Android)
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **Payments:** Stripe
- **Stack:** JavaScript/TypeScript

---

## Feature to Research: Provider Car Clubs

### Concept Overview

Each service provider on MCC can create their own branded **Car Club** — a loyalty program they fully control. Members (vehicle owners) join a provider's club and earn rewards based on that provider's custom rules. The provider defines everything: the reward types, thresholds, and terms. MCC provides the infrastructure, tracking, and member-facing UI.

This is not a platform-wide points program. It is a **per-provider, independently configurable loyalty system** that lives inside MCC.

---

## Core Requirements to Research

### 1. Data Model
Research and propose a Supabase (PostgreSQL) schema that supports:

- A provider creating and configuring a car club
- Flexible, provider-defined reward types (punch card, percentage discount, flat credit, free service, priority booking, members-only pricing)
- Members joining one or more clubs
- Tracking member activity (visits, spend, bookings) per club
- Storing current point/punch balance per member per club
- Recording reward redemptions
- Supporting future extensibility (new reward types without schema changes)

### 2. Reward Type Flexibility
Research how to design a reward configuration system where:

- MCC defines the available **reward type templates** (e.g. "punch card", "spend-based discount", "visit milestone")
- Each provider fills in the **parameters** for each type they choose (e.g. punch threshold, discount percentage, qualifying service types)
- The system can evaluate whether a member has earned a reward without hardcoded logic per reward type
- New reward types can be added by MCC without breaking existing club configurations

Consider whether a JSON config column, an EAV pattern, or a typed reward_rules table is the best approach and explain the tradeoffs.

### 3. Member Dashboard
Research what data queries are needed to power a member-facing club dashboard that shows:

- All clubs the member has joined
- Their current balance/progress in each club (punches, points, spend)
- What reward they are working toward and how close they are
- What rewards they have already unlocked and can redeem
- Recent activity history per club

Write sample Supabase queries (SQL or JS client) for each of these views.

### 4. Provider Dashboard
Research what data and UI a provider needs to manage their club:

- Create and configure their club (name, description, reward rules)
- View total club membership count
- View per-member activity and reward status
- Manually issue or adjust a member's balance if needed
- View redemption history

### 5. Competitive Research
Research existing loyalty platform solutions and evaluate whether any could be integrated into MCC rather than built from scratch. Consider:

- **Stamp Me, Stamp Loyalty, Loopy Loyalty** — punch card SaaS products
- **Open Loyalty** — open source loyalty engine
- **LoyaltyLion, Yotpo Loyalty** — e-commerce loyalty platforms
- **Custom-built** — full in-house solution

For each, assess: API availability, pricing model, white-label capability, Supabase/React compatibility, and whether provider-defined reward rules are supported. Make a recommendation.

### 6. Notifications & Engagement
Research how to implement engagement triggers that remind members they are close to a reward:

- Push notification when a member is 1 visit or transaction away from a reward
- In-app badge on the club card showing progress
- Post-booking confirmation screen showing updated balance

Consider Supabase Edge Functions or database triggers for event-driven notifications and propose an implementation approach.

---

## Additional Mechanic: Referred Member Return Bonus

When a member books with and completes a job with the **same provider who originally referred them to MCC**, that provider is automatically credited **10 free bids**.

### Rules to Research and Implement

- **Trigger:** Job completed and payment confirmed between the referring provider and their referred member
- **Credit:** 10 free bids added to the provider's bid balance automatically
- **Stacking:** Credits stack — if multiple referred members book in the same period, the provider accumulates bids from each qualifying transaction
- **Expiration:** Free bids expire 90 days from the date they are credited — research how to implement a rolling expiration that doesn't wipe an entire balance at once
- **Attribution:** The referral link recorded at member signup is the source of truth — research how to reliably query the referring provider for any given member at job completion time

### Data and Logic to Research

- How to store and query the referral attribution chain (member → referring provider) efficiently at transaction time
- How to maintain a provider's free bid balance separately from purchased bids, with expiration timestamps per credit batch
- How to deduct free bids before paid bids when a provider places a new bid (free bids should be consumed first)
- Whether a Supabase database trigger or Edge Function is the better approach for crediting bids automatically on job completion
- How to surface the free bid balance and expiration timeline in the provider dashboard so providers can see what they've earned and when credits expire

### Value Communication Requirement

The platform must make the dollar value of 10 free bids explicitly clear at every point where they are mentioned — in the provider dashboard, in the notification that credits them, in onboarding materials, and in any marketing copy about the referral program. Providers should never have to do the math themselves.

Bids are sold in packs on a scaled pricing model — the larger the pack purchased, the lower the cost per bid. This means the displayed value of 10 free bids must be **personalized to each provider** based on the pack tier they most recently purchased. A provider on a small pack sees a higher per-bid value; a provider on a large pack sees a lower one. Both are accurate to their actual cost basis.

Research and propose how to implement this:

- **Per-provider bid cost reference:** The system should store each provider's most recent bid pack purchase and calculate their effective cost-per-bid from that transaction. This becomes their personal baseline for free bid value calculations
- **Dynamic value display:** Wherever free bids are surfaced — dashboard, notifications, onboarding — the UI pulls that provider's cost-per-bid and displays the dollar value accordingly: "10 free bids — a $[personalized value] savings based on your current pack"
- **Fallback for new providers:** Providers who have not yet purchased a pack should see value displayed based on the entry-level pack price, with a note that larger packs lower the per-bid cost
- **Cumulative earnings tracker:** The provider dashboard should show total free bids earned to date, the dollar value those bids represent at their current rate, and how many have been used vs. remaining — framed as money saved, not just a count
- **Credit notification copy:** When a referred member completes a job and triggers the 10-bid credit, the push notification should lead with the personalized dollar value: "You just earned $[X] in free bids because [Member] booked with you again"
- **Onboarding context:** During provider signup, the referral program explanation should anchor on real-world value using the entry-level pack rate as the baseline example, while noting that providers on larger packs may see different per-bid values

The goal is that a provider who earns 10 free bids never thinks of it as a point balance. They think of it as money saved — and they see exactly how much, calculated for them automatically.

---

## Deliverables

Please produce the following:

1. **Proposed Supabase schema** — full table definitions with relationships, indexes, and RLS policy recommendations
2. **Reward engine design** — how flexible provider-defined rules get evaluated at runtime
3. **Sample queries** — for member dashboard and provider dashboard views
4. **Competitive analysis table** — third-party solutions vs. custom build with a clear recommendation
5. **Notification architecture** — how near-milestone alerts get triggered and delivered
6. **Free bid balance system** — schema and logic for tracking, expiring, and consuming free bids separately from purchased bids
7. **Referred member return trigger** — recommended implementation (database trigger vs. Edge Function) for auto-crediting 10 free bids on qualifying job completions
8. **Open questions** — anything that needs product decisions before implementation can begin

---

## Constraints

- Must work within Supabase (no external database)
- Must support React frontend (no framework lock-in to a third-party loyalty UI)
- Stripe is already integrated — any spend-based rewards should reference Stripe payment records
- The solution must scale to hundreds of providers each with independent club configurations
- Keep it simple enough that a solo developer can implement it incrementally

---

## Goal

The research output should give the MCC development team enough information to make a build-vs-buy decision and, if building, a clear enough architecture to begin implementation without additional design work.
