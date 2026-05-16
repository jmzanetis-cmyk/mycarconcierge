# MCC Driver App — Style Match Guide

The "MCC Driver" app is a separate Replit project (see Task #332 and
[`docs/driver-app-api.md`](./driver-app-api.md)). This guide describes the
look, feel, and copy rules the Driver app should follow so it visually
reads as part of the My Car Concierge platform.

The companion file [`driver-app-assets/driver-tokens.css`](./driver-app-assets/driver-tokens.css)
is a drop-in stylesheet — copy it into the Driver app, link the fonts,
and you are 90% of the way there.

---

## 1. Typography

Both fonts are loaded from Google Fonts. Drop these exactly as written
into the `<head>` of every page in the Driver app, **above** the
`driver-tokens.css` link:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet">
```

For full parity with the main platform's `<head>`, also add these
hints **only if the Driver app talks to those origins** (most are
optional for the Driver app — keep just the Supabase one if the app
hits Supabase directly):

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://js.stripe.com" crossorigin>
<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
<link rel="dns-prefetch" href="https://supabase.co">
```

| Family               | Weights         | Used for                                          |
|----------------------|-----------------|---------------------------------------------------|
| **Outfit**           | 300/400/500/600/700 | All body text, buttons, inputs, nav, labels.   |
| **Playfair Display** | 500/600         | Optional editorial headlines (marketing hero only). The Driver app likely won't need this — include only if a future marketing/info screen calls for it. |

Body font stack (set by `driver-tokens.css` on `body`):

```css
font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
```

Base line-height is `1.6`. Default text color is `var(--text-primary)`.

---

## 2. Color tokens

All colors are CSS custom properties on `:root` so the theme can flip by
adding `data-theme="light"` to `<html>`. Use the token names — never
hard-code hex.

### Dark theme (default)

| Token | Hex / rgba | Intended use |
|---|---|---|
| `--bg-deep`        | `#12161c`              | App background (slate, garage-floor vibe) |
| `--bg-card`        | `rgba(26,32,42,0.9)`   | Standard card surface |
| `--bg-elevated`    | `rgba(36,44,56,0.95)`  | Modals, header pills, popovers |
| `--bg-input`       | `rgba(30,38,48,0.9)`   | Form inputs, ghost-button hover |
| `--text-primary`   | `#f5f5f7`              | Headings, body copy |
| `--text-secondary` | `#a0a8b8`              | Labels, muted copy |
| `--text-muted`     | `#6b7280`              | Hints, placeholders |
| `--accent-gold`    | `#c9a227`              | Primary brand accent (bronze/copper) — CTAs, focus states |
| `--accent-bronze`  | `#cd7f32`              | Secondary engine-metal accent |
| `--accent-teal`    | `#22d3ee`              | Coolant accent — informational highlights |
| `--accent-blue`    | `#38bdf8`              | Primary action gradient base |
| `--accent-green`   | `#34d399`              | Success states (job accepted, leg completed) |
| `--accent-red`     | `#f87171`              | Danger / decline / problem flagged |
| `--accent-orange`  | `#fb923c`              | Warning (vehicle awaiting release) |
| `--border-subtle`  | `rgba(160,168,184,.15)`| Default card / input borders |
| `--border-medium`  | `rgba(160,168,184,.25)`| Hover / focus borders |
| `--border-focus`   | `rgba(56,189,248,.5)`  | Input focus ring |

### Light theme (`<html data-theme="light">`)

The light theme is **not just inverted dark** — it shifts the accent
language to navy + deeper gold for WCAG-compliant contrast (research:
~23% higher CTA CTR on the deeper gold).

| Token | Light value | Notes |
|---|---|---|
| `--bg-deep`        | `#f3f4f6` | Warmer than pure white |
| `--bg-card`        | `#ffffff` | |
| `--text-primary`   | `#1a1a2e` | Strong, near-black for readability |
| `--accent-gold`    | `#b8942d` | Deeper gold — button text is white over this |
| `--accent-bronze`  | `#1e3a5f` | Navy blue for trust signals |
| `--accent-teal`    | `#0d7377` | Deep teal, AA on white |
| `--accent-blue`    | `#1e3a5f` | Navy primary in light mode |
| `--accent-green`   | `#059669` | AA on white |

