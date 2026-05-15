# MCC Driver App — Style Guide

Visual + brand spec to keep the standalone "MCC Driver" Replit project visually consistent with the main My Car Concierge web/PWA app. Pull tokens from this doc; do not invent new colors or radii.

Source of truth for the main app is `www/shared-styles.css` (sections "CSS Variables", "Light Theme Override", "Buttons", "Cards", "Form Elements", "Modals"). When in doubt, mirror that file.

---

## 1. Brand voice

- **Tagline**: "Your complete auto ownership platform"
- **Driver-app framing**: positioning is *concierge driver*, not gig courier. Tone is professional, calm, premium — never gamified.
- **Word choice**:
  - "auto" for general references
  - "ride" for casual/friendly tone
  - "vehicle" for formal contexts (legal, receipts, releases)
- **Buttons & CTAs**: action verbs, no exclamation marks. ("Mark Vehicle Received", not "Got it!")
- **Languages to support eventually**: English, Spanish, French, Greek, Chinese, Hindi, Arabic (RTL).

---

## 2. Color tokens

Mirror the main app exactly. Drop these into a `theme.ts` / `colors.ts` / CSS variables file and reference everywhere.

### Dark theme (default)

| Token | Value | Usage |
|---|---|---|
| `--bg-deep` | `#12161c` | App background (warm slate, garage-inspired) |
| `--bg-card` | `rgba(26, 32, 42, 0.9)` | Card surfaces |
| `--bg-elevated` | `rgba(36, 44, 56, 0.95)` | Modals, sheets, raised tiles |
| `--bg-input` | `rgba(30, 38, 48, 0.9)` | Inputs, segmented controls |
| `--text-primary` | `#f5f5f7` | Headings, body |
| `--text-secondary` | `#a0a8b8` | Labels, helper |
| `--text-muted` | `#6b7280` | Captions, timestamps |
| `--accent-gold` | `#c9a227` | Primary brand (bronze/copper) |
| `--accent-gold-soft` | `rgba(201, 162, 39, 0.18)` | Gold tints, selected chips |
| `--accent-bronze` | `#cd7f32` | Secondary brand metal |
| `--accent-teal` | `#22d3ee` | Coolant teal — info, links |
| `--accent-blue` | `#38bdf8` | Interactive accent |
| `--accent-green` | `#34d399` | Success, completed |
| `--accent-orange` | `#fb923c` | Warning, in-progress |
| `--accent-red` | `#f87171` | Error, problem flagged |
| `--border-subtle` | `rgba(160, 168, 184, 0.15)` | Hairlines |
| `--border-medium` | `rgba(160, 168, 184, 0.25)` | Dividers, input borders |
| `--border-focus` | `rgba(56, 189, 248, 0.5)` | Focus ring |

### Light theme

| Token | Value | Usage |
|---|---|---|
| `--bg-deep` | `#fefdfb` | App background (warm off-white) |
| `--bg-card` | `#ffffff` | Card surfaces |
| `--bg-elevated` | `#ffffff` | Modals, sheets |
| `--bg-input` | `#f0f1f3` | Inputs |
| `--text-primary` | `#1a1a2e` | Headings, body |
| `--text-secondary` | `#3d3d5c` | Labels |
| `--text-muted` | `#5c5c7a` | Captions |
| `--accent-gold` | `#b8942d` | **Deeper gold** for CTA contrast (research: +23% CTR vs lighter gold) |
| `--accent-gold-soft` | `rgba(184, 148, 45, 0.12)` | Tints |
| `--accent-bronze` | `#1e3a5f` | **Navy** for trust on light |
| `--accent-teal` | `#0d7377` | Deep teal — info, links |
| `--accent-blue` | `#1e3a5f` | Navy as interactive accent |
| `--accent-green` | `#059669` | Success |
| `--border-subtle` | `rgba(30, 58, 95, 0.10)` | Navy-tinted hairlines |
| `--border-medium` | `rgba(30, 58, 95, 0.18)` | Dividers |
| `--border-focus` | `rgba(30, 58, 95, 0.4)` | Focus ring |

### What NOT to use

These appear in older auth pages and were retired in Task #390 — do **not** carry them into Driver:

- `#0a0a0f` (too cold/black; use `#12161c`)
- `#d4a855` (off-brand gold; use `#c9a227` dark / `#b8942d` light)
- `#f8fafc` (too cool for light bg; use `#fefdfb`)
- `#c9a962` (washed-out light gold; use `#b8942d`)

