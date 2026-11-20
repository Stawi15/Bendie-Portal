# 22 — Responsive and Accessibility Strategy

**Status:** PROPOSAL. Target: WCAG 2.2 AA (Portal 2.0 §9.7). Inputs: doc 14 (signals in the source), doc 15 (390px screenshots), `bendie-design/references/ux-rules.md` and `web-interface-guidelines.md`.

## Breakpoints and behaviour

| Width | Sidebar | Canvas | Right panel | Tables |
|---|---|---|---|---|
| ≥1440 | Expanded (248) | Fluid | Docked beside canvas (360–560) | All columns |
| 1280–1439 | Expanded or rail | Fluid | Docked | Column priority hides low-value columns |
| 1024–1279 (`desk`) | Rail (64), hover to expand | Fluid | **Overlays** the canvas | Priority columns |
| 768–1023 / touch | Off-canvas drawer | Full width | Overlay | Priority columns + horizontal scroll inside the table only |
| <768 | Drawer + bottom "area" select | Full width | **Full-screen sheet** | **Stacked rows** (title, two key fields, status) |

On small screens nothing is just shrunk: tables become lists, inspectors become sheets, and toolbars collapse secondary actions into an overflow menu. The primary action always stays visible (HIG toolbar rule).

### Fixes from the 390px screenshots (doc 15)

1. The event title truncates. Use the context strip with a two-line clamp and a full-title tooltip.
2. The header has 7 controls in two rows. Keep organisation, palette and avatar; put the rest in the drawer.
3. "Add session" is clipped. The toolbar overflow rule keeps the primary action visible.
4. The sticky Previous/Next bar covers the first row. Reserve its height (`scroll-padding-bottom`) and only show it in Guided build.

## Accessibility baseline (every new component must pass)

| Area | Rule | Today (doc 14) |
|---|---|---|
| Semantics | Native `button`, `a`, `table`, `label` first; landmarks (`nav`, `main`, `aside`) | Mostly OK |
| Dialogs and sheets | `role="dialog"`, `aria-modal`, labelled title, focus trap, focus returns to the trigger, `Esc` closes (unless dirty, then confirm) | Only 2 files |
| Focus | One `focus-ring`, `:focus-visible`, never `outline-none` without a replacement; sticky bars don't hide the focused element | Mixed |
| Keyboard | Everything reachable by keyboard; drag has keyboard alternatives; shortcuts listed and never required | Unknown, needs a test pass |
| Status | Never colour alone (product, readiness, status always have text or icon); `aria-live="polite"` for toasts and save status | Product shown only by colour |
| Forms | Visible labels, `aria-describedby` errors, focus the first error, `autocomplete`/`type`/`inputmode`, required marked | Toasts dominate (doc 13 #15) |
| Tables | `<table>` semantics, `scope` headers, sortable headers announce their state, row actions labelled with the row name | Varies |
| Motion | `prefers-reduced-motion` gives opacity-only transitions | None today |
| Targets | ≥24×24 CSS px pointer, ≥44 touch | Check in the test pass |
| Contrast | ≥4.5:1 text, ≥3:1 UI; `on-surface-variant` on `surface-container` must be checked | Not measured |
| Time and dates | Venue time shown with the zone label; `Intl` formatting | Partly (Feature 024) |

## How it's verified

1. **Automated:** add `@axe-core/playwright` to the existing walk-through (doc 15). It needs a dev dependency, which is an approval item. It runs on every page in the test environment, with results stored next to `walkthrough.json`.
2. **Keyboard script:** Playwright tab-order and dialog focus checks on the pilot pages (Speakers, Agenda, Create event).
3. **Manual pass:** VoiceOver on Safari for the shell, a table, the inspector and the palette, once per phase.
4. **Review gate:** `bendie-design` review mode plus `/review` before each phase is called done.
