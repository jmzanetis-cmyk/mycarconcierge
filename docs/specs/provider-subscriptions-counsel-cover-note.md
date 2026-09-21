# Cover note to counsel — provider subscription copy (draft, 2026-09-21)

Send with `docs/specs/provider-subscriptions-counsel-review-copy.md` and the
screenshot `docs/specs/evidence/plan-checkout-copy-live.png`. Edit freely;
this is Jordan's voice, not a legal memo.

---

Subject: MyCarConcierge — provider subscription wording for review

Hi [name],

We launched an optional monthly plan for service providers on MyCarConcierge
this week. I'd like you to review the customer-facing wording before we
promote it. Everything a provider reads is compiled in the attached one-page
document; the screenshot shows the live Stripe checkout page.

The commercial model, so the wording makes sense:

- Providers already buy one-time bid credit packs. The new plans (Starter
  $89/mo, Standard [price]) add a monthly credit allotment. A provider can
  use packs, a plan, or both.
- A plan is free until the provider wins their first customer — meaning
  their first accepted bid. At that moment billing starts and renews monthly.
  Until then the card on file is not charged.
- Stripe has no "open-ended trial", so the subscription is created with the
  maximum 730-day trial and we end the trial early when the first bid is
  accepted. That is why Stripe's own header on the checkout page says "730
  days free — then $89.00 per month starting September 2028". We cannot
  change that header; our wording under it explains the actual terms.
- Unused plan credits carry over up to twice the monthly amount; pack credits
  never expire; credits have no cash value. Cancellation is anytime through a
  Stripe-hosted portal, effective at the end of the paid period.

What I'd like your view on:

1. Whether the checkout-page wording adequately discloses the trial /
   first-charge mechanics given Stripe's fixed "730 days free" header, and
   whether the card-authorization sentence is sufficient.
2. Whether the plans card and footnote on our site need anything further
   (auto-renewal disclosure, cancellation terms, the 2× rollover cap).
3. Anything the Terms of Service should say that it doesn't yet about plans,
   credit expiry, or rollover.

The feature is live for providers now; I'd rather correct wording quickly
than hold it. Happy to turn any changes around same day.

Thanks,
Jordan
