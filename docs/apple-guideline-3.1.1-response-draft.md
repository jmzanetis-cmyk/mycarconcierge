# Apple Guideline 3.1.1 response — draft (2026-09-21, reflects build 19)

**Why this file exists.** Apple's Sept 13 notice on
`com.zanetisholdings.mycarconcierge` listed "Guideline 3.1.1 – In-App
Purchase: In-App Purchase products should be configured and submitted
alongside the app." The answer we prepared on 2026-09-18 (commit `d9f8593`,
tracked in `apple-guideline-2.1-response.md`) described a **link-out card with
no prices** that sent providers to Safari. That approach was replaced on
2026-09-20 by PRs #23, #24 and #26: the app now shows pack and plan prices
in-app and opens a Stripe-hosted checkout page on mycarconcierge.com inside
SFSafariViewController. **The reply to Apple must describe build 19's actual
behavior, not the Sept 18 design.** This file is that reply. The checked
3.1.1 item in `apple-guideline-2.1-response.md` is superseded by it.

## Before posting — two checks Jordan has to do himself

1. **App Store Connect → Pricing and Availability → confirm the app is
   available in the United States only.** The in-app price display + external
   checkout link is permitted on the US storefront (Guideline 3.1.1(a),
   updated May 2025 after *Epic v. Apple*). If any other storefront is
   selected, the old rule applies there ("may not advertise the offer") and
   the reply below is wrong for that storefront. Either restrict to US or tell
   me and we revert those storefronts to the no-price card.
2. Attach the build you actually want reviewed. Build 18 was uploaded to
   TestFlight and revealed a language-selector coverage bug on the provider
   portal (Report: switcher showed but selecting a language did nothing on
   `providers.html` / `fleet.html` / `provider-info.html` which have zero
   `data-i18n` markup). Fixed in build 19 (commit `65d8312`, deploy
   `6ab4197f…` on 2026-09-23) by suppressing the switcher on pages with no
   translatable content. **Upload build 19 for review**, wait for
   processing, attach it, then post.

## Reply text — paste into "Reply to App Review" under the 3.1.1 bullet

> **Guideline 3.1.1 – In-App Purchase**
>
> My Car Concierge does not use In-App Purchase, which is why no IAP
> products are configured. Here is what is purchasable and how, in the build
> attached to this submission:
>
> **1. Members (car owners) pay service providers for physical automotive
> services** — repairs, detailing, roadside assistance — performed on their
> vehicle outside the app. These are payments for real-world services under
> Guideline 3.1.3(e) and are processed with Stripe.
>
> **2. Providers (repair shops, mechanics) can buy bid credits and an
> optional monthly plan.** Credits let a provider submit a bid on a member's
> service request. These are sold through a Stripe-hosted checkout page on
> our website (www.mycarconcierge.com). In the app, the Credits & Plans
> screen lists the packs and plans with their prices; tapping "Buy Now" or
> "Start trial" opens our website's checkout page in an SFSafariViewController
> sheet. The purchase is completed on our website, not through the App Store,
> and the app then refreshes the provider's balance. Under the United States
> storefront terms of Guideline 3.1.1(a), an app may include buttons, external
> links and calls to action directing users to purchasing mechanisms other
> than In-App Purchase, and the app is available on the United States
> storefront only.
>
> Nothing in the app unlocks features or content through In-App Purchase, and
> there is no consumable, subscription or non-consumable purchasable through
> the App Store. If the reviewer would prefer that the provider purchase
> screen show no prices and simply direct providers to our website, we can
> ship that variant in a follow-up build.
>
> To see the flow: sign in with the review account, open the Provider Portal
> → Credits & Plans. Tapping Buy Now on any pack opens the checkout sheet; you
> can close it without paying. The "Start trial" plan checkout collects a card
> but charges nothing until a provider wins their first customer — the sheet
> explains this above the button.

## Fallback if Apple rejects this framing

Two options, either is a one-day change:

- **Revert to the no-price link-out card** (the `d9f8593` pattern: hide packs
  and plans on native, show "Buy credits on our website"). Cheapest; loses
  in-app conversion for providers.
- **IAP for bid credit packs only**, keep monthly plans web-only with no
  in-app mention. Requires StoreKit integration, Apple's 15–30% cut on packs,
  and a server-side receipt validator feeding `credit_ledger`. Only worth it
  if Apple rejects the US-storefront argument outright.

Do not offer IAP for the monthly plan: "free until your first customer"
cannot be expressed as an App Store subscription, whose trials are fixed
length and convert automatically.

## Status

- [ ] Jordan: confirm US-only availability in App Store Connect
- [ ] Jordan: phone retest of build 19 (Start trial, Buy Credits from a warning; also verify the language switcher no longer shows on the provider portal)
- [ ] CC: `build-ios.sh` upload of the retested build; confirm processing
- [ ] Jordan: attach build, post this reply under 3.1.1, keep the other five
      items' answers as already drafted in the Notes field
- [ ] Update `apple-guideline-2.1-response.md` checked 3.1.1 item to point
      here (one line; don't rewrite the history)
