# Type Scale Consolidation Map

**Status:** In progress  
**Phase A:** Font-size normalization — rem values → CSS custom properties  
**Phase B:** Input field background — hardcoded RGBA → `var(--bg-input)`

---

## Current State: Distinct rem Values (frequency-ranked)

| Value | Count | Usage pattern |
|-------|-------|---------------|
| 0.85rem | 374 | Badge labels, rating text, secondary metadata |
| 0.9rem  | 246 | Form inputs, button text, nav links, label text |
| 0.8rem  | 124 | Captions, help text, small labels |
| 0.82rem | 118 | Service tags, pill badges |
| 0.78rem | 80  | Tiny metadata, sub-labels |
| 0.88rem | 71  | Nav links, secondary body |
| 1.5rem  | 67  | Section headings, card headers |
| 1rem    | 63  | Base body text |
| 0.95rem | 59  | Body-adjacent text |
| 0.75rem | 58  | Footer copy, copyright, timestamps |
| 1.1rem  | 54  | Slightly-enlarged headings, card titles |
| 1.2rem  | 44  | Sub-section headings |
| 2rem    | 33  | Page-level headings |
| 1.4rem  | 20  | Card headings |
| 0.72rem | 19  | Ultra-fine labels |
| 1.05rem | 15  | Comfortable body text |
| 1.3rem  | 12  | Small headings |
| 1.15rem | 12  | Card sub-headings |
| 0.92rem | 11  | Body variant |
| 1.6rem  | 10  | Large sub-headings |
| 0.83rem | 10  | Labels |
| 1.8rem  | 9   | Large page headings |
| 2.5rem  | 7   | Large icons/price display |
| 3rem    | 5   | Hero-level display |
| 0.7rem  | 5   | Very small |
| 2.2rem  | 4   | Sub-hero headings |
| 0.76rem | 4   | Fine print |
| 1.25rem | 3   | Mid-size heading |
| 0.875rem| 3   | Body-to-label transition |
| 0.86rem | 3   | Label variant |
| 0.84rem | 3   | Label variant |
| 0.65rem | 3   | Micro labels |
| 0.93rem | 2   | Body variant |
| 0.62rem | 2   | Ultra-micro |
| 2.4rem  | 1   | Price display (fleet-landing) |
| 0.87rem | 1   | Label |
| 0.74rem | 1   | Fine print |
| 0.68rem | 1   | Fine print |
| .75rem  | 1   | Same as 0.75rem |

**Clamp values (left as-is — see §Flags):**
`clamp(2.5rem, 5vw, 3.8rem)`, `clamp(1.8rem, 3vw, 2.4rem)`, `clamp(1.8rem, 3vw, 2.8rem)`,
`clamp(1.75rem, 3.5vw, 2.5rem)`, `clamp(1.6rem, 3vw, 2.2rem)`, `clamp(2.2rem, 5vw, 3.8rem)`,
`clamp(2rem, 4vw, 2.8rem)`, `clamp(1.8rem, 3.5vw, 2.8rem)`, `clamp(1.6rem, 4vw, 2.4rem)`

---

## Target Scale: 10 Values

Chosen to minimise disruption — the scale anchors on the four most-used sizes
(0.85, 0.9, 1, 1.5rem) and fills in naturally around them.

| Variable | Value | px@16px | Role |
|----------|-------|---------|------|
| `--text-xs`      | 0.72rem | 11.5px | Fine print, timestamps, copyright |
| `--text-sm`      | 0.82rem | 13.1px | Tags, badges, secondary metadata |
| `--text-base`    | 0.9rem  | 14.4px | Inputs, nav, buttons, secondary text |
| `--text-md`      | 1rem    | 16px   | Body text (browser default) |
| `--text-lg`      | 1.1rem  | 17.6px | Slightly enlarged body, card subtitles |
| `--text-xl`      | 1.3rem  | 20.8px | Card titles, small section labels |
| `--text-2xl`     | 1.5rem  | 24px   | Section headings, card headers |
| `--text-3xl`     | 1.8rem  | 28.8px | Page-level headings |
| `--text-4xl`     | 2.25rem | 36px   | Hero headings |
| `--text-display` | 3rem    | 48px   | Display / banner text |

---

## Collapse Mapping

