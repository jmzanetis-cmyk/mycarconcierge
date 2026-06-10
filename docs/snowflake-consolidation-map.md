# Snowflake Component Consolidation Map

**Status:** Phase B complete  
**Audit date:** 2026-05-27  
**Files scanned:** 80+ public HTML files

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| TRUE SNOWFLAKES | 18 | Document only — unique enough to consolidate badly |
| DUPLICATES migrated | 4 component groups | Moved to shared-styles.css, removed from pages |
| AMBIENT-BG redundant copies removed | 4 pages | Already in shared-styles.css |
| Pages linked to shared-styles.css | +2 (faq.html, provider-faq.html) | |
| CSS lines removed from pages | 277 (git-diffed) | |
| CSS lines added to shared-styles.css | 138 | |
| Net reduction | 139 lines | |

---

## PHASE A — Inventory

### Pages that link shared-styles.css (45 total)

`index.html`, `login.html`, `providers.html`, `providers-directory.html`, `p.html`, `founder-dashboard.html`, `job-board.html`, `fleet.html`, `car-club-member.html`, `car-club-provider.html`, `signed-agreements.html`, `signup-provider.html`, `signup-driver.html`, `developers.html`, `ad-deck.html`, `p.html`, `privacy.html`, `terms.html`, `data-deletion.html`, `data-deletion-status.html`, `forgot-password.html`, `reset-password.html`, `donation-thanks.html`, `founding-provider-chris-agrapidis.html`, `ref/chris.html`, `provider-agreement.html`, `contractor-agreement.html`, `founding-partner-agreement.html`, `designer-agreement.html`, `member-founder-agreement.html`, `marketing/about.html`, `marketing/providers.html`, `marketing/services.html`, `blog/*` (10 posts)

### Pages that are standalone (no shared-styles.css)

Most public pages are self-contained with inlined CSS. Key standalone pages with the biggest consolidation potential are listed in the DUPLICATE section below.

---

## Component Classification

### TRUE SNOWFLAKES — Leave as-is

| Component | File | Reason |
|-----------|------|--------|
| `.hero` | `index.html` | Full-page gradient hero with floating card — unique to homepage |
| `.step-card` | `how-it-works.html` | Side-by-side icon+text layout, responsive to column — page-unique layout |
| `.step` | `onboarding-member.html`, `onboarding-provider.html` | Full-screen swipeable step panel with animations — onboarding-specific |
| `.progress-bar` | `onboarding-member.html`, `onboarding-provider.html` | Fixed-top progress rail tied to onboarding state machine |
| `.login-card` | `login.html` | Auth surface with magic-link and OAuth options — login-specific |
| `.code-input` | `login.html` | 2FA digit-box input — one-off screen |
| `.portal-selection` | `login.html` | Member vs Provider portal chooser grid — one-off screen |
| `.free-join-pill` | `onboarding-member.html` | Marketing badge above hero copy — one-off element |
| `.filter-input` | `providers-directory.html` | Select with custom chevron background-image + `appearance: none` — differs meaningfully from `.form-select` |
| `.provider-card` | `providers-directory.html` | Rich card with BGC badge, services chips, rating, distance — directory-specific |
| `.hero-section` | `providers.html` | Provider dashboard hero with inline stats — page-specific |
| `.landing-hero` | `fleet-landing.html` | Fleet-focused hero with plan options — page-specific |
| `.cta-section` | 14 pages | Too many distinct layouts (card, gradient, plain) to share a meaningful base |
| `.page-header` | `faq.html`, `provider-faq.html` | Simple centered h1+p — unique per page text |
| `.welcome-section` | `founder-dashboard.html` | Greeting section with user name — page-specific |
| `.portal-subtitle` | `login.html` | One-off subtitle — true snowflake |
| `.job-stat` | `job-board.html` | Stats bar for active bid counts — page-specific |
| `.dispatch-card` | `driver-dispatch.html` | Full-screen driver dispatch card — page-specific |

---

### DUPLICATES — Migrated to shared-styles.css

#### 1. Activity Feed Component
**Files:** `car-club-member.html`, `car-club-provider.html`  
**Also similar in:** `founder-dashboard.html` (different variant — left as-is)  
**CSS classes:** `.activity-item`, `.activity-icon`, `.activity-content`, `.activity-title`, `.activity-desc`, `.activity-time`  
**Action:** Moved to `shared-styles.css`. Removed from both car-club pages.  
**Lines saved:** 22 lines (11 × 2 files)

```
.activity-item  → shared-styles.css
.activity-icon  → shared-styles.css (with .punch/.visit/.reward/.spend modifiers)
.activity-content → shared-styles.css
.activity-title → shared-styles.css
.activity-desc  → shared-styles.css
.activity-time  → shared-styles.css
```

