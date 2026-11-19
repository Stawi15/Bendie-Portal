# 14 — Existing Design System Audit

**Status:** VERIFIED from `tailwind.config.js`, `src/globals.css`, `context/ui-tokens.md`, `context/ui-rules.md`, `context/ui-registry.md` and counts across `src/`. Not checked visually.

## Foundations

| Area | Current state |
|---|---|
| Brand colour | `primary #00629d` with a Material-style role palette (primary, secondary, surface-container levels, outline, on-*). Planner context uses an orange accent on the header, switcher, area underline and stepper only. |
| Event theme | `events.theme_primary/secondary/tertiary`, kept separate from Studio chrome |
| Typography | Plus Jakarta Sans (`next/font`). Scale: label-sm 12, label-md 14, body-sm 14, body-md 16, body-lg 18, headline-sm 20, headline-md 24, headline-lg 32, headline-xl 40. Each size pairs with a `font-*` weight class. |
| Numerals | `tabular-nums` used **8 times** in total, so schedules, flight times and counts mostly use proportional figures |
| Spacing | Tailwind scale plus `margin-desktop 32px` / `margin-mobile 16px` |
| Radius | No radius tokens. Real use: `rounded-[20px]` ×146, `rounded-xl` ×137, `rounded-lg` ×121, `rounded-full` ×92, `rounded-2xl` ×25 |
| Shadow | `.panel-shadow` (0 4 20 rgba(22,32,51,.04)) |
| Icons | Material Symbols Outlined (font) |
| Breakpoints | Tailwind defaults plus `desk` = ≥1024px **and** hover/fine pointer (drives the hover-expand rail vs off-canvas drawer) |
| Motion | Tailwind transitions, `active:scale-95` on buttons, CSS hover-expand sidebar. **No `prefers-reduced-motion` handling anywhere.** No spring or interruptible motion. |

## Components (70 in `components/portal`, 7 in `admin/`)

| Pattern | Shared component? | Notes |
|---|---|---|
| Buttons | `.btn-primary/.btn-secondary/.btn-danger` in `globals.css` | Row actions differ: Bendie uses text links, Planner uses bordered and red buttons |
| Inputs | `.input`, `.label` in `globals.css` | Mixed date controls (doc 13 #16) |
| Modal | `FormModal` (39 usages) plus about 10 hand-rolled `fixed inset-0` overlays | Backdrop click discards. Only 2 files set `role="dialog"`/`aria-modal`. |
| Confirm | `ConfirmContext` | Shared |
| Table | **None.** 16 `<table>` elements, each built by its page | Header colour, padding and radius vary |
| List and row actions | `RowActionsMenu` + per-module `Planner*List` | Bendie lists are bespoke per page |
| Empty state | `EmptyState` exists | Most pages use a one-line `<p>` instead |
| Loading | `PortalLoadingSkeleton`, route `loading.tsx` | Per-page spinners vary |
| Save feedback | `SaveStatus` + `useSaveStatus` (3 pages), toasts elsewhere | |
| Section header | `SectionHeader`, `SectionIconBadge` | Driven by `EVENT_SECTIONS` badge colours (raw `bg-*-100` classes) |
| Cards | `MetricCard`, `NeedsAttentionCard`, `NextMilestoneCard`, `QuickActionsCard`, `RecentActivityCard` | Org overview |
| Tabs and sub-tabs | Inline in the event layout and Logistics | No shared component |
| Inspector, drawer | **None** (the mobile nav drawer only) | |
| Command palette, global search | **None** (header event search) | |
| Import | `CsvImportModal` (shared, 17 screens) | The strongest shared pattern |
| Tag input, image, asset picker, timezone, avatar | `TagInput`, `ImageField`, `AssetPickerModal`, `TimeZoneField`, `Avatar` | |

## Token drift (measured)

| Breach of `ui-tokens.md` | Count |
|---|---|
| Raw palette classes (`bg/text/border-{gray,blue,red,green,slate,zinc}-NNN`) | 248 |
| Hex literals in `.tsx` | 111 |
| `rounded-[20px]` arbitrary radius | 146 |
| `border-[#E4EAF0]` (sanctioned legacy exception) | present |
| Pages on raw gray/blue rather than tokens | Event Dashboard, login, `/`, `/unauthorized` (October audit §30.7) |

## Accessibility signals (source only; WCAG not tested)

- Focus styles: `focus-visible:` ×20, `focus:ring/outline` ×53, so coverage is uneven.
- Dialog semantics are present in only 2 files; focus trapping isn't verified.
- No reduced-motion support.
- Status is often shown by colour, e.g. Planner orange vs Studio blue to mean product.
- Touch: the off-canvas drawer below `desk`. Table behaviour on small screens differs per page.

## Inconsistencies to resolve in doc 20

1. No radius or elevation tokens; three competing radii.
2. No shared table, so density and states vary.
3. Two modal implementations with inconsistent dismissal.
4. Section badge colours come from raw Tailwind palette classes.
5. The product accent is applied partially (October audit §30.7 #38).
6. British/American spelling (doc 13 #20).

Preserve the primary blue, Plus Jakarta Sans, the Material role naming (already themeable) and `CsvImportModal`.