### Contrast / accessibility rules

- Gold buttons (`.btn-gold`, and `.btn-primary` in light mode) follow a
  theme-specific text-color rule baked into `driver-tokens.css`:
  - **Dark mode** — dark text (`#12161c`) on the brighter `#c9a227`
    gold passes AA.
  - **Light mode** — **white** text at `font-weight: 600` on the deeper
    `#b8942d` gold passes AA. Never use dark text on light-mode gold —
    contrast fails AA.
- `--text-primary` on `--bg-deep` is AA-large in both themes.
- Use `--text-secondary` for descriptive subtitles, not body copy at
  small sizes.
- Focus states should always be visible — the default
  `.form-input:focus` ring is a 3px halo around `--border-focus`.

---

## 3. Button variants

All buttons share the `.btn` base class (rounded `--radius-md`, font
weight 500, gap 8 between icon + label). Add a variant class.

| Class | Look | When to use |
|---|---|---|
| `.btn-primary` | Blue→light-blue gradient (navy in light mode), glowing shadow | The dominant action on a screen (e.g. "Accept Job", "Start Leg") |
| `.btn-gold`    | Gold→amber gradient, dark text in dark mode / white text in light mode | High-emphasis money / urgency actions (e.g. "Cash Out", "Tip Driver"). Use sparingly — only one per screen |
| `.btn-success` | Green gradient | Confirmation moments (e.g. "Mark Leg Complete") |
| `.btn-secondary` | Elevated background, subtle border | Secondary actions that pair with a primary (e.g. "View Details" next to "Accept") |
| `.btn-danger`  | Red translucent | Destructive / decline (e.g. "Decline Job", "Cancel Shift") |
| `.btn-ghost`   | Transparent until hover | Tertiary actions in toolbars (e.g. "Filter", "Sort") |

Size modifiers: `.btn-sm` for inline / dense lists, `.btn-lg` for hero
CTAs.

All buttons have a `:disabled` style at `opacity: 0.6` with
`cursor: not-allowed`. **Gate submit/destructive buttons until the form
is valid** — start them with the `disabled` attribute and enable them
in the relevant change handler (this matches Task #425's Stripe
gating discipline).

---

## 4. Cards

`.card` is the workhorse container.

```html
<section class="card">
  <header class="card-header">
    <h2 class="card-title">Tonight's Shift</h2>
    <button class="btn btn-ghost btn-sm">Refresh</button>
  </header>
  <!-- card body -->
</section>
```

- Default padding `24px`, bottom margin `20px`.
- Dark mode: subtle gradient + inset highlight on top edge.
- Light mode: flat white with a navy-tinted soft shadow.
- Border radius is `--radius-lg` (`16px`).

---

## 5. Radii & shadows

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `8px`  | Pills, small chips |
| `--radius-md` | `12px` | Buttons, inputs |
| `--radius-lg` | `16px` | Cards, panels |
| `--radius-xl` | `24px` | Modals, sheets |

| Token | Effect |
|---|---|
| `--shadow-sm` | Subtle resting elevation (default buttons) |
| `--shadow-md` | Card resting elevation |
| `--shadow-lg` | Floating sheets, drawers |
| `--shadow-glow-gold` | Brand accent halo (use sparingly) |
| `--shadow-glow-blue` | Primary-button glow |

---

## 6. Theme toggle

The platform uses a **pill-shaped header toggle** with both an icon
(sun ↔ moon) and a "Day"/"Night" word label so the action is
unambiguous. The label is critical for accessibility — icon-only
toggles fail usability testing.

Recommended markup (works with `.header-theme-toggle` from
`driver-tokens.css`):

```html
<button class="header-theme-toggle" id="theme-toggle" aria-label="Switch theme">
  <span class="theme-icon-sun"  aria-hidden="true">☀️</span>
  <span class="theme-icon-moon" aria-hidden="true">🌙</span>
  <span class="theme-label-dark">Night</span>
  <span class="theme-label-light">Day</span>
</button>
```

