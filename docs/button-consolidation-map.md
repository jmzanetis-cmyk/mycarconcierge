# Button Consolidation Map
**Status: IN PROGRESS — migration underway**
**Scope: all public/auth HTML pages + shared-styles.css + blog.css**
**Excluded: admin.html, members.html (separate concerns)**

---

## Current Inventory

| Class | Occurrences | Location | Color/Style | Defined In |
|-------|-------------|----------|-------------|-----------|
| `.btn-primary` | 234 | 43 files | BLUE (dark mode) / gold (light mode override) | shared-styles.css |
| `.btn-secondary` | 186 | Many pages | Elevated/neutral, dark border | shared-styles.css |
| `.btn-ghost` | 101 | Many pages | Transparent, no border | shared-styles.css |
| `.btn-sm` | 73 | Many pages | Small size modifier | shared-styles.css |
| `.btn-gold` | 49 | 8 files | Gold gradient | shared-styles.css |
| `.btn-next` | 39 | onboarding-member.html | Gold, pill-shaped, full-width | onboarding-member.html inline |
| `.btn-login` | 37 | 18 files | Varies: secondary in nav (page CSS override), gold on mobile | index.html inline + page-specific |
| `.btn-outline` | 30 | 7 files | Transparent, border on hover gold | for-shops.html inline |
| `.btn-metallic` | 24 | car-club-*.html | Dark sheen style | car-club pages inline |
| `.btn-cta` | 19 | 14 files (blog, providers) | Gold | blog.css |
| `.btn-danger` | 18 | Multiple | Red ghost-style | shared-styles.css |
| `.btn-skip` | 14 | onboarding-member.html | Transparent ghost | onboarding-member.html inline |
| `.btn-apple-signup` | 10 | onboarding-member.html | Brand black | onboarding-member.html inline |
| `.btn-facebook-signup` | 10 | onboarding-member.html | Brand blue | onboarding-member.html inline |
| `.btn-quote` | 9 | providers-directory + blog | Gold | providers-directory.html inline |
| `.btn-success` | 8 | Multiple | Green gradient | shared-styles.css |
| `.btn-lg` | 7 | Multiple | Large size modifier | shared-styles.css |
| `.btn-load-more` | 6 | providers-directory.html | Secondary/outlined | providers-directory.html inline |
| `.btn-google-signin` | 6 | login.html | Brand white | login.html inline |
| `.btn-facebook-signin` | 6 | login.html | Brand blue | login.html inline |
| `.btn-apple-signin` | 6 | login.html | Brand black | login.html inline |
| `.btn-google-signup` | 5 | onboarding-member.html | Brand white | onboarding-member.html inline |
| `.btn-biometric` | 5 | login.html | Input-like special layout | login.html inline |
| `.btn-outline-gold` | 8 | index.html | Transparent, gold border/text | index.html inline |
| `.btn-login-hero` | 1 | index.html hero form | Dark bg, white text | index.html inline |

---

## Target: 7 Classes (6 + success)

| New Class | Replaces | Style | Notes |
|-----------|----------|-------|-------|
| `.btn--primary` | `.btn-primary`, `.btn-gold`, `.btn-next`, `.btn-cta`, `.btn-login`, `.btn-login-hero`, `.btn-quote` | Gold gradient | The ONE gold button everywhere a primary CTA appears |
| `.btn--secondary` | `.btn-secondary`, `.btn-skip`, `.btn-load-more`, `.btn-outline` | Elevated/neutral | Neutral actions, secondary choices |
| `.btn--ghost` | `.btn-ghost`, `.btn-outline-gold` | Transparent | Minimal visual weight |
| `.btn--danger` | `.btn-danger` | Red ghost | Destructive actions |
| `.btn--success` | `.btn-success` | Green gradient | Confirmation/success (7th class, acceptable) |
| `.btn--small` | `.btn-sm` | Size modifier | -2px padding |
| `.btn--large` | `.btn-lg` | Size modifier | +2px padding, larger font |

---

## Flags and Skips

### Skipped — Out of Scope / Special Purpose
| Class | Reason |
|-------|--------|
| `.btn-metallic` | Used in car-club-member.html and car-club-provider.html (authenticated app pages), not public marketing; in-scope by rule but excluded to limit blast radius |
| `.btn-biometric` | login.html only; unique input-like layout (flex column, large icon, centered text); renaming to `.btn--secondary` would lose the custom layout |
| `.btn-apple-signin`, `.btn-google-signin`, `.btn-facebook-signin` | Apple/Google/Facebook brand guidelines require specific styling — do not consolidate |
| `.btn-apple-signup`, `.btn-google-signup`, `.btn-facebook-signup` | Same — brand-required |
| `.hero-social-btn-*` | Brand OAuth buttons on index.html hero — same |