| Old value(s) | → Variable | Max delta |
|--------------|-----------|-----------|
| 0.62, 0.65, 0.68, 0.70 | `--text-xs` | +2.1px ↑ (micro, imperceptible) |
| 0.72 | `--text-xs` | 0 (exact) |
| 0.74, 0.75, .75, 0.76 | `--text-xs` | ≤0.5px ↓ (imperceptible) |
| 0.78, 0.80 | `--text-sm` | ≤0.6px ↑ (imperceptible) |
| 0.82, 0.83, 0.84 | `--text-sm` | ≤0.3px ↓ (imperceptible) |
| 0.85, 0.86, 0.87 | `--text-sm` | ≤0.8px ↓ (imperceptible) |
| 0.875, 0.88 | `--text-base` | ≤0.4px ↑ (imperceptible) |
| 0.90 | `--text-base` | 0 (exact) |
| 0.92, 0.93, 0.95 | `--text-base` | ≤0.8px ↑ (imperceptible) |
| 1.0 | `--text-md` | 0 (exact) |
| 1.05 | `--text-md` | −0.8px ↓ (imperceptible) |
| 1.1 | `--text-lg` | 0 (exact) |
| 1.15 | `--text-lg` | −0.8px ↓ (imperceptible) |
| 1.2, 1.25 | `--text-xl` | +1.6px ↑ (very subtle on subheadings) |
| 1.3 | `--text-xl` | 0 (exact) |
| 1.4 | `--text-2xl` | +1.6px ↑ (subtle on card headings) |
| 1.5 | `--text-2xl` | 0 (exact) |
| 1.6 | `--text-3xl` | +3.2px ↑ (noticeable — flag for spot-check) |
| 1.75 | `--text-3xl` | +0.8px ↑ (imperceptible) |
| 1.8 | `--text-3xl` | 0 (exact) |
| 2.0 | `--text-4xl` | +4px ↑ (visible bump on large headings — flag) |
| 2.2, 2.25 | `--text-4xl` | ≤0.8px ↑ (imperceptible) |
| 3.0 | `--text-display` | 0 (exact) |

---

## Flags / Skip List

### Left as-is (do not migrate)
| Value | Count | Reason |
|-------|-------|--------|
| 2.4rem | 1 | Price display in fleet-landing.html — isolated, intentional |
| 2.5rem | 7 | Emoji/icon sizes and price displays in job-board, check-in — not text |
| 2.8rem | 2 | Price display in for-shops.html — intentional |
| 3.8rem | 0 standalone | Only appears inside `clamp()` as an endpoint — skipped |
| All `clamp(…)` | ~12 | Responsive hero/section sizes; clamp endpoints not migrated in this pass |

### Files skipped entirely (intentional typography / marketing / legal)
| File | Reason |
|------|--------|
| `members.html` | Per spec |
| `admin.html`, `admin/agent-fleet*.html`, `admin-invite.html` | Per spec |
| `rideshare/assets/index-FX-IV3rM.css` | Build artifact |
| `MCC-Service-Credits.html`, `MCC-Services-Proposal.html` | Marketing collateral |
| `founding-partner-agreement.html`, `member-founder-agreement.html` | Legal documents (pt-based) |
| `contractor-agreement.html`, `designer-agreement.html` | Legal documents |
| `provider-agreement.html` | Legal document |
| `background-check-disclosure.html` | Internal disclosure form |
| `generate-admin-hash.html` | Internal tool |
| Blog post HTML files (`www/blog/*.html`) | IN SCOPE — migrated |
| Agreement HTML files with pt-based fonts | Only rem values touched; pt/px untouched |

---

## Phase B: Input Field RGBA

### Target replacement
Replace hardcoded RGBA input backgrounds with `var(--bg-input)` (already defined in
shared-styles.css as `rgba(30, 38, 48, 0.9)` dark / `#f0f1f3` light).

### Scope
Selectors that are form input elements: `input`, `select`, `textarea`, `.form-input`,
`.form-select`, `.filter-input`, `.field input`, `.input`. Exclude: progress bars,
code blocks, button hovers, badge states, card backgrounds.

### Files affected
| File | Hardcoded value | Context |
|------|----------------|---------|
| `onboarding-provider.html` | rgba(255,255,255,0.07) | Step input backgrounds |
| `onboarding-member.html` | rgba(255,255,255,0.07) | Step input backgrounds |
| `data-rights.html` | rgba(255,255,255,0.05) | .form-input, .form-select |
| `driver-dispatch.html` | rgba(255,255,255,0.05) | .field input |

### Not replaced (different semantics)
- `rgba(255,255,255,0.06)` on progress bars, code `<code>` elements
- `rgba(255,255,255,0.08)` on button hover states, status badges
- `rgba(255,255,255,0.1)` on step-indicator circles (non-input)
- `rgba(0,0,0,0.2-0.3)` on shadows and card insets

---

## Visual Regression Priority List

Pages most likely to look noticeably different after migration (spot-check these):

| Priority | Page | Reason |
|----------|------|--------|
| HIGH | `index.html` | 122 rem sizes; 2rem headings → 2.25rem (+4px); 1.6→1.8rem |
| HIGH | `providers.html` | 671 rem sizes; heaviest file |
| HIGH | `for-shops.html` | 1.6rem section headings → 1.8rem |
| MEDIUM | `how-it-works.html` | 2rem headings → 2.25rem |
| MEDIUM | `about.html` | Section headings, founder section |
| MEDIUM | `onboarding-member/provider.html` | 1.2rem step headings → 1.3rem |
| LOW | `login.html` | Form inputs normalised |
| LOW | `providers-directory.html` | Card text, hero subtitle |
| LOW | Blog pages | Body/label text only |