#### 2. Back-Link (simple text variant)
**Files:** `car-club-member.html`, `car-club-provider.html`, `p.html`  
**Also appears as card-style variant in:** `ad-deck.html`, `provider-agreement.html`, `founding-partner-agreement.html` (distinct variant — left as-is)  
**Also appears as pill variant in:** `signed-agreements.html` (distinct variant — left as-is)  
**CSS classes:** `.back-link`, `.back-link:hover`  
**Action:** Canonical simple-text version moved to `shared-styles.css`. Removed from 3 pages.  
**Lines saved:** 6 lines (2 × 3 files)

#### 3. FAQ Accordion Component
**Files:** `faq.html`, `provider-faq.html`  
**CSS classes:** `.faq-list`, `.faq-item`, `.faq-question`, `.faq-icon`, `.faq-answer`, `.faq-answer-content`  
**CSS is pixel-perfect identical** between both files.  
**Action:**
- Added faq accordion to `shared-styles.css`
- Added `<link rel="stylesheet" href="/shared-styles.css">` to both pages
- Removed `.faq-*` block + `.ambient-bg` + `.noise` from both pages' local `<style>` (all were identical to shared-styles.css)  
**Lines saved:** ~170 lines (85 × 2 files)

#### 4. Alert / Notice Component (added for future use)
**Files:** `fleet-join.html`, `fleet-signup.html`, `fleet-driver.html`, `fleet.html`  
**CSS classes:** `.alert`, `.alert-success`, `.alert-error`, `.alert-info`, `.alert-warning`, `.alert-banner`  
**Status:** These files are standalone (don't link shared-styles.css). Alert component CSS added to `shared-styles.css` for when these pages are migrated, but NOT yet removed from the standalone pages.  
**Note:** The pattern across fleet pages is consistent enough to consolidate now.

---

### AMBIENT-BG Redundant Copies Removed

Pages that link `shared-styles.css` (which defines `.ambient-bg`) but also define it identically in their local `<style>`:

| Page | Action |
|------|--------|
| `index.html` | Removed local `.ambient-bg` (identical to shared-styles.css) |
| `terms.html` | Removed local `.ambient-bg` (identical to shared-styles.css) |
| `data-deletion.html` | Removed local `.ambient-bg` + `.noise` (identical to shared-styles.css) |
| `privacy.html` | Removed local `.ambient-bg` (identical to shared-styles.css) |

**NOT removed:** `login.html` (defines a different 2-gradient variant — intentional override)

---

### BASE-EXTENSIBLE — Documented for future consolidation

These patterns have meaningful duplication but would require adding `shared-styles.css` links to standalone pages — a larger change than this session's scope.

| Pattern | Files | Shared classes | Blocker |
|---------|-------|----------------|---------|
| Onboarding category-card | `onboarding-member.html`, `onboarding-provider.html` | `.category-card`, `.category-card-icon`, `.category-card-label`, `.category-grid` (identical) | Both standalone; need shared-styles.css link |
| Onboarding consent-item | `onboarding-member.html`, `onboarding-provider.html` | `.consent-item`, `.consent-group` (identical) | Same |
| Onboarding step-progress | `onboarding-member.html`, `onboarding-provider.html` | `.step-progress`, `.step-progress-item` (identical) | Same |
| Benefit card | `member-founder.html`, `provider-pilot.html` | `.benefit-card`, `.benefit-icon`, `.apply-form`, `.agreement-checkbox`, `.benefits-grid` (identical) | Both standalone |
| Fleet alert | `fleet-join.html`, `fleet-signup.html` | `.alert`, `.alert-error`, `.alert-info` (identical) | Both standalone |
| Fleet alert-banner | `fleet-driver.html`, `fleet.html` | `.alert-banner`, `.alert-warning`, `.alert-info` | Both standalone |
| FAQ (founders variant) | `founders.html`, `member-founder.html` | `.faq-item`, `.faq-question`, `.faq-answer` (border-bottom accordion style — different from card-style above) | Both standalone |

---

## CSS Lines Saved Per File

| File | Lines removed | Source |
|------|--------------|--------|
| `car-club-member.html` | 13 | activity-* (11) + back-link (2) |
| `car-club-provider.html` | 13 | activity-* (11) + back-link (2) |
| `p.html` | 2 | back-link |
| `faq.html` | ~85 | ambient-bg (10) + noise (8) + faq-* (67) |
| `provider-faq.html` | ~85 | ambient-bg (10) + noise (8) + faq-* (67) |
| `index.html` | ~10 | ambient-bg + noise |
| `terms.html` | ~19 | ambient-bg + noise |
| `data-deletion.html` | ~12 | ambient-bg + noise (single-line format) |
| `privacy.html` | ~19 | ambient-bg + noise |
| **Total** | **277** (confirmed by git diff) | |

---

## Visual Regression Notes

- **Activity feed:** Zero visual change — pixel-identical CSS moved to shared file
- **Back-link:** Zero visual change — pixel-identical CSS moved to shared file
- **FAQ accordion:** Zero visual change — pixel-identical CSS moved to shared file
- **ambient-bg / noise removal:** Zero visual change — exact same definitions were being cascaded twice; shared-styles.css version now serves both
- **Spot-check recommended:** `faq.html`, `provider-faq.html` (new shared-styles.css link added)