### Special Treatment
| Class | Decision |
|-------|----------|
| `.btn-outline-gold` | Maps to `.btn--ghost`. It is transparent with gold border/text — closest semantic match is ghost (transparent). Not `.btn--primary` since it's not filled. 8 occurrences in index.html (inline CSS + class attrs). |
| `.btn-login` in `nav .btn-login {}` rules | Many pages override `nav .btn-login` to secondary style. After rename, these become `nav .btn--primary { background: var(--bg-elevated) }` which overrides shared-styles gold. Visual appearance unchanged on those pages (intentional: secondary Login button stays secondary in nav when page-specific CSS says so). Flag: spot-check index.html nav Login button. |
| `.btn-outline` | Only appears without `.btn` base class in developers.html, founders.html. Maps to `.btn--secondary`. Page-specific `for-shops.html` CSS override (transparent bg) becomes `.btn--secondary { transparent }` — overrides shared-styles `.btn--secondary { elevated }`. Slight visual difference in for-shops.html: buttons stay transparent instead of elevated. Acceptable. |

---

## Pages Touched by Migration

**Primary pages (main www/*.html — public/auth):**
index.html, login.html, onboarding-member.html, providers-directory.html, how-it-works.html, about.html, contact.html, faq.html, terms.html, privacy.html, rideshare.html, data-deletion.html, data-rights.html, sms-consent.html, trust-safety.html, provider-faq.html, provider-info.html, provider-tips.html, for-shops.html, shop.html, drivers.html, signup-provider.html, signup-member.html, signup-driver.html, signup-loyal-customer.html, forgot-password.html, reset-password.html, accept-invite.html, bgc-enroll-account.html, check-in.html, donation-thanks.html, founders.html, fleet.html, fleet-driver.html, fleet-join.html, fleet-landing.html, fleet-signup.html, split-pay.html, provider-pilot.html, member-founder.html, member-founder-agreement.html, founding-partner-agreement.html, provider-agreement.html, developers.html, job-board.html, founder-dashboard.html, signed-agreements.html, car-club-member.html*, car-club-provider.html*, p.html, driver-dispatch.html

(*car-club pages: btn-metallic skipped, other btn- classes renamed)

**Blog (www/blog/*.html):** All blog HTML files

**Marketing (www/marketing/*.html):** about.html, services.html, providers.html

**CSS files:** shared-styles.css, blog/blog.css

---

## Visual Regression Checklist

| Page | Primary CTA Before | Primary CTA After | Flag? |
|------|-------------------|-------------------|-------|
| index.html | Blue (hero CTA uses btn-primary, overridden to gold by page CSS) | Gold — no visual change | No |
| login.html | Blue "Sign In" button (shared-styles blue) | Gold "Sign In" | Yes — spot check |
| onboarding-member.html | Gold "Next" (btn-next) | Gold (btn--primary) | No visual change |
| providers-directory.html | Gold "Request a Quote" (btn-quote) | Gold (btn--primary) | No visual change |
| how-it-works.html | Gold (page CSS override) | Gold | No visual change |
| faq.html | Blue (shared-styles, no override) | Gold | Yes — spot check |
| terms.html | Blue → Gold | Gold | Yes — spot check |
| privacy.html | Blue → Gold | Gold | Yes — spot check |
| contact.html | Gold (page CSS override) | Gold | No visual change |
| blog pages | Gold (btn-cta already gold) | Gold (btn--primary) | No visual change |
| for-shops.html | Gold (page override) | Gold | No visual change |
| rideshare.html | Gold (page override) | Gold | No visual change |

**Blue → Gold changes to spot-check:** login.html (Sign In), faq.html, terms.html, privacy.html, data-deletion.html, data-rights.html, sms-consent.html, trust-safety.html (all had blue btn-primary from shared-styles, no page override).

---

## Commit Plan

1. `docs/button-consolidation-map.md` (this file)
2. `shared-styles.css` — add new `.btn--*` classes with alias multi-selectors; change `.btn-primary` from blue to gold
3. Migration sweep — rename btn- classes in all HTML + blog.css
4. Cleanup — remove alias selectors from shared-styles.css; final 7 classes only
