# Provider subscription — counsel-visible copy (2026-09-20, pending counsel)

Compiled here so counsel review sees every string the provider actually
reads at signup, in checkout, on the plans card, and in the "How Credits
Persist" strip. PR #17 item (d) covers approval; nothing here is legally
signed off yet — the FEATURE_PROVIDER_PLANS flag was flipped on
production ahead of review at Jordan's decision.

## Stripe checkout page (rendered by Stripe from our API payload)

### Product

- **Name**: `MCC Starter plan` · `MCC Standard plan`
- **Description**: "Free until you win your first customer on MyCarConcierge. Billing starts the day your first bid is accepted — not before. Includes N bid credits per month. Add one-time credit packs anytime, with or without a plan." (N = the plan's `credits_per_month`)

### Custom text under the submit button

> Your card will not be charged until you win your first customer on MyCarConcierge. When your first bid is accepted, your plan starts at the monthly price shown and renews monthly until you cancel. Stripe requires a fixed trial length, so it shows the maximum (730 days); your actual free period ends at your first accepted bid. You can also buy one-time bid credit packs at any time, with or without a plan.

### After-submit message (post-completion)

> You're set. No charge today — billing begins when your first bid is accepted. Manage or cancel anytime from Credits & Plans.

### Subscription description (shows on Stripe invoices + Billing Portal)

> `MCC Starter plan — free until first accepted bid`
> `MCC Standard plan — free until first accepted bid`

### Stripe-rendered fixed strings we cannot reword

- "Free for 730 days" trial header — Stripe generates this from
  `subscription_data.trial_period_days: 730`. 730 is the API ceiling; the
  custom_text above explains that our actual free period is shorter and
  ends at the first accepted bid.

## In-app plans card (www/providers.html)

### Subtitle

> Free until your first customer. Your card isn't charged until your first bid is accepted (free period capped at 24 months). Cancel or change anytime.

### "How Credits Persist" strip (in the How Bid Credits Work section)

> Use a monthly plan, one-time packs, or both. Pack credits never expire · Plan credits carry over up to 2× your monthly amount.

### Footnote (below plans grid)

> Plan billing begins at your first accepted bid and auto-renews monthly. Cancel anytime; unused plan credits carry over up to twice your monthly amount. One-time packs can be purchased with or without a plan. No cash value.

## Status

- Updated: 2026-09-20
- Wording review: pending counsel (PR #17 item (d))
- All strings above are what production shows today (post-PR #25 deploy).
