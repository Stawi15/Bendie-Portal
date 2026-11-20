# 20 — Design System Proposal

**Status:** PROPOSAL. When approved it updates `context/ui-tokens.md`, `ui-rules.md` and `ui-registry.md`, which stay the source of truth. Built from doc 14 (current drift) and the `bendie-design` skill.

## Direction

A calm, dense professional workspace in the Apple productivity tradition: content first, chrome quiet, one accent, clear hierarchy from **weight and spacing rather than boxes**. It keeps Bendie's identity: primary blue `#00629d`, Plus Jakarta Sans, Material role tokens, and the Planner orange accent as **a product marker only**.

Explicitly avoided (frontend-design, §9.1):
- glass on content
- gradient washes
- identical rounded cards for everything
- all-caps eyebrow labels (today's area labels such as "OVERVIEW" and "PROGRAMME")
- decorative illustrations in empty states

## Tokens to add or fix

| Token family | Today | Proposed |
|---|---|---|
| **Radius** | None; `rounded-[20px]` ×146, `xl` ×137, `lg` ×121 | `radius-sm 6` (chips, inputs), `radius-md 10` (buttons, menus), `radius-lg 14` (panels, dialogs), `radius-full`. Replace `rounded-[20px]` gradually, file by file. |
| **Elevation** | `.panel-shadow` only | `elev-0` flat (tables, sidebars), `elev-1` raised (cards, sticky toolbar on scroll), `elev-2` floating (popovers, inspector overlay), `elev-3` modal |
| **Surface** | Material surface-container levels | Keep. Canvas = `surface`; sidebar = `surface-container-low`; inspector = `surface-container-lowest` + left border |
| **Status colour** (semantic) | Raw `bg-*-100` per section badge | `status-blocking`, `status-warning`, `status-done`, `status-info`, `status-neutral`, each with an icon. Badges always carry text. |
| **Product accent** | Orange on parts of the header only | `product-bendie` (primary), `product-planner` (orange), used on product chips and tags only, never on actions |
| **Density** | — | `row-default 44px`, `row-compact 36px` (tables only), `control-h 36px` desktop / 44px touch |
| **Motion** | `transition-all` here and there | `dur-fast 120ms` (hover, press), `dur-base 200ms` (popover), `spring-panel` (inspector and drawer, critically damped, about 0.3 s). **Every** motion has a `prefers-reduced-motion` fallback (opacity only). |
| **Focus** | Mixed `focus:` / `focus-visible:` | One `focus-ring` utility: 2px primary ring, 2px offset, `:focus-visible` only |
| **Section badge colours** | 32 raw palette pairs | Removed from navigation. Icons become monochrome (HIG: sidebar icons follow the accent). Colour is kept only where it means something. |

## Typography

- The scale stays the same.
- Add `tabular-nums` to the table, time, date, count and duration utilities (8 uses today).
- Page titles drop from 32 to 24px inside the event workspace; the event name lives in the sidebar context strip, so it's no longer duplicated (October audit #1).
- **Copy standard** (to confirm):
  - **Case:** sentence case everywhere.
  - **Spelling:** British.
  - **Buttons:** start with a verb.
  - **Errors:** say what to do.
  - **Wording:** "Speakers" in the UI, with the configurable app label shown where it differs.

## Core components (detail in doc 21)

| Component | Replaces | Key behaviour |
|---|---|---|
| **App shell** | Two layouts with different chrome | Sidebar, toolbar, canvas, right panel; one implementation for org and event |
| **Data table** | 16 hand-built tables, card lists | Sticky header, column visibility, sort, filter chips, multi-select with a bulk bar, row actions menu, keyboard navigation, virtualised past ~50 rows, density toggle, URL-synced state |
| **Inspector** | Edit modals for list records | Opens beside the list, tabs per entity, inline validation, dirty guard, `Esc` closes, focus returns to the row |
| **Sheet** | `FormModal` for short tasks (create event, confirm bulk action) | One at a time, titled with the task, never closes on a backdrop click when dirty |
| **Empty state** | `EmptyState` + one-line `<p>` | What it is, a primary action, an import action, optional "why it matters" from the readiness rule |
| **Status badge** | Mixed pills | Icon + text + semantic token |
| **Command palette** | Header event search | Doc 18 |
| **Toast / inline status** | `react-hot-toast` everywhere | Toasts for completion only; errors inline next to the cause; `aria-live="polite"` |

## Conflict with current project rules: APPROVED 2026-11-20

**Decision (developer, 2026-11-20):** adopt the recommended approaches. The inspector replaces `FormModal` for list records. `context/ui-rules.md` is updated in the first implementing Spec Kit feature, not before. The copy standard (sentence case, British spelling) is adopted.

Original analysis:

`context/ui-rules.md` says: *"Add/edit forms for any list-based section are always a `FormModal`… never an inline panel."* That rule exists because inline panels above lists were a real, recurring bug (2026-08-19). This proposal replaces **modal editing** with a **side inspector**, not with an inline panel above the list, so the original bug can't come back. If approved, `ui-rules.md` is updated to: *"Records in lists are created and edited in the Inspector; short standalone tasks use a Sheet; never an inline panel above a list."*

## Rollout

1. Tokens and the focus ring, which are invisible changes.
2. App shell.
3. Data table + inspector, piloted on Speakers, then Agenda.
4. Module by module, each its own Spec Kit feature, with `/imprint` after each.