The sun shows in dark mode (click to go to day); the moon shows in
light mode (click to go to night). `driver-tokens.css` handles the
sun/moon `display` swap via `[data-theme="..."]` selectors — you only
need to wire the click handler:

Always set `data-theme` explicitly on `<html>` at startup (before
first paint, ideally from an inline script) so the toggle's
sun/moon + Day/Night selectors render predictably and there is no
unstyled-flash.

```js
const html = document.documentElement;
function setTheme(next) {
  html.classList.add('theme-transition');
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next); // matches main platform's key
  setTimeout(() => html.classList.remove('theme-transition'), 350);
}
const saved = localStorage.getItem('theme') || 'dark';
setTheme(saved);
document.getElementById('theme-toggle').addEventListener('click', () => {
  setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});
```

The `theme-transition` class on `<html>` enables a 0.3s ease on every
themed property so the swap doesn't snap.

---

## 7. Brand voice & copy rules

Pulled from `replit.md`'s "User Preferences" section so the Driver app
sounds like the platform:

- **Brand line:** *Your complete auto ownership platform.*
- **Tone:** Professional, informative, memorable, and witty without
  being gimmicky. Never bro-y or overly casual.
- **Key headline pattern:** *"One app. Every auto need. Zero hassle."*
- **Four pillars** (referenced in marketing copy): Get Quotes, Manage
  Vehicles, Maintaining Your Ride, Shop Smarter.

### Terminology

| Word | Use when… | Example |
|---|---|---|
| **auto** | Talking about the category generically | "auto care", "auto ownership" |
| **ride** | Casual / friendly tone | "your ride", "your next ride" |
| **vehicle** | Formal contexts — legal, forms, status messages | "vehicle owner", "vehicle received" |
| **My Car Concierge** | Brand name — never abbreviated or translated | |

For the Driver app specifically: use **"vehicle"** for status copy
("Vehicle received", "Vehicle released") to match what the member /
provider already see in the main app. Use **"ride"** sparingly in
empty-state friendly copy. Avoid "car" except in the brand name.

---

## 8. How to apply this in the Driver app (quick start)

A checklist for the Driver-app maintainer — one sitting, no surprises:

1. **Add the fonts.** Paste the three `<link>` tags from §1 into
   every page's `<head>` (or your shared layout component).
2. **Copy `driver-tokens.css`.** Drop
   [`docs/driver-app-assets/driver-tokens.css`](./driver-app-assets/driver-tokens.css)
   into the Driver project (e.g. `public/css/driver-tokens.css`) and
   link it after the Google Fonts tag.
3. **Set the body font.** Either remove any conflicting `font-family`
   rules in your existing stylesheets, or scope them inside specific
   components. The token file already sets
   `body { font-family: 'Outfit', … }`.
4. **Use the documented class names.** Replace ad-hoc buttons with
   `.btn .btn-primary` / `.btn-gold` / `.btn-secondary` / `.btn-success`
   / `.btn-danger` / `.btn-ghost`. Replace ad-hoc containers with
   `.card` + `.card-header` + `.card-title`. Use `.form-input` /
   `.form-label` for forms.
5. **Wire the theme toggle.** Add the markup from §6 to your top nav,
   wire the click handler, and persist the choice to `localStorage`
   under the key `theme` so it matches the main platform.
6. **Audit contrast.** Spot-check every gold button has white text in
   light mode, and that focus rings are visible on inputs.
7. **Match copy to §7.** Run a global find for "car" outside the brand
   name and replace with "vehicle" or "ride" depending on context.

---

## 9. What this guide does NOT cover

- Specific Driver-app screens (job card, shift map, earnings) — those
  are the Driver-app team's design surface.
- Push notification copy or icon assets.
- Native iOS/Android navigation chrome (status bar, tab bar) —
  follow each platform's HIG / Material guidelines, but use the same
  color tokens for backgrounds and accents.
- Marketing site styling — the Driver app is a working tool, not a
  marketing surface.

If any of those need treatment later, extend this guide rather than
creating a separate one — the goal is a single source-of-truth document
that both projects can reference.
