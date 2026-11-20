# Research: 029 Design Tokens Foundation

Each decision was checked against the code on `029-design-tokens-foundation` (from `redesign` @ `aafa9eb`) on 2026-11-20.

## R1: Token names must not collide with Tailwind built-ins

- **Decision:** namespace every new token: `rounded-ui-{sm,md,lg}`, `shadow-elev-{0..3}`, `bg/text/border-status-*`, `*-product-*`, `h-row`, `h-row-compact`, `h-control`, `h-control-touch`, `duration-motion-{fast,base,panel}`, `ease-motion-{standard,panel}`.
- **Rationale:** the code uses Tailwind's built-in `rounded-lg` ×121, `rounded-md` ×5, `rounded-sm` ×2, `rounded-xl` ×137. Redefining `sm`/`md`/`lg` would change those pages (breaks FR-009). Adding under `theme.extend` with new keys is purely additive.
- **Alternatives:** overriding the built-in scale (rejected: visual change); CSS variables only (rejected: the team styles with Tailwind classes, per `ui-tokens.md`).

## R2: Focus indicator without double rings

- **Decision:**
  - A base rule `:where(a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, [tabindex]:not([tabindex="-1"])):focus-visible { outline: 2px solid <primary>; outline-offset: 2px; }`.
  - A `.focus-ring` utility in `@layer utilities` for new components that want the same look explicitly.
- **Rationale:**
  - `:where()` has **zero specificity**, so any component's own `focus-visible:outline-none` plus ring (20 places) or `focus:outline-none` wins. Those keep their current look, with no doubling.
  - Form fields (`input`, `select`, `textarea`) are excluded because `.input` already provides `focus:ring-2` (edge case in the spec).
  - `:focus-visible` means mouse clicks don't show it.
  - An outline (not box-shadow) doesn't fight Tailwind's ring shadow.
  - Contrast: primary `#00629d` on white is 6.49:1 and on `surface-container-low` 5.87:1; the 2px offset keeps it visible on primary buttons.
- **Alternatives:** Tailwind `focus-visible:ring` added to every component (rejected: touches ~70 files, against scope); a global `*:focus-visible` (rejected: would double up on inputs).

## R3: Global reduced motion

- **Decision:** `@media (prefers-reduced-motion: reduce)`:
  - set transition and animation duration to `0.01ms` and the iteration count to 1 on all elements
  - neutralise press-scale (`:active { --tw-scale-x: 1; --tw-scale-y: 1 }`)
  - `scroll-behavior: auto`
  - **keep** `animate-spin` (essential progress, 5 uses) and `animate-pulse` (an opacity-only loading skeleton, 73 uses), both exempt
- **Rationale:**
  - Covers the sidebar width transition (`globals.css` Feature 016), `active:scale-95` on buttons (4) and `transition-all` (12) without touching components.
  - `transition-delay` is unaffected, so the sidebar's hover-intent delay still works (spec edge case).
  - Spinners convey activity and are allowed as essential motion.
- **Alternatives:** Tailwind `motion-reduce:` per component (rejected: scope); removing all animation (rejected: spinners stop, so activity is no longer visible).

## R4: Existing `outline-none` without a replacement

- **Finding:** only two elements remove the outline without a visible-focus replacement:
  - `RowActionsMenu.tsx:113`: menu items **do** show `focus-visible:bg-surface-container-low`, the standard menu-item highlight (HIG).
  - `ThemeDesignerModal.tsx:51`: a `tabIndex={-1}` container, not keyboard-tabbable, focused programmatically; it shows `border-primary` when active.
- **Decision:** no component change. Both already meet "visible focus" for their role. Recorded so `/review` doesn't flag them as misses.

## R5: Colour values and contrast (computed, WCAG 2.x formula)

| Token pair | Contrast |
|---|---|
| status-blocking `#ba1a1a` on `#ffdad6` (existing error / error-container) | 5.00:1 |
| status-warning `#8c4f06` (existing secondary) on `#ffdcc0` | 5.02:1 |
| status-done `#146c2e` on `#d6f5dc` (new; no green role exists) | 5.59:1 |
| status-info `#00629d` (primary) on `#cfe5ff` (primary-fixed) | 5.04:1 |
| status-neutral `#404751` (on-surface-variant) on `#e8eeff` (surface-container) | 8.09:1 |
| product-bendie `#00629d` on white | 6.49:1 |
| product-planner `#c2410c` on white / on tint `#fff1e6` | 5.18:1 / 4.68:1 |

Reusing existing Material roles where they exist keeps the brand. Planner keeps its existing Tailwind orange family (`productPresentation.ts` uses orange-500/700).

## R6: Motion values

- `motion-fast` 120ms, `motion-base` 200ms (matches the existing `duration-200` and sidebar timings), `motion-panel` 300ms.
- `ease-motion-standard` `cubic-bezier(0.2, 0, 0, 1)` and `ease-motion-panel` `cubic-bezier(0.32, 0.72, 0, 1)`, a CSS approximation of a critically damped spring (no bounce).
- **Rationale:** this is CSS only, so no motion library is needed (doc 21: add `motion` only if interruptible springs are required). Real spring physics is deferred to the app-shell feature.

## R7: Rule documents to reconcile (constitution Sync Impact Report)

- `context/code-standards.md`:
  - "Next.js 14 Conventions" becomes Next.js 15 / React 19
  - "no service layer" becomes the domain-module rule (constitution II)
  - Dependencies: "headless primitives allowed when pinned and listed"
- `context/ui-rules.md`:
  - "always a FormModal" becomes Inspector (list records) / Sheet (short tasks), with FormModal valid until migrated and the inline-panel ban kept
  - add focus-ring and reduced-motion rules
- `context/architecture.md` is also listed in the Sync Impact Report, but it isn't in this spec's FR-011. **Flagged only:** its stack line still says Next 14; it's updated in the app-shell feature, which changes structure (constitution VII).
