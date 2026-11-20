# Token Catalogue (data model): 029

No database entities. The "data" of this feature is the token set: name → value → intended use. Every entry must appear in `context/ui-tokens.md` (FR-010).

## Radius (`borderRadius`)

| Token / class | Value | Use |
|---|---|---|
| `rounded-ui-sm` | 6px | Chips, tags, inputs in dense tables |
| `rounded-ui-md` | 10px | Buttons, menus, popovers |
| `rounded-ui-lg` | 14px | Panels, cards, dialogs, sheets, inspector |
| `rounded-full` | built-in | Pills, avatars, status dots |

## Elevation (`boxShadow`)

| Token / class | Value | Use |
|---|---|---|
| `shadow-elev-0` | `none` | Tables, sidebars, flat surfaces |
| `shadow-elev-1` | `0 1px 2px rgba(17,28,45,0.06), 0 1px 3px rgba(17,28,45,0.04)` | Cards; a sticky toolbar once scrolled |
| `shadow-elev-2` | `0 8px 24px rgba(17,28,45,0.10), 0 2px 6px rgba(17,28,45,0.06)` | Popovers, menus, overlay inspector |
| `shadow-elev-3` | `0 20px 48px rgba(17,28,45,0.18), 0 4px 12px rgba(17,28,45,0.08)` | Modals and sheets |

(The shadow colour is `on-surface` `#111c2d` at low alpha. `.panel-shadow` stays for existing cards.)

## Status (`colors.status.*`), always with an icon and text

| Status | `fg` | `bg` | `border` | Icon (Material Symbols) | Contrast fg/bg |
|---|---|---|---|---|---|
| blocking | `#ba1a1a` | `#ffdad6` | `#ffb4ab` | `error` | 5.00:1 |
| warning | `#8c4f06` | `#ffdcc0` | `#ffb877` | `warning` | 5.02:1 |
| done | `#146c2e` | `#d6f5dc` | `#9ad9a8` | `check_circle` | 5.59:1 |
| info | `#00629d` | `#cfe5ff` | `#99cbff` | `info` | 5.04:1 |
| neutral | `#404751` | `#e8eeff` | `#bfc7d2` | `radio_button_unchecked` | 8.09:1 |

Classes: `text-status-<s>-fg`, `bg-status-<s>-bg`, `border-status-<s>-border`.

## Product accent (`colors.product.*`): tags and chips only, never actions

| Product | `fg` | `bg` | `dot` |
|---|---|---|---|
| bendie | `#00629d` | `#e3f0fb` | `#00629d` |
| planner | `#c2410c` | `#fff1e6` | `#f97316` |

## Density (`height` / `minHeight`)

| Token | Value | Use |
|---|---|---|
| `h-row` / `min-h-row` | 44px | Default table/list row |
| `h-row-compact` | 36px | Compact table rows only |
| `h-control` | 36px | Buttons and inputs, pointer (desktop) |
| `h-control-touch` | 44px | Buttons and inputs, touch |

## Motion (`transitionDuration`, `transitionTimingFunction`)

| Token | Value | Reduced-motion fallback |
|---|---|---|
| `duration-motion-fast` | 120ms | instant (0.01ms) |
| `duration-motion-base` | 200ms | instant |
| `duration-motion-panel` | 300ms | instant, or an opacity-only fade where the component opts in |
| `ease-motion-standard` | `cubic-bezier(0.2, 0, 0, 1)` | n/a |
| `ease-motion-panel` | `cubic-bezier(0.32, 0.72, 0, 1)` (critically damped feel, no bounce) | n/a |

## Focus

| Item | Behaviour |
|---|---|
| Global keyboard focus | 2px `primary` outline, 2px offset, on `:focus-visible` for links, buttons, tabs, menu items, options, summary, tabbable elements. Zero specificity, so component focus styles win. Form fields are excluded (they have `.input` focus). |
| `.focus-ring` utility | The same look, applied explicitly by new components (the constitution v2.0.0 single utility) |
