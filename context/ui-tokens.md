# UI Tokens

Design tokens for Bendie Portal — a Material-Design-inspired token set originally sourced from a Bendie Studio design export, now defined as the single source of truth directly in `tailwind.config.js`. Use these exact classes throughout the codebase — never hardcode colors or use raw Tailwind color classes (`bg-blue-500`, `text-gray-600`, etc.) for anything brand-related.

---

## How to Use

This project uses **Tailwind CSS v3** — tokens are defined under `theme.extend` in `tailwind.config.js`, not via a `@theme` CSS block (that's a v4 pattern; this project is v3). Tailwind generates the matching utility classes automatically:

```tsx
// Correct — token-derived utility classes
className="bg-surface text-on-surface border border-outline-variant"

// Never — hardcoded hex
className="bg-[#111c2d] text-[#00629d]"

// Never — raw Tailwind color classes for brand/surface roles
className="bg-blue-600 text-gray-800"
```

**One sanctioned exception:** several existing pages use `border-[#E4EAF0]` (an arbitrary value) for card borders instead of `border-outline-variant`, and `rounded-[20px]` instead of a Tailwind radius scale step. This predates this document — treat `border-outline-variant` and Tailwind's radius scale as correct going forward, and normalize `border-[#E4EAF0]`/`rounded-[20px]` occurrences opportunistically when you touch that file, rather than as a dedicated pass.

---

## tailwind.config.js — Token Definitions

```javascript
theme: {
  extend: {
    colors: {
      // Bendie Studio design tokens
      background: '#f9f9ff',
      surface: '#f9f9ff',
      'surface-bright': '#f9f9ff',
      'surface-dim': '#d0daf2',
      'surface-container-lowest': '#ffffff',
      'surface-container-low': '#f0f3ff',
      'surface-container': '#e8eeff',
      'surface-container-high': '#dfe8ff',
      'surface-container-highest': '#d9e3fb',
      'surface-variant': '#d9e3fb',
      'surface-tint': '#00629d',

      'on-surface': '#111c2d',
      'on-surface-variant': '#404751',
      'on-background': '#111c2d',
      'inverse-surface': '#273143',
      'inverse-on-surface': '#ecf0ff',

      primary: '#00629d',
      'on-primary': '#ffffff',
      'primary-container': '#4ba8f5',
      'on-primary-container': '#003b61',
      'primary-fixed': '#cfe5ff',
      'primary-fixed-dim': '#99cbff',
      'on-primary-fixed': '#001d33',
      'on-primary-fixed-variant': '#004a78',
      'inverse-primary': '#99cbff',

      secondary: '#8c4f06',
      'on-secondary': '#ffffff',
      'secondary-container': '#fdad61',
      'on-secondary-container': '#744000',
      'secondary-fixed': '#ffdcc0',
      'secondary-fixed-dim': '#ffb877',
      'on-secondary-fixed': '#2e1600',
      'on-secondary-fixed-variant': '#6c3a00',

      tertiary: '#555e74',
      'on-tertiary': '#ffffff',
      'tertiary-container': '#98a2ba',
      'on-tertiary-container': '#2f384d',
      'tertiary-fixed': '#d9e2fc',
      'tertiary-fixed-dim': '#bdc6e0',
      'on-tertiary-fixed': '#111b2e',
      'on-tertiary-fixed-variant': '#3d475c',

      error: '#ba1a1a',
      'on-error': '#ffffff',
      'error-container': '#ffdad6',
      'on-error-container': '#93000a',

      outline: '#707882',
      'outline-variant': '#bfc7d2',
    },
    spacing: {
      xs: '4px', base: '8px', sm: '12px', md: '24px', gutter: '24px',
      lg: '32px', xl: '48px', 'margin-desktop': '32px', 'margin-mobile': '16px',
    },
    fontSize: {
      'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '600' }],
      'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
      'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
      'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
      'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
      'headline-sm': ['20px', { lineHeight: '28px', fontWeight: '600' }],
      'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
      'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
      'headline-lg-mobile': ['28px', { lineHeight: '36px', fontWeight: '700' }],
      'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '700' }],
    },
    fontFamily: {
      sans: ['var(--font-plus-jakarta-sans)', 'system-ui', 'sans-serif'],
    },
  },
},
```

Font is **Plus Jakarta Sans** via `next/font/google`, exposed as `--font-plus-jakarta-sans` and applied through the `sans` font family.

Every `fontSize` token pairs a size with a matching `font-*` weight class — e.g. use `text-headline-md font-headline-md` together, not just `text-headline-md` alone, to get the correct weight/line-height/letter-spacing as one unit. This is the pattern used throughout the real components (`SectionHeader`, `MetricCard`).

---

## Color Usage Guide

| Element                          | Token                                             |
| --------------------------------- | -------------------------------------------------- |
| Page background                   | `bg-background`                                    |
| Card / panel surface              | `bg-white` (see note above — cards currently use plain white, not `bg-surface`, which is also `#f9f9ff` and nearly identical) |
| Secondary surface (inputs, empty states) | `bg-surface-container-low`                  |
| Default border                    | `border-outline-variant`                            |
| Primary text                      | `text-on-surface`                                   |
| Secondary/muted text              | `text-on-surface-variant`                           |
| Primary action (buttons, active tab, links) | `bg-primary` / `text-primary`             |
| Secondary accent                  | `bg-secondary` / `text-secondary`                   |
| Error / destructive                | `bg-error` / `text-error`                           |

Per-event theming (`events.theme_primary/secondary/tertiary`) is a **separate, event-specific** color set edited on the Theme Colors page — it does not replace or override these portal chrome tokens, which stay constant across all events. Don't conflate the two.

---

## Icons

**Material Symbols Outlined**, not Ionicons or `lucide-react` (despite some planning docs referencing those). Loaded via a Google Fonts stylesheet link, used as:

```tsx
<span className="material-symbols-outlined">dashboard</span>
```

Icon names come from Google's Material Symbols set (e.g. `checklist`, `image`, `palette`, `mic`, `calendar_month`) — see `src/lib/eventSectionMeta.ts` for the icon used per content section.

---

## Component Tokens

### Card

The real, current recipe (from `basics/page.tsx`, `MetricCard.tsx`, etc.):

```
bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8
```

`.panel-shadow` is a custom class in `globals.css`: `box-shadow: 0px 4px 20px rgba(22, 32, 51, 0.04)`.

### Buttons — defined once in `globals.css` `@layer components`

```css
.btn-primary   { @apply inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:opacity-90 active:scale-95 text-white text-label-md rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100; }
.btn-secondary { @apply inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-surface-container-low text-on-surface text-label-md rounded-xl border border-outline-variant transition disabled:opacity-50 disabled:cursor-not-allowed; }
.btn-danger    { @apply inline-flex items-center gap-2 px-4 py-2.5 bg-error hover:opacity-90 text-white text-label-md rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed; }
```

Always use these classes (`btn-primary`/`btn-secondary`/`btn-danger`) rather than rebuilding button styles inline.

### Form Fields — also defined in `globals.css`

```css
.label { @apply block text-label-sm text-on-surface-variant mb-1.5; }
.hint  { @apply text-xs text-on-surface-variant/70 mt-1; }
.input { @apply w-full px-3 py-2.5 border border-outline-variant rounded-xl text-sm text-on-surface
           placeholder-on-surface-variant/50 bg-white
           focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
           disabled:opacity-50 disabled:cursor-not-allowed; }
```

Applies to `<input>`, `<select>`, and `<textarea>` alike — same `.input` class for all three.

### Scrollbar

`.custom-scrollbar` (in `globals.css`) — thin (6px), transparent track, `#e4eaf0` thumb. Used on the event tab bar for horizontal overflow.

---

## Studio 2.0 tokens (Feature 029)

Added 2026-11-20 for the Studio 2.0 redesign (constitution v2.0.0 Principle V). They're **additive**: no existing class changed value, and existing pages adopt them only when migrated (docs/bendie-revamp/35). Defined in `tailwind.config.js` (`theme.extend`) and `src/globals.css`. Contract for later features: `specs/029-design-tokens-foundation/contracts/ui-tokens-contract.md`.

### Radius

Namespaced `ui-*`, so Tailwind's built-in `rounded-sm/md/lg` are untouched.

| Class | Value | Use |
|---|---|---|
| `rounded-ui-sm` | 6px | Chips, tags, inputs in dense tables |
| `rounded-ui-md` | 10px | Buttons, menus, popovers |
| `rounded-ui-lg` | 14px | Panels, cards, dialogs, sheets, inspector |
| `rounded-full` | built-in | Pills, avatars, status dots |

### Elevation

| Class | Use |
|---|---|
| `shadow-elev-0` | Flat: tables, sidebars |
| `shadow-elev-1` | Raised: cards; a sticky toolbar once scrolled |
| `shadow-elev-2` | Floating: popovers, menus, overlay inspector |
| `shadow-elev-3` | Modal: dialogs and sheets |

`.panel-shadow` stays for existing cards until they're migrated.

### Status: always with an icon **and** a text label, never colour alone

| Status | Classes | Icon (Material Symbols) |
|---|---|---|
| Blocking | `text-status-blocking-fg bg-status-blocking-bg border-status-blocking-border` | `error` |
| Warning | `text-status-warning-fg bg-status-warning-bg border-status-warning-border` | `warning` |
| Done | `text-status-done-fg bg-status-done-bg border-status-done-border` | `check_circle` |
| Info | `text-status-info-fg bg-status-info-bg border-status-info-border` | `info` |
| Neutral | `text-status-neutral-fg bg-status-neutral-bg border-status-neutral-border` | `radio_button_unchecked` |

Every fg/bg pair is at least 4.5:1 contrast (specs/029 research R5).

```tsx
<span className="inline-flex items-center gap-1 rounded-ui-sm border px-2 h-6 text-label-sm font-label-sm text-status-warning-fg bg-status-warning-bg border-status-warning-border">
  <span className="material-symbols-outlined text-label-sm" aria-hidden="true">warning</span>
  2 overlaps
</span>
```

### Product accent: **tags and chips only, never actions**

| Product | Classes |
|---|---|
| Bendie | `text-product-bendie-fg bg-product-bendie-bg`; dot `bg-product-bendie-dot` |
| Planner | `text-product-planner-fg bg-product-planner-bg`; dot `bg-product-planner-dot` |

Buttons and links always use `primary`.

### Density

| Class | Value | Use |
|---|---|---|
| `h-row` / `min-h-row` | 44px | Default table/list row |
| `h-row-compact` / `min-h-row-compact` | 36px | Compact table rows only |
| `h-control` / `min-h-control` | 36px | Buttons and inputs on desktop (pointer) |
| `h-control-touch` / `min-h-control-touch` | 44px | Buttons and inputs on touch |

### Motion: every motion has a reduced-motion fallback

| Class | Value | When the OS asks for reduced motion |
|---|---|---|
| `duration-motion-fast` | 120ms | Instant |
| `duration-motion-base` | 200ms | Instant |
| `duration-motion-panel` | 300ms | Instant |
| `ease-motion-standard` | `cubic-bezier(0.2, 0, 0, 1)` | — |
| `ease-motion-panel` | `cubic-bezier(0.32, 0.72, 0, 1)` (critically damped feel, no bounce) | — |

A global rule in `globals.css` makes all transitions and animations finish immediately under `prefers-reduced-motion: reduce`, disables press-scale and turns off smooth scrolling. Transition **delays** are kept, so the sidebar's hover intent still works. `animate-spin` (progress) and `animate-pulse` (skeletons) keep running. Components can't opt out in this version.

```tsx
<aside className="transition-transform duration-motion-panel ease-motion-panel">…</aside>
```

### Focus

- **Global:** keyboard focus (`:focus-visible`) on links, buttons, tabs, menu items, options, `summary` and tabbable elements shows a 2px `primary` outline with a 2px offset. It has zero specificity (`:where`), so components with their own focus style keep it, and form fields keep the `.input` ring. Mouse clicks don't show it.
- **`.focus-ring`:** the single shared utility for new components that want the same indicator explicitly.
- Never remove focus (`outline-none`) without a visible replacement.

---

## Invariants

- Never hardcode a hex value or use a raw Tailwind color class for anything representing portal chrome (surfaces, text, primary/secondary/error) — use the tokens above.
- Per-event theme colors (`theme_primary/secondary/tertiary`) are user-supplied hex values edited via color pickers — those legitimately are raw hex, stored in the DB, not portal design tokens. Don't confuse the two systems.
- Icons are Material Symbols Outlined — do not introduce a second icon library.
- Reuse `.input`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.label`, `.hint` from `globals.css` rather than redefining equivalent styles inline.