---

## 3. Typography

Two families, both Google Fonts, already used everywhere in the main app:

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet">
```

- **Body / UI**: `Outfit`, weights 400 / 500 / 600. Fallback `-apple-system, BlinkMacSystemFont, sans-serif`.
- **Display headings**: `Playfair Display`, weights 500 / 600. Use sparingly — screen titles, brand wordmark, hero copy. Not for buttons or labels.

Sizes (mobile-first; the Driver app is mobile-only):

| Role | Size | Weight | Family |
|---|---|---|---|
| Screen title | 1.4–1.6rem | 500 | Playfair Display |
| Section header | 1.05rem | 600 | Outfit |
| Body | 0.92–0.95rem | 400 | Outfit |
| Label | 0.85rem | 500 | Outfit |
| Caption | 0.78rem | 400 | Outfit |
| Button | 0.95rem | 600 | Outfit |

Line height: `1.6` for body, `1.2` for headings.

---

## 4. Spacing, radius, shadow

### Radius
- `--radius-sm: 8px` — chips, badges
- `--radius-md: 12px` — inputs, small buttons
- `--radius-lg: 16px` — primary buttons, cards
- `--radius-xl: 24px` — modals, full-screen sheets

### Spacing scale (use multiples)
`4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40` — same scale used in `shared-styles.css`. Avoid arbitrary values.

### Shadows (dark)
- `--shadow-sm: 0 2px 8px rgba(0,0,0,0.2)` — subtle lift
- `--shadow-md: 0 4px 20px rgba(0,0,0,0.2)` — cards
- `--shadow-lg: 0 12px 40px rgba(0,0,0,0.3)` — modals
- `--shadow-glow-gold: 0 0 60px rgba(201, 162, 39, 0.1)` — hero/accent moments

### Shadows (light) — softer with navy tint
- `--shadow-sm: 0 2px 8px rgba(30, 58, 95, 0.08)`
- `--shadow-md: 0 4px 16px rgba(30, 58, 95, 0.10)`
- `--shadow-lg: 0 12px 32px rgba(30, 58, 95, 0.12)`

---

## 5. Components

### Primary button (gold gradient)
```css
.btn-primary {
  background: linear-gradient(135deg, var(--accent-gold), #c49a45);
  color: #ffffff;            /* dark mode */
  padding: 14px 24px;
  border-radius: var(--radius-lg);
  font-weight: 600;
  box-shadow: var(--shadow-glow-gold);
}
[data-theme="light"] .btn-primary {
  background: linear-gradient(135deg, #b8942d, #d4a63a);
  color: #ffffff;
  box-shadow: 0 3px 14px rgba(184, 148, 45, 0.35);
}
```
Hover/press: `transform: translateY(-1px)` + larger shadow. Disabled: `opacity: 0.6; cursor: not-allowed`.

### Secondary button
Light-gray outline on dark; navy outline on light. Used for "Decline", "Skip", "Back".

### Destructive
Red text on translucent red background. Used for "Cancel Job", "Flag Problem".

### Input
14px vertical padding, `--bg-input` background, `--border-subtle` border, `--border-focus` ring on focus (3px outer ring at 10% opacity of accent).

### Card
Slight gradient on dark (`linear-gradient(145deg, #1a202a, #141a24)`); plain `#ffffff` on light. Always rounded with `--radius-lg`. Inner shadow on dark: `inset 0 1px 0 rgba(255,255,255,0.03)` for a subtle metallic edge.

### Status pill
Use the soft accent variants: `--accent-green-soft` for "Completed", `--accent-orange-soft` for "In progress", `--accent-red-soft` for "Problem flagged", `--accent-gold-soft` for "Awaiting".

### Bottom sheet / modal
`--bg-elevated`, `--radius-xl` on top corners only when slide-up sheet. Backdrop `rgba(0,0,0,0.7)` with `backdrop-filter: blur(4px)`.

---

## 6. Day / Night toggle

The main app ships an auto-injected pill toggle (`auth-theme-toggle.js`). For the Driver app, mirror the behavior natively (React Native `Appearance` API or settings screen toggle), but keep the same contract:

- Persist choice in local storage (`theme: 'dark' | 'light'`).
- Default to `'dark'` if no preference saved.
- Update OS status-bar color: `#12161c` (dark) / `#fefdfb` (light).
- Add a 300ms `background-color/color/border-color` transition class so the swap doesn't flash.

UX: small pill with sun/moon icon and the label "Day" / "Night" — top-right of the screen on auth/settings, hidden in the active job view to reduce clutter.

---

## 7. Iconography

- Line icons, 1.5px stroke, rounded caps. Lucide / Feather are good matches.
- Icon size scales: 16px (inline), 20px (button), 24px (nav), 32–48px (hero/empty state).
- Color: inherit `currentColor`. Tint with the accent variables, not raw hex.

---

## 8. Motion

- Default ease: `cubic-bezier(0.4, 0, 0.2, 1)` (standard "ease-out").
- Durations: 150ms (hover/focus), 200ms (small UI), 300ms (theme swap, sheet), 400ms max.
- No bounce, no overshoot. The brand reads as premium/calm.
- Map updates (driver location ping) animate the pin smoothly between samples — no teleporting.

---

## 9. Mobile-specific guidance

The Driver app is mobile-only (Twilio OTP login on a phone), so:

- **Safe areas**: respect `env(safe-area-inset-top/bottom)` on every screen — both notch and home-indicator.
- **Tap targets**: minimum 44 × 44pt.
- **Bottom CTA**: the primary action (e.g. "Mark Vehicle Received") sits in a sticky footer bar with safe-area padding so it's always thumb-reachable.
- **Job-in-progress lock**: when a leg is active, the screen should resist accidental theme/setting changes — hide the toggle, dim non-essential UI.
- **Offline grace**: show a teal "Reconnecting…" pill at the top instead of an error modal when the network drops mid-shift.
- **Dark first**: drivers work day and night; assume dark mode by default and validate every screen there before tweaking light.

---

## 10. Quick-start: minimal `theme.css`

Drop this at the root of the Driver app and you're 90% there:

```css
:root {
  --bg-deep: #12161c;
  --bg-card: rgba(26, 32, 42, 0.9);
  --bg-elevated: rgba(36, 44, 56, 0.95);
  --bg-input: rgba(30, 38, 48, 0.9);
  --text-primary: #f5f5f7;
  --text-secondary: #a0a8b8;
  --text-muted: #6b7280;
  --accent-gold: #c9a227;
  --accent-gold-soft: rgba(201, 162, 39, 0.18);
  --accent-teal: #22d3ee;
  --accent-blue: #38bdf8;
  --accent-green: #34d399;
  --accent-orange: #fb923c;
  --accent-red: #f87171;
  --border-subtle: rgba(160, 168, 184, 0.15);
  --border-medium: rgba(160, 168, 184, 0.25);
  --border-focus: rgba(56, 189, 248, 0.5);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 20px rgba(0,0,0,0.2);
  --shadow-lg: 0 12px 40px rgba(0,0,0,0.3);
}

[data-theme="light"] {
  --bg-deep: #fefdfb;
  --bg-card: #ffffff;
  --bg-elevated: #ffffff;
  --bg-input: #f0f1f3;
  --text-primary: #1a1a2e;
  --text-secondary: #3d3d5c;
  --text-muted: #5c5c7a;
  --accent-gold: #b8942d;
  --accent-gold-soft: rgba(184, 148, 45, 0.12);
  --accent-teal: #0d7377;
  --accent-blue: #1e3a5f;
  --accent-green: #059669;
  --border-subtle: rgba(30, 58, 95, 0.10);
  --border-medium: rgba(30, 58, 95, 0.18);
  --border-focus: rgba(30, 58, 95, 0.4);
  --shadow-sm: 0 2px 8px rgba(30, 58, 95, 0.08);
  --shadow-md: 0 4px 16px rgba(30, 58, 95, 0.10);
  --shadow-lg: 0 12px 32px rgba(30, 58, 95, 0.12);
}

body {
  background: var(--bg-deep);
  color: var(--text-primary);
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
  line-height: 1.6;
}
```

---

## 11. Acceptance checklist

Before shipping a Driver app screen, verify:

- [ ] Background uses `--bg-deep`, never raw `#000` or `#fff`.
- [ ] All text colors come from `--text-*` tokens.
- [ ] Primary CTA is the gold gradient with white text in **both** themes.
- [ ] Day/Night toggle flips the screen with a smooth 300ms transition.
- [ ] No `#0a0a0f`, `#d4a855`, `#f8fafc`, or `#c9a962` literals anywhere.
- [ ] Status-bar color matches the active theme bg.
- [ ] Tap targets ≥ 44pt; safe-area padding on top + bottom.
- [ ] Tested in dark mode first; light mode passes WCAG AA contrast.
