# MCC Car Club — Research & Architecture Document

**Prepared for:** My Car Concierge Development Team
**Date:** February 19, 2026
**Status:** Research Complete — Ready for Build/Buy Decision

---

## Table of Contents

1. [Competitive Analysis](#1-competitive-analysis)
2. [Recommendation: Build vs. Buy](#2-recommendation)
3. [Proposed Supabase Schema](#3-proposed-supabase-schema)
4. [Reward Engine Design](#4-reward-engine-design)
5. [Sample Queries — Member Dashboard](#5-sample-queries-member-dashboard)
6. [Sample Queries — Provider Dashboard](#6-sample-queries-provider-dashboard)
7. [Notification Architecture](#7-notification-architecture)
8. [Free Bid Balance System](#8-free-bid-balance-system)
9. [Referred Member Return Trigger](#9-referred-member-return-trigger)
10. [Open Questions](#10-open-questions)

---

## 1. Competitive Analysis

### Third-Party Loyalty Platforms Evaluated

| Platform | API Available | White-Label | Provider-Defined Rules | Supabase/React Compatible | Per-Provider Config | Pricing | Verdict |
|----------|:---:|:---:|:---:|:---:|:---:|---------|---------|
| **Stamp Me** | Limited REST API | Yes (branding) | No — single merchant model | Partial (REST) | No — one config per account | $59–299/mo per location | Not viable for marketplace |
| **Stamp Loyalty** | REST API | Yes (branding) | Limited — template-based | Partial (REST) | No — single merchant per account | $39–149/mo per program | Not viable for marketplace |
| **Loopy Loyalty** | No public API | Yes (branding) | No — fixed punch card only | No (web widget only) | No | $15–45/mo per card | Too limited |
| **Open Loyalty** | Full REST + GraphQL | Yes (self-hosted) | Partial — rule engine exists but complex | Yes (headless) | Possible but requires multi-tenancy layer | Self-hosted free; cloud $500+/mo | Closest fit but heavy overhead |
| **LoyaltyLion** | REST API | Partial | No — designed for single Shopify store | Partial | No | $159–729/mo | E-commerce only |
| **Yotpo Loyalty** | REST API | Partial | Limited | Partial | No | $199+/mo | E-commerce only |
| **Custom Build** | Full control | Full control | Full control | Native | Native | Dev time only | Best fit |

### Analysis Summary

**Stamp Me / Stamp Loyalty / Loopy Loyalty:** Consumer-facing punch card and loyalty card apps. All designed for a single merchant operating their own program. No API depth for marketplace integration where hundreds of independent providers each need their own config. Each provider would need a separate paid account — at $39–299/mo each, the costs scale linearly with provider count. No way to unify the member experience inside MCC. Stamp Loyalty has slightly more API capability than Stamp Me but still lacks multi-tenant support.

**Open Loyalty:** The most capable option. It has a rule engine, API-first architecture, and could theoretically support multi-tenant provider configs. However:
- Requires self-hosting or expensive cloud plan ($500+/mo)
- Multi-tenancy (one club per provider) would need a custom abstraction layer on top
- The rule engine is generic — adapting it to MCC's specific reward types adds complexity
- Adds an external dependency for a core feature
- Member data would live outside Supabase, complicating queries and RLS

**LoyaltyLion / Yotpo:** Built for e-commerce (Shopify/BigCommerce). Wrong domain entirely.

---

## 2. Recommendation

**Build custom on Supabase.**

Rationale:
- No third-party platform supports per-provider independent configuration in a marketplace context without significant custom work
- The data model is straightforward — 6-8 new tables with JSONB config columns
- Building in Supabase keeps everything under one roof: auth, RLS, real-time subscriptions, and existing payment/booking data
- A solo developer can implement this incrementally — start with punch cards, add complexity later
- No monthly SaaS fees scaling with provider count
- Full control over the member experience inside the MCC app

The total schema is simpler than the existing provider application system. The reward engine logic is ~200 lines of JavaScript evaluating JSONB configs.

---

## 3. Proposed Supabase Schema

### 3.1 Core Tables

```sql
-- ============================================
-- CAR CLUBS
-- One club per provider. Stores branding and status.
-- ============================================
CREATE TABLE car_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  is_active BOOLEAN DEFAULT true,
  welcome_message TEXT,
  terms_and_conditions TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(provider_id) -- One club per provider
);

CREATE INDEX idx_car_clubs_provider ON car_clubs(provider_id);
CREATE INDEX idx_car_clubs_active ON car_clubs(is_active) WHERE is_active = true;


-- ============================================
-- REWARD TYPE TEMPLATES
-- MCC-defined templates that providers choose from.
-- Seeded by MCC admins. Providers never edit these directly.
-- ============================================
CREATE TABLE reward_type_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,       -- e.g. 'punch_card', 'spend_discount', 'visit_milestone'
  name VARCHAR(100) NOT NULL,              -- e.g. 'Punch Card'
  description TEXT,
  icon VARCHAR(50),                        -- icon name for UI
  parameter_schema JSONB NOT NULL,         -- JSON Schema defining what params the provider must fill in
  evaluation_logic VARCHAR(50) NOT NULL,   -- key that maps to a JS evaluation function
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed data (see Section 4 for parameter_schema details)


-- ============================================
-- CLUB REWARD RULES
-- Provider-configured rewards for their club.
-- References a template + provider-supplied parameters.
-- ============================================
CREATE TABLE club_reward_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES car_clubs(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES reward_type_templates(id),
  name VARCHAR(100) NOT NULL,              -- Provider's label: "Free Oil Change"
  description TEXT,                        -- Provider's description
  parameters JSONB NOT NULL,               -- Provider-filled values matching template's parameter_schema
  is_active BOOLEAN DEFAULT true,
  max_redemptions_per_member INTEGER,      -- NULL = unlimited
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reward_rules_club ON club_reward_rules(club_id);
CREATE INDEX idx_reward_rules_active ON club_reward_rules(is_active) WHERE is_active = true;


-- ============================================
-- CLUB MEMBERSHIPS
-- Junction table: which members belong to which clubs.
-- ============================================
CREATE TABLE club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES car_clubs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  
  UNIQUE(club_id, member_id)
);

CREATE INDEX idx_memberships_member ON club_memberships(member_id);
CREATE INDEX idx_memberships_club ON club_memberships(club_id);


-- ============================================
-- MEMBER CLUB BALANCES
-- Current balance/progress per member per club per reward rule.
-- Denormalized for fast dashboard reads.
-- ============================================
CREATE TABLE member_club_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES club_memberships(id) ON DELETE CASCADE,
  reward_rule_id UUID NOT NULL REFERENCES club_reward_rules(id) ON DELETE CASCADE,
  
  -- Flexible balance fields — which one matters depends on the reward type
  punch_count INTEGER DEFAULT 0,
  total_spend NUMERIC(10,2) DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  points_balance INTEGER DEFAULT 0,
  
  last_activity_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(membership_id, reward_rule_id)
);

CREATE INDEX idx_balances_membership ON member_club_balances(membership_id);


-- ============================================
-- CLUB ACTIVITY LOG
-- Every qualifying action (visit, spend, booking) recorded here.
-- Source of truth for balance calculations.
-- ============================================
CREATE TABLE club_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES club_memberships(id) ON DELETE CASCADE,
  reward_rule_id UUID REFERENCES club_reward_rules(id),
  
  activity_type VARCHAR(30) NOT NULL,      -- 'visit', 'spend', 'booking', 'manual_adjustment'
  amount NUMERIC(10,2),                    -- dollar amount for spend-based
  quantity INTEGER DEFAULT 1,              -- punch count for punch-based
  description TEXT,                        -- "Oil change — $45.00" or "Manual +2 punches by provider"
  
  -- Link to source records
  job_id UUID,                             -- references the completed job if applicable
  payment_id UUID,                         -- references Stripe payment if applicable
  adjusted_by UUID REFERENCES profiles(id), -- provider ID if manual adjustment
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_membership ON club_activity_log(membership_id);
CREATE INDEX idx_activity_created ON club_activity_log(created_at);


-- ============================================
-- REWARD REDEMPTIONS
-- When a member cashes in a reward.
-- ============================================
CREATE TABLE club_reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES club_memberships(id) ON DELETE CASCADE,
  reward_rule_id UUID NOT NULL REFERENCES club_reward_rules(id),
  
  status VARCHAR(20) DEFAULT 'available',  -- 'available', 'redeemed', 'expired', 'voided'
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  redeemed_at TIMESTAMPTZ,
  redeemed_job_id UUID,                    -- job where this was applied
  voided_by UUID REFERENCES profiles(id),
  voided_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_redemptions_membership ON club_reward_redemptions(membership_id);
CREATE INDEX idx_redemptions_status ON club_reward_redemptions(status);
```

### 3.2 Free Bid Credits Table (for Referred Member Return Bonus)

```sql
-- ============================================
-- FREE BID CREDITS
-- Tracks free bid batches with individual expiration dates.
-- Separate from purchased bid_credits on the profile.
-- ============================================
CREATE TABLE free_bid_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  bids_credited INTEGER NOT NULL,
  bids_remaining INTEGER NOT NULL,
  
  source VARCHAR(50) NOT NULL,             -- 'referred_member_return', 'promotion', 'manual'
  source_job_id UUID,                      -- the job that triggered this credit
  source_member_id UUID,                   -- the referred member who booked
  
  credited_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,         -- 90 days from credited_at
  
  is_expired BOOLEAN DEFAULT false,
  expired_at TIMESTAMPTZ
);

CREATE INDEX idx_free_bids_provider ON free_bid_credits(provider_id);
CREATE INDEX idx_free_bids_active ON free_bid_credits(provider_id, is_expired) 
  WHERE is_expired = false AND bids_remaining > 0;
CREATE INDEX idx_free_bids_expiry ON free_bid_credits(expires_at) 
  WHERE is_expired = false;
```

### 3.3 RLS Policy Recommendations

```sql
-- Car Clubs: Providers can manage their own club; members can read active clubs
ALTER TABLE car_clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers manage own club" ON car_clubs
  FOR ALL USING (provider_id = auth.uid());
CREATE POLICY "Anyone can read active clubs" ON car_clubs
  FOR SELECT USING (is_active = true);

-- Club Memberships: Members can join (insert) and leave (update is_active); providers can read their club's members
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can join clubs" ON club_memberships
  FOR INSERT WITH CHECK (member_id = auth.uid());
CREATE POLICY "Members can read own memberships" ON club_memberships
  FOR SELECT USING (member_id = auth.uid());
CREATE POLICY "Members can leave clubs" ON club_memberships
  FOR UPDATE USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());
CREATE POLICY "Providers read own club members" ON club_memberships
  FOR SELECT USING (
    club_id IN (SELECT id FROM car_clubs WHERE provider_id = auth.uid())
  );

-- Reward Rules: Providers manage own; members read active rules for joined clubs
ALTER TABLE club_reward_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers manage own rules" ON club_reward_rules
  FOR ALL USING (
    club_id IN (SELECT id FROM car_clubs WHERE provider_id = auth.uid())
  );
CREATE POLICY "Members read active rules" ON club_reward_rules
  FOR SELECT USING (
    is_active = true AND club_id IN (
      SELECT club_id FROM club_memberships WHERE member_id = auth.uid()
    )
  );

-- Balances: Members read own; providers read for their club members
ALTER TABLE member_club_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own balances" ON member_club_balances
  FOR SELECT USING (
    membership_id IN (SELECT id FROM club_memberships WHERE member_id = auth.uid())
  );
CREATE POLICY "Providers read own club balances" ON member_club_balances
  FOR SELECT USING (
    membership_id IN (
      SELECT cm.id FROM club_memberships cm
      JOIN car_clubs cc ON cm.club_id = cc.id
      WHERE cc.provider_id = auth.uid()
    )
  );

-- Activity Log: Append-only for audit integrity. No updates or deletes allowed.
ALTER TABLE club_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own activity" ON club_activity_log
  FOR SELECT USING (
    membership_id IN (SELECT id FROM club_memberships WHERE member_id = auth.uid())
  );
CREATE POLICY "Providers read own club activity" ON club_activity_log
  FOR SELECT USING (
    membership_id IN (
      SELECT cm.id FROM club_memberships cm
      JOIN car_clubs cc ON cm.club_id = cc.id
      WHERE cc.provider_id = auth.uid()
    )
  );
CREATE POLICY "Providers insert own club activity" ON club_activity_log
  FOR INSERT WITH CHECK (
    membership_id IN (
      SELECT cm.id FROM club_memberships cm
      JOIN car_clubs cc ON cm.club_id = cc.id
      WHERE cc.provider_id = auth.uid()
    )
  );
-- NOTE: No UPDATE or DELETE policies. Activity log is immutable for reward integrity.
-- Manual adjustments are new INSERT rows with activity_type = 'manual_adjustment'.

-- Redemptions: Members read own; providers read/update for their club
ALTER TABLE club_reward_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own redemptions" ON club_reward_redemptions
  FOR SELECT USING (
    membership_id IN (SELECT id FROM club_memberships WHERE member_id = auth.uid())
  );
CREATE POLICY "Providers manage own club redemptions" ON club_reward_redemptions
  FOR ALL USING (
    membership_id IN (
      SELECT cm.id FROM club_memberships cm
      JOIN car_clubs cc ON cm.club_id = cc.id
      WHERE cc.provider_id = auth.uid()
    )
  );

-- Free Bid Credits: Providers read own only
ALTER TABLE free_bid_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers read own free bids" ON free_bid_credits
  FOR SELECT USING (provider_id = auth.uid());
```

---

## 4. Reward Engine Design

### 4.1 Template Parameter Schema (JSONB)

Each reward type template defines a `parameter_schema` that tells the provider config UI what fields to show. The provider fills in the values, which get stored in `club_reward_rules.parameters`.

```json
// PUNCH CARD template parameter_schema
{
  "type": "object",
  "properties": {
    "punches_required": {
      "type": "integer",
      "label": "Punches needed for reward",
      "min": 2,
      "max": 50,
      "default": 10
    },
    "qualifying_services": {
      "type": "array",
      "label": "Which services count as a punch?",
      "items": "service_type",
      "description": "Leave empty for all services"
    },
    "reward_description": {
      "type": "string",
      "label": "What does the member get?",
      "placeholder": "Free oil change"
    },
    "reward_value": {
      "type": "number",
      "label": "Approximate value ($)",
      "min": 0
    },
    "auto_reset": {
      "type": "boolean",
      "label": "Reset punch count after reward?",
      "default": true
    }
  },
  "required": ["punches_required", "reward_description"]
}

// SPEND-BASED DISCOUNT template parameter_schema
{
  "type": "object",
  "properties": {
    "spend_threshold": {
      "type": "number",
      "label": "Spend this much ($) to earn reward",
      "min": 50
    },
    "discount_type": {
      "type": "string",
      "label": "Discount type",
      "enum": ["percentage", "flat_credit"],
      "default": "percentage"
    },
    "discount_value": {
      "type": "number",
      "label": "Discount amount (% or $)",
      "min": 1
    },
    "qualifying_services": {
      "type": "array",
      "items": "service_type"
    },
    "max_discount": {
      "type": "number",
      "label": "Maximum discount cap ($)",
      "description": "For percentage discounts"
    }
  },
  "required": ["spend_threshold", "discount_type", "discount_value"]
}

// VISIT MILESTONE template parameter_schema
{
  "type": "object",
  "properties": {
    "visits_required": {
      "type": "integer",
      "label": "Number of visits to earn reward",
      "min": 2
    },
    "reward_type": {
      "type": "string",
      "label": "Reward type",
      "enum": ["free_service", "discount", "priority_booking", "members_only_pricing"]
    },
    "reward_description": {
      "type": "string",
      "label": "Describe the reward"
    },
    "reward_value": {
      "type": "number",
      "label": "Approximate value ($)"
    },
    "is_recurring": {
      "type": "boolean",
      "label": "Repeats after earning?",
      "default": false
    }
  },
  "required": ["visits_required", "reward_type", "reward_description"]
}
```

### 4.2 Evaluation Logic

The reward engine is a set of pure functions that take a member's balance and a rule's parameters, and return progress/eligibility. This runs client-side for display and server-side for validation.

```javascript
// www/lib/reward-engine.js

const RewardEngine = {
  
  /**
   * Evaluate a member's progress toward a reward.
   * Returns { progress, threshold, percentage, isEarned, label }
   */
  evaluate(templateSlug, balance, parameters) {
    const evaluator = this.evaluators[templateSlug];
    if (!evaluator) {
      console.warn(`No evaluator for reward type: ${templateSlug}`);
      return { progress: 0, threshold: 0, percentage: 0, isEarned: false, label: '' };
    }
    return evaluator(balance, parameters);
  },

  evaluators: {
    
    punch_card(balance, params) {
      const current = balance.punch_count || 0;
      const needed = params.punches_required;
      return {
        progress: current,
        threshold: needed,
        percentage: Math.min(100, Math.round((current / needed) * 100)),
        isEarned: current >= needed,
        label: `${current} / ${needed} punches`,
        remaining: Math.max(0, needed - current),
        nearMilestone: (needed - current) <= 1 && current > 0
      };
    },

    spend_discount(balance, params) {
      const current = parseFloat(balance.total_spend || 0);
      const needed = params.spend_threshold;
      return {
        progress: current,
        threshold: needed,
        percentage: Math.min(100, Math.round((current / needed) * 100)),
        isEarned: current >= needed,
        label: `$${current.toFixed(2)} / $${needed.toFixed(2)} spent`,
        remaining: Math.max(0, needed - current),
        nearMilestone: (needed - current) <= (needed * 0.1) && current > 0
      };
    },

    visit_milestone(balance, params) {
      const current = balance.visit_count || 0;
      const needed = params.visits_required;
      return {
        progress: current,
        threshold: needed,
        percentage: Math.min(100, Math.round((current / needed) * 100)),
        isEarned: current >= needed,
        label: `${current} / ${needed} visits`,
        remaining: Math.max(0, needed - current),
        nearMilestone: (needed - current) <= 1 && current > 0
      };
    }
  },

  /**
   * Check if a service/job qualifies for a specific reward rule.
   */
  isQualifyingService(serviceType, parameters) {
    if (!parameters.qualifying_services || parameters.qualifying_services.length === 0) {
      return true; // All services qualify
    }
    return parameters.qualifying_services.includes(serviceType);
  },

  /**
   * Calculate the discount/reward value for a redemption.
   */
  calculateRewardValue(templateSlug, parameters, jobAmount) {
    if (templateSlug === 'spend_discount') {
      if (parameters.discount_type === 'percentage') {
        const discount = jobAmount * (parameters.discount_value / 100);
        return parameters.max_discount ? Math.min(discount, parameters.max_discount) : discount;
      }
      return parameters.discount_value; // flat credit
    }
    return parameters.reward_value || 0;
  }
};
```

### 4.3 Adding New Reward Types

To add a new reward type (e.g., "Tiered Loyalty" or "Birthday Bonus"):

1. Insert a new row in `reward_type_templates` with the slug, parameter_schema, and evaluation_logic key
2. Add a matching evaluator function in `RewardEngine.evaluators`
3. No schema changes. No migration. Existing clubs are unaffected.

This is the key advantage of the JSONB approach — the `parameters` column stores whatever shape the template defines, and the evaluation function knows how to interpret it.

---

## 5. Sample Queries — Member Dashboard

### 5.1 All Clubs the Member Has Joined

```javascript
// Note: car_clubs stores provider_id which references profiles.
// Provider business details (business_name, city, state) live on the
// provider_applications table joined via user_id. For simplicity, 
// denormalize key display fields onto car_clubs (name, logo_url already there)
// or join through provider_applications.

const { data: myClubs } = await supabaseClient
  .from('club_memberships')
  .select(`
    id,
    joined_at,
    club:car_clubs (
      id, name, description, logo_url, banner_url,
      provider_id
    )
  `)
  .eq('member_id', userId)
  .eq('is_active', true);

// Then fetch provider display names separately if needed:
// const providerIds = myClubs.map(c => c.club.provider_id);
// const { data: providers } = await supabaseClient
//   .from('provider_applications')
//   .select('user_id, business_name, city, state')
//   .in('user_id', providerIds);
```

### 5.2 Current Balance/Progress Per Club

```javascript
const { data: balances } = await supabaseClient
  .from('member_club_balances')
  .select(`
    punch_count, total_spend, visit_count, points_balance,
    last_activity_at,
    reward_rule:club_reward_rules (
      id, name, description, parameters, is_active,
      template:reward_type_templates (slug, name, icon)
    ),
    membership:club_memberships (
      club:car_clubs (id, name, logo_url)
    )
  `)
  .eq('membership_id', membershipId);

// Then evaluate each with the reward engine:
const progress = balances.map(b => ({
  ...b,
  evaluation: RewardEngine.evaluate(
    b.reward_rule.template.slug,
    b,
    b.reward_rule.parameters
  )
}));
```

### 5.3 Available (Unlocked, Unredeemed) Rewards

```javascript
const { data: availableRewards } = await supabaseClient
  .from('club_reward_redemptions')
  .select(`
    id, unlocked_at,
    reward_rule:club_reward_rules (
      name, description, parameters,
      template:reward_type_templates (slug, name, icon)
    ),
    membership:club_memberships (
      club:car_clubs (id, name, logo_url)
    )
  `)
  .in('membership_id', myMembershipIds)
  .eq('status', 'available');
```

### 5.4 Recent Activity History

```javascript
const { data: activity } = await supabaseClient
  .from('club_activity_log')
  .select(`
    activity_type, amount, quantity, description, created_at,
    membership:club_memberships (
      club:car_clubs (name, logo_url)
    )
  `)
  .eq('membership_id', membershipId)
  .order('created_at', { ascending: false })
  .limit(20);
```

---

## 6. Sample Queries — Provider Dashboard

### 6.1 Club Overview (Membership Count + Stats)

```javascript
// Get club details
const { data: club } = await supabaseClient
  .from('car_clubs')
  .select(`
    *,
    reward_rules:club_reward_rules (
      id, name, is_active,
      template:reward_type_templates (slug, name, icon)
    )
  `)
  .eq('provider_id', providerId)
  .single();

// Get member count separately (Supabase count requires a separate query)
const { count: memberCount } = await supabaseClient
  .from('club_memberships')
  .select('*', { count: 'exact', head: true })
  .eq('club_id', club.id)
  .eq('is_active', true);
```

```sql
-- SQL: Club stats summary
SELECT 
  cc.id,
  cc.name,
  COUNT(DISTINCT cm.member_id) AS total_members,
  COUNT(DISTINCT cm.member_id) FILTER (
    WHERE cm.joined_at > now() - INTERVAL '30 days'
  ) AS new_members_30d,
  COUNT(cr.id) FILTER (WHERE cr.status = 'redeemed') AS total_redemptions,
  COUNT(cr.id) FILTER (
    WHERE cr.status = 'redeemed' AND cr.redeemed_at > now() - INTERVAL '30 days'
  ) AS redemptions_30d
FROM car_clubs cc
LEFT JOIN club_memberships cm ON cm.club_id = cc.id AND cm.is_active = true
LEFT JOIN club_reward_redemptions cr ON cr.membership_id = cm.id
WHERE cc.provider_id = $1
GROUP BY cc.id;
```

### 6.2 Per-Member Activity View

```sql
SELECT 
  p.full_name,
  p.email,
  cm.joined_at,
  mcb.punch_count,
  mcb.total_spend,
  mcb.visit_count,
  mcb.last_activity_at,
  crr.name AS working_toward,
  COUNT(cr.id) FILTER (WHERE cr.status = 'available') AS rewards_available,
  COUNT(cr.id) FILTER (WHERE cr.status = 'redeemed') AS rewards_redeemed
FROM club_memberships cm
JOIN profiles p ON p.id = cm.member_id
JOIN car_clubs cc ON cc.id = cm.club_id
LEFT JOIN member_club_balances mcb ON mcb.membership_id = cm.id
LEFT JOIN club_reward_rules crr ON crr.id = mcb.reward_rule_id
LEFT JOIN club_reward_redemptions cr ON cr.membership_id = cm.id
WHERE cc.provider_id = $1
  AND cm.is_active = true
GROUP BY p.id, cm.id, mcb.id, crr.id
ORDER BY mcb.last_activity_at DESC NULLS LAST;
```

### 6.3 Manual Balance Adjustment

```javascript
async function adjustMemberBalance(providerId, membershipId, rewardRuleId, adjustment) {
  // Record the activity
  await supabaseClient.from('club_activity_log').insert({
    membership_id: membershipId,
    reward_rule_id: rewardRuleId,
    activity_type: 'manual_adjustment',
    quantity: adjustment.punches || 0,
    amount: adjustment.spend || 0,
    description: adjustment.reason,
    adjusted_by: providerId
  });

  // Update the balance
  const updates = {};
  if (adjustment.punches) updates.punch_count = supabaseClient.rpc('increment_field', {
    table: 'member_club_balances', field: 'punch_count', amount: adjustment.punches
  });
  // ... similar for other fields

  await supabaseClient
    .from('member_club_balances')
    .update({
      punch_count: supabaseClient.sql`punch_count + ${adjustment.punches || 0}`,
      total_spend: supabaseClient.sql`total_spend + ${adjustment.spend || 0}`,
      visit_count: supabaseClient.sql`visit_count + ${adjustment.visits || 0}`,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('membership_id', membershipId)
    .eq('reward_rule_id', rewardRuleId);
}
```

### 6.4 Redemption History

```sql
SELECT 
  cr.id,
  cr.status,
  cr.unlocked_at,
  cr.redeemed_at,
  crr.name AS reward_name,
  crr.parameters->>'reward_description' AS reward_description,
  p.full_name AS member_name
FROM club_reward_redemptions cr
JOIN club_reward_rules crr ON crr.id = cr.reward_rule_id
JOIN club_memberships cm ON cm.id = cr.membership_id
JOIN profiles p ON p.id = cm.member_id
JOIN car_clubs cc ON cc.id = cm.club_id
WHERE cc.provider_id = $1
ORDER BY cr.created_at DESC
LIMIT 50;
```

---

## 7. Notification Architecture

### 7.1 Approach: Database Trigger + Server-Side Push

The most reliable approach for MCC's architecture is a **database trigger on `club_activity_log`** that calls a server-side function to check near-milestone status and queue notifications.

```sql
-- Trigger function: fires after every activity log insert
CREATE OR REPLACE FUNCTION check_reward_milestone()
RETURNS TRIGGER AS $$
DECLARE
  v_balance RECORD;
  v_rule RECORD;
  v_template_slug TEXT;
  v_member_id UUID;
BEGIN
  -- Get the current balance for this membership + reward rule
  SELECT * INTO v_balance
  FROM member_club_balances
  WHERE membership_id = NEW.membership_id
    AND reward_rule_id = NEW.reward_rule_id;
  
  IF NOT FOUND THEN RETURN NEW; END IF;
  
  -- Get the reward rule and template
  SELECT crr.*, rtt.slug AS template_slug
  INTO v_rule
  FROM club_reward_rules crr
  JOIN reward_type_templates rtt ON rtt.id = crr.template_id
  WHERE crr.id = NEW.reward_rule_id;
  
  IF NOT FOUND THEN RETURN NEW; END IF;
  
  -- Get the member_id
  SELECT member_id INTO v_member_id
  FROM club_memberships WHERE id = NEW.membership_id;
  
  -- Check near-milestone conditions based on template type
  IF v_rule.template_slug = 'punch_card' THEN
    -- 1 punch away
    IF v_balance.punch_count = (v_rule.parameters->>'punches_required')::int - 1 THEN
      INSERT INTO notification_queue (user_id, type, title, body, data)
      VALUES (
        v_member_id, 'club_near_milestone',
        'Almost there!',
        'Just 1 more visit to earn: ' || v_rule.name,
        jsonb_build_object(
          'club_id', (SELECT club_id FROM club_memberships WHERE id = NEW.membership_id),
          'reward_rule_id', v_rule.id
        )
      );
    -- Milestone reached
    ELSIF v_balance.punch_count >= (v_rule.parameters->>'punches_required')::int THEN
      -- Create the redemption record
      INSERT INTO club_reward_redemptions (membership_id, reward_rule_id, status)
      VALUES (NEW.membership_id, NEW.reward_rule_id, 'available');
      
      INSERT INTO notification_queue (user_id, type, title, body, data)
      VALUES (
        v_member_id, 'club_reward_earned',
        'Reward Unlocked!',
        'You earned: ' || v_rule.name,
        jsonb_build_object(
          'club_id', (SELECT club_id FROM club_memberships WHERE id = NEW.membership_id),
          'reward_rule_id', v_rule.id
        )
      );
    END IF;
    
  ELSIF v_rule.template_slug = 'spend_discount' THEN
    DECLARE v_threshold NUMERIC;
    BEGIN
      v_threshold := (v_rule.parameters->>'spend_threshold')::numeric;
      -- Within 10% of threshold
      IF v_balance.total_spend >= v_threshold * 0.9 AND v_balance.total_spend < v_threshold THEN
        INSERT INTO notification_queue (user_id, type, title, body, data)
        VALUES (
          v_member_id, 'club_near_milestone',
          'Almost there!',
          'Spend $' || (v_threshold - v_balance.total_spend)::text || ' more to earn: ' || v_rule.name,
          jsonb_build_object('club_id', (SELECT club_id FROM club_memberships WHERE id = NEW.membership_id))
        );
      ELSIF v_balance.total_spend >= v_threshold THEN
        INSERT INTO club_reward_redemptions (membership_id, reward_rule_id, status)
        VALUES (NEW.membership_id, NEW.reward_rule_id, 'available');
        
        INSERT INTO notification_queue (user_id, type, title, body, data)
        VALUES (
          v_member_id, 'club_reward_earned',
          'Reward Unlocked!',
          'You earned: ' || v_rule.name,
          jsonb_build_object('club_id', (SELECT club_id FROM club_memberships WHERE id = NEW.membership_id))
        );
      END IF;
    END;
    
  ELSIF v_rule.template_slug = 'visit_milestone' THEN
    IF v_balance.visit_count = (v_rule.parameters->>'visits_required')::int - 1 THEN
      INSERT INTO notification_queue (user_id, type, title, body, data)
      VALUES (
        v_member_id, 'club_near_milestone',
        'Almost there!',
        'Just 1 more visit to earn: ' || v_rule.name,
        jsonb_build_object('club_id', (SELECT club_id FROM club_memberships WHERE id = NEW.membership_id))
      );
    ELSIF v_balance.visit_count >= (v_rule.parameters->>'visits_required')::int THEN
      INSERT INTO club_reward_redemptions (membership_id, reward_rule_id, status)
      VALUES (NEW.membership_id, NEW.reward_rule_id, 'available');
      
      INSERT INTO notification_queue (user_id, type, title, body, data)
      VALUES (
        v_member_id, 'club_reward_earned',
        'Reward Unlocked!',
        'You earned: ' || v_rule.name,
        jsonb_build_object('club_id', (SELECT club_id FROM club_memberships WHERE id = NEW.membership_id))
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_reward_milestone
  AFTER INSERT ON club_activity_log
  FOR EACH ROW
  WHEN (NEW.reward_rule_id IS NOT NULL)
  EXECUTE FUNCTION check_reward_milestone();
```

### 7.2 Notification Delivery

The existing MCC notification system (push + in-app) processes the `notification_queue` table. The server polls or uses Supabase Realtime to pick up new entries and deliver via:

- **Web Push** — existing service worker infrastructure
- **SMS** — via Twilio (for members who opted in)
- **In-app badge** — Realtime subscription on the member dashboard

### 7.3 Post-Booking Confirmation

After a job is completed and payment confirmed, the booking confirmation screen should show:

```javascript
// After job completion, fetch updated balance for this provider's club
const { data: updatedBalance } = await supabaseClient
  .from('member_club_balances')
  .select('*, reward_rule:club_reward_rules(name, parameters, template:reward_type_templates(slug))')
  .eq('membership_id', membershipId)
  .single();

if (updatedBalance) {
  const eval = RewardEngine.evaluate(
    updatedBalance.reward_rule.template.slug,
    updatedBalance,
    updatedBalance.reward_rule.parameters
  );
  // Display: "2/10 punches toward Free Oil Change (20% there!)"
}
```

---

## 8. Free Bid Balance System

### 8.1 Schema

Already defined in Section 3.2 (`free_bid_credits` table). Key design decisions:

- **Per-batch tracking**: Each credit event (10 bids from a referral return) is a separate row with its own `expires_at`
- **Rolling expiration**: Only the specific batch expires, not the entire balance
- **FIFO consumption**: Oldest batches get consumed first (closest to expiry)

### 8.2 Consuming Free Bids (FIFO Before Paid)

```sql
-- Function to consume bids, prioritizing free bids (oldest first)
CREATE OR REPLACE FUNCTION consume_bid(p_provider_id UUID, p_bid_count INTEGER DEFAULT 1)
RETURNS JSONB AS $$
DECLARE
  v_remaining INTEGER := p_bid_count;
  v_credit RECORD;
  v_free_used INTEGER := 0;
  v_paid_used INTEGER := 0;
BEGIN
  -- First, expire any overdue free bid batches
  UPDATE free_bid_credits
  SET is_expired = true, expired_at = now()
  WHERE provider_id = p_provider_id
    AND is_expired = false
    AND expires_at < now()
    AND bids_remaining > 0;

  -- Consume from free bids first (FIFO — oldest expiring first)
  FOR v_credit IN
    SELECT id, bids_remaining
    FROM free_bid_credits
    WHERE provider_id = p_provider_id
      AND is_expired = false
      AND bids_remaining > 0
      AND expires_at > now()
    ORDER BY expires_at ASC
  LOOP
    IF v_remaining <= 0 THEN EXIT; END IF;
    
    DECLARE v_deduct INTEGER;
    BEGIN
      v_deduct := LEAST(v_credit.bids_remaining, v_remaining);
      
      UPDATE free_bid_credits
      SET bids_remaining = bids_remaining - v_deduct
      WHERE id = v_credit.id;
      
      v_remaining := v_remaining - v_deduct;
      v_free_used := v_free_used + v_deduct;
    END;
  END LOOP;

  -- If still remaining, deduct from paid bid balance
  IF v_remaining > 0 THEN
    UPDATE profiles
    SET bid_credits = bid_credits - v_remaining,
        total_bids_used = total_bids_used + v_remaining
    WHERE id = p_provider_id
      AND bid_credits >= v_remaining;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient bid credits';
    END IF;
    
    v_paid_used := v_remaining;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'free_bids_used', v_free_used,
    'paid_bids_used', v_paid_used
  );
END;
$$ LANGUAGE plpgsql;
```

### 8.3 Expiration Cleanup (Scheduled)

```sql
-- Run daily via cron or Supabase scheduled function
CREATE OR REPLACE FUNCTION expire_free_bid_credits()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE free_bid_credits
  SET is_expired = true, expired_at = now()
  WHERE is_expired = false
    AND expires_at < now()
    AND bids_remaining > 0;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
```

### 8.4 Personalized Bid Value Display

The value of free bids is displayed relative to the provider's most recent bid pack purchase. Here's how to calculate and display it:

```javascript
// Server-side: Calculate provider's effective cost-per-bid
async function getProviderBidValue(providerId) {
  // Get most recent purchase
  const { data: lastPurchase } = await supabaseClient
    .from('bid_credit_purchases')
    .select('bids_purchased, amount_paid, bid_pack_id')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (lastPurchase) {
    return {
      costPerBid: (lastPurchase.amount_paid / lastPurchase.bids_purchased).toFixed(2),
      basedOn: 'recent_purchase',
      packSize: lastPurchase.bids_purchased
    };
  }

  // Fallback: entry-level pack price (Jumper Cables: $10 for 1 bid = $10/bid,
  // but more useful is the first multi-bid pack: Dipstick: $200/50 = $4/bid)
  return {
    costPerBid: '4.00',
    basedOn: 'entry_level',
    packSize: null
  };
}

// Display helper
function formatFreeBidValue(bidCount, costPerBid, basedOn) {
  const value = (bidCount * parseFloat(costPerBid)).toFixed(2);
  
  if (basedOn === 'recent_purchase') {
    return `${bidCount} free bids — a $${value} savings based on your current pack`;
  }
  return `${bidCount} free bids — up to $${value} in value`;
}
```

### 8.5 Provider Dashboard — Free Bid Summary

```sql
-- Dashboard query: free bid summary for a provider
SELECT 
  COALESCE(SUM(bids_credited), 0) AS total_earned,
  COALESCE(SUM(bids_credited - bids_remaining), 0) AS total_used,
  COALESCE(SUM(bids_remaining) FILTER (WHERE NOT is_expired AND expires_at > now()), 0) AS current_balance,
  COALESCE(SUM(bids_remaining) FILTER (WHERE is_expired OR expires_at <= now()), 0) AS total_expired,
  MIN(expires_at) FILTER (WHERE NOT is_expired AND bids_remaining > 0 AND expires_at > now()) AS next_expiry_date,
  COALESCE(SUM(bids_remaining) FILTER (
    WHERE NOT is_expired AND expires_at > now() AND expires_at < now() + INTERVAL '14 days'
  ), 0) AS expiring_soon
FROM free_bid_credits
WHERE provider_id = $1;
```

---

## 9. Referred Member Return Trigger

### 9.1 How Attribution Works

When a member signs up with a provider's referral code, the `profiles` table stores:
- `referred_by_provider_id` — the provider who referred this member
- `referred_by_code` — the referral code used

At job completion, we check if the member's `referred_by_provider_id` matches the provider who completed the job. If yes, the provider earns 10 free bids.

### 9.2 Implementation: Database Trigger

A database trigger is recommended over an Edge Function because:
- It fires reliably on every qualifying job completion (no HTTP request needed)
- It's transactional — the bid credit is created atomically with the job status update
- It's simpler to maintain than a separate Edge Function
- MCC already uses triggers for similar workflows

```sql
-- Trigger: Auto-credit 10 free bids when referred member completes a job with their referring provider
CREATE OR REPLACE FUNCTION credit_referred_member_return_bids()
RETURNS TRIGGER AS $$
DECLARE
  v_member_referred_by UUID;
  v_member_name TEXT;
  v_provider_cost_per_bid NUMERIC;
  v_bid_value NUMERIC;
BEGIN
  -- Only fire when job status changes to 'completed'
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Check if the member was referred by this provider
  SELECT referred_by_provider_id, full_name
  INTO v_member_referred_by, v_member_name
  FROM profiles
  WHERE id = NEW.member_id;

  -- If the member was referred by this provider, credit 10 free bids
  IF v_member_referred_by IS NOT NULL AND v_member_referred_by = NEW.provider_id THEN
    
    -- Credit 10 free bids with 90-day expiry
    INSERT INTO free_bid_credits (
      provider_id, bids_credited, bids_remaining,
      source, source_job_id, source_member_id,
      expires_at
    ) VALUES (
      NEW.provider_id, 10, 10,
      'referred_member_return', NEW.id, NEW.member_id,
      now() + INTERVAL '90 days'
    );

    -- Calculate personalized bid value for notification
    SELECT COALESCE(
      (SELECT amount_paid / bids_purchased 
       FROM bid_credit_purchases 
       WHERE provider_id = NEW.provider_id 
       ORDER BY created_at DESC LIMIT 1),
      4.00  -- fallback to entry-level pack rate
    ) INTO v_provider_cost_per_bid;
    
    v_bid_value := 10 * v_provider_cost_per_bid;

    -- Queue notification with personalized dollar value
    INSERT INTO notification_queue (user_id, type, title, body, data)
    VALUES (
      NEW.provider_id,
      'free_bids_earned',
      'You just earned $' || v_bid_value::text || ' in free bids!',
      COALESCE(v_member_name, 'A member') || ' you referred booked with you again. 10 free bids credited — expires in 90 days.',
      jsonb_build_object(
        'bids_credited', 10,
        'dollar_value', v_bid_value,
        'source_member_id', NEW.member_id,
        'expires_at', (now() + INTERVAL '90 days')::text
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to your jobs/bookings table
-- (Replace 'jobs' with your actual table name)
CREATE TRIGGER trg_credit_referred_return_bids
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION credit_referred_member_return_bids();
```

### 9.3 Stacking

Credits stack automatically because each qualifying job completion inserts a new row in `free_bid_credits`. If 3 referred members book in the same week, the provider gets 3 separate batches of 10 bids (30 total), each with their own 90-day expiry from the date credited.

### 9.4 Preventing Double Credits

The trigger only fires on the status transition to 'completed' (`OLD.status IS DISTINCT FROM 'completed'`). Once a job is marked completed, updating it again won't re-trigger. For extra safety, add a unique constraint:

```sql
-- Prevent duplicate credits for the same job
CREATE UNIQUE INDEX idx_free_bids_source_job 
  ON free_bid_credits(source_job_id) 
  WHERE source = 'referred_member_return';
```

---

## 10. Open Questions

These need product decisions before implementation can begin:

### Car Club

1. **Auto-join vs. opt-in?** When a member books with a provider who has a club, are they automatically enrolled, or do they need to explicitly join? Auto-join maximizes engagement but may feel pushy.

2. **Multiple reward rules per club?** Can a provider run both a punch card AND a spend-based reward simultaneously? The schema supports it, but the UI needs to handle the complexity gracefully.

3. **Reward expiration?** Should earned (unlocked but unredeemed) rewards expire after a certain period? This is common in loyalty programs but may frustrate members.

4. **Cross-provider visibility?** Can members browse and join clubs from providers they haven't used yet, or only from providers they've booked with?

5. **Club promotion?** Should providers be able to promote their club in their bid responses? ("Book with me — you're 2 punches away from a free oil change!")

6. **Minimum activity for club creation?** Should providers need a minimum rating or completed job count before they can create a club?

### Free Bid System

7. **Notification for expiring bids?** Should providers get a notification when free bids are about to expire (e.g., 7 days before)?

8. **Free bid earning cap?** Is there a maximum number of free bids a provider can earn per month, or is it truly unlimited?

9. **First-time or recurring?** Does the provider get 10 free bids only the first time a referred member books with them, or every time? The brief says "completes a job" which implies recurring. Confirm this — it's a significant cost consideration at scale.

10. **Free bid visibility to members?** Should members know that their booking earned their provider free bids? This could be framed positively ("You helped your provider earn rewards!") but could also feel transactional.

### Technical

11. **Job table name?** The trigger references a `jobs` table — need to confirm the actual table name in the Supabase schema for completed bookings/services.

12. **Notification queue table?** The triggers reference a `notification_queue` table — need to confirm this exists or create it. If MCC uses a different notification mechanism, adapt the triggers accordingly.

13. **Reward type rollout order?** Recommended: Start with punch cards (simplest), then add spend-based, then visit milestones. This lets you iterate on the UI before adding complexity.

---

## Implementation Roadmap (Suggested)

**Phase 1 — Foundation (1-2 weeks)**
- Create all Car Club tables and RLS policies
- Build the reward engine (JavaScript evaluation functions)
- Provider: Create/configure club UI (basic punch card only)
- Member: Join club + view progress

**Phase 2 — Activity Tracking (1 week)**
- Wire up job completion to log club activity automatically
- Balance update logic
- Milestone notification trigger

**Phase 3 — Redemptions (1 week)**
- Reward unlocking and redemption flow
- Apply rewards to bookings/checkout
- Provider redemption history view

**Phase 4 — Free Bid System (1 week)**
- Create `free_bid_credits` table
- Referred member return trigger
- FIFO consumption function
- Personalized value display in provider dashboard
- Expiration cleanup scheduled job

**Phase 5 — Polish (1 week)**
- Additional reward types (spend-based, visit milestone)
- Club browsing/discovery for members
- Analytics for providers (club performance metrics)
- Post-booking confirmation progress display

**Total estimated effort: 5-6 weeks for a solo developer**
