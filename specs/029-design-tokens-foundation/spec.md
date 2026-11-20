# Feature Specification: Design Tokens, Focus Ring and Reduced-Motion Foundation

**Feature Branch**: `029-design-tokens-foundation`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "Feature 031 — Design tokens, focus ring and reduced-motion foundation for Bendie Studio 2.0 (roadmap docs/bendie-revamp/36 Phase 1; design system proposal docs/bendie-revamp/20; constitution v2.0.0 Principle V). Add the missing design tokens to the existing token system without changing how any page looks today: radius scale, elevation levels, semantic status tokens paired with icons, product accent tokens for tags only, density tokens, and motion tokens with a reduced-motion fallback. Provide one shared focus-ring utility used via keyboard focus, and a global reduced-motion rule. Record everything in context/ui-tokens.md and reconcile context/ui-rules.md and context/code-standards.md with constitution v2.0.0. Out of scope: migrating existing pages, the new app shell, inspectors, new dependencies. Success: no visual change except visible keyboard focus and honouring reduced motion; tokens documented; checks pass; walk-through shows identical access results."

> Numbering note: the Portal 2.0 roadmap (docs/bendie-revamp/36) called this "Feature 031". Spec Kit's sequential numbering assigns **029**. The roadmap is updated to match.

## Context

Bendie Studio 2.0 (docs/bendie-revamp/17–23) will build a new workspace shell, data tables and inspectors. Today Studio has no radius, elevation, status, density or motion tokens. It has three competing corner radii, 248 raw colour classes and 111 hard-coded hex values. Keyboard focus is shown inconsistently, and there's no reduced-motion handling at all (docs/bendie-revamp/14). Constitution v2.0.0 Principle V now **requires** a single focus-ring utility, a reduced-motion variant for any motion, and token-only styling for new UI. This feature lays that foundation **without** redesigning any page, so later phases can use it safely.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Keyboard users can always see where they are (Priority: P1)

An organiser who navigates Studio with the keyboard (Tab / Shift+Tab) sees a clear, consistent focus indicator on every interactive control (links, buttons, menu items, tabs, sidebar items, icon buttons), so they never lose their place.

**Why this priority**: Accessibility baseline (WCAG 2.2 AA, focus visible). The constitution requires it for new UI, and today's coverage is uneven.

**Independent Test**: Tab through the org Overview, an event Dashboard, the Agenda page and the Create event dialog. Every focused control shows the same focus indicator, and mouse clicks don't leave an indicator behind.

**Acceptance Scenarios**:

1. **Given** any Studio page, **When** the user moves focus with the keyboard, **Then** the focused control shows the shared focus indicator with at least 3:1 contrast against its surroundings.
2. **Given** a control that relies on the shared indicator, **When** it receives focus from a mouse click, **Then** the shared indicator doesn't appear (keyboard focus only). Components that already define their own focus style keep today's behaviour unchanged.
3. **Given** a text input that already shows its own focus style, **When** it receives focus, **Then** exactly one focus treatment is visible (no doubled rings).

---

### User Story 2: People who prefer reduced motion aren't shown non-essential animation (Priority: P1)

An organiser whose operating system is set to "reduce motion" uses Studio without sliding, scaling or expanding animations. Changes still happen instantly or with a short fade, so nothing is lost.

**Why this priority**: Accessibility (vestibular sensitivity). It's required by constitution v2.0.0, and nothing honours it today.

**Independent Test**: Turn on the OS reduced-motion setting, then use the hover-expand sidebar, open and close dialogs, and press buttons. Nothing slides or scales; every state change is still visible.

**Acceptance Scenarios**:

1. **Given** reduced motion is on, **When** the desktop sidebar expands, **Then** it changes state without a width animation.
2. **Given** reduced motion is on, **When** a button is pressed, **Then** there's no scale ("press shrink") animation.
3. **Given** reduced motion is off, **When** the same actions happen, **Then** behaviour is exactly as today.

---

### User Story 3: The Studio team can build new screens from documented tokens (Priority: P2)

The people building Studio 2.0 (developer + Claude) can style new components using named tokens for corner radius, depth, status, product accent, row density and motion, and can find them all documented in one place. They don't need to invent values or hard-code colours.

**Why this priority**: Unblocks phase 2 (app shell) and stops new drift. It has no direct end-user effect yet.

**Independent Test**: The token reference lists every new token with its value, intended use and an example. A sample element styled only with the new tokens (in the documentation's examples) uses no raw colour or hex values.

**Acceptance Scenarios**:

1. **Given** the token reference, **When** a builder needs a status badge, **Then** they find a semantic status token for each of blocking, warning, done, info and neutral, each with a paired icon name and text guidance (never colour alone).
2. **Given** the token reference, **When** a builder needs a product tag, **Then** they find Bendie and Planner accent tokens marked "tags only, never actions".
3. **Given** the token reference, **When** a builder needs motion, **Then** every motion token states its reduced-motion fallback.

---

### User Story 4: Project rules agree with the amended constitution (Priority: P3)

Anyone reading the project's day-to-day rules (code standards, UI rules, UI tokens) finds them consistent with constitution v2.0.0, as listed in its Sync Impact Report: Next.js 15 / React 19, domain modules, Inspector/Sheet patterns, headless primitives, the focus ring and reduced motion.

**Why this priority**: The constitution's governance requires conflicts to be reconciled explicitly, but it doesn't block users.

**Independent Test**: Search the three files for "Next.js 14", "no service layer", "always a FormModal" and the old "second component library" wording. Each is either updated or explicitly reconciled with a pointer to the constitution.

**Acceptance Scenarios**:

1. **Given** context/code-standards.md, **When** read, **Then** it describes Next.js 15 / React 19, the domain-module rule and the pinned-headless-primitives rule.
2. **Given** context/ui-rules.md, **When** read, **Then** it describes Inspector (list records), Sheet (short tasks), FormModal valid until migration, the focus ring and reduced motion.

### Edge Cases

- **Controls that already have their own focus style** (form inputs via the shared input class; the sidebar's focus-expand behaviour): there must be no double ring, and the sidebar's existing keyboard-expand behaviour must keep working.
- **`outline: none` without a replacement** in existing components: the shared focus treatment must still appear for keyboard users.
- **Focus inside dialogs and on dark or coloured surfaces** (primary buttons): the indicator stays visible (offset ring, not just a tint).
- **Reduced motion and essential feedback:** loading indicators may still show progress; only decorative or positional motion is removed.
- **Pages that rely on the hover-expand sidebar timing:** without motion, the expand still waits for hover intent and doesn't flicker.
- **Existing visual appearance:** the new tokens are additive. No existing class or page changes value, except where focus or motion behaviour is intentionally corrected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a corner-radius scale with four named steps (small, medium, large, full), documented with intended uses (chips/inputs, buttons/menus, panels/dialogs, pills/avatars).
- **FR-002**: The system MUST provide four named elevation levels (flat, raised, floating, modal), documented with intended uses.
- **FR-003**: The system MUST provide semantic status tokens for blocking, warning, done, info and neutral. Each MUST define foreground and background treatments meeting contrast requirements, and each MUST be paired with a named icon so status is never communicated by colour alone.
- **FR-004**: The system MUST provide product accent tokens for Bendie and Planner, documented as "for product tags/chips only, never for actions".
- **FR-005**: The system MUST provide density tokens: default row height 44px, compact row height 36px (tables only), and control heights for pointer (36px) and touch (44px) contexts.
- **FR-006**: The system MUST provide motion tokens (fast, base, panel) with documented durations or easing, and each MUST have a defined reduced-motion fallback (an opacity change or no animation).
- **FR-007**: The system MUST provide one shared focus treatment, applied on keyboard focus only, to all interactive controls that don't define their own accessible focus style. It MUST be visible on light, coloured and dialog surfaces.
- **FR-008**: The system MUST honour the user's reduced-motion preference globally: positional, scaling, width and decorative animations are disabled or reduced to brief opacity changes, while state changes stay visible.
- **FR-009**: Introducing the tokens MUST NOT change the appearance of any existing page, apart from the intentional focus and reduced-motion corrections in FR-007 and FR-008.
- **FR-010**: Every new token MUST be documented in the UI token reference with name, value, intended use, an example, and (for motion) its reduced-motion fallback.
- **FR-011**: The code standards and UI rules MUST be reconciled with constitution v2.0.0: stack (Next.js 15 / React 19), domain modules, Inspector/Sheet, headless primitives pinned and recorded, focus ring, reduced motion. Each change cites the constitution.
- **FR-012**: The feature MUST NOT add new runtime dependencies, change any data, or change any page's behaviour or permissions.

### Key Entities

- **Design token:** a named value (radius, elevation, colour role, size, duration) with an intended use and documentation entry.
- **Status:** one of blocking, warning, done, info, neutral, combining a colour treatment, an icon and a text label.
- **Product accent:** the colour identity of Bendie or Planner, used only on tags.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of interactive controls on the 4 audited screens (org Overview, event Dashboard, Agenda, Create event) show a visible keyboard focus indicator, none shows a doubled indicator, and the shared indicator never appears on mouse focus.
- **SC-002**: With reduced motion on, 0 sliding, scaling or width animations occur on the audited screens; all state changes are still perceivable.
- **SC-003**: Screenshot comparison of the existing walk-through screens (docs/bendie-revamp/15) at 1440px shows no visual differences, apart from focus indicators.
- **SC-004**: The browser walk-through for all 3 test roles returns identical access results to the 2026-11-19 baseline (252 visits).
- **SC-005**: 100% of new tokens appear in the token reference with use, example and (for motion) a fallback.
- **SC-006**: Zero references to the superseded rules (Next.js 14, "no service layer", "always FormModal") remain unreconciled in the project rule files.

## Assumptions

- The existing Material-style colour roles, type scale and Plus Jakarta Sans stay unchanged. This feature only adds tokens.
- Values follow docs/bendie-revamp/20: radius 6 / 10 / 14 / full; motion fast 120 ms, base 200 ms, panel ≈ 300 ms critically damped. Final values are confirmed in planning against the current UI.
- "No visual change" is verified on the test environment with synthetic data, using the existing walk-through screenshots as the baseline.
- Migrating existing components to the new radius and status tokens happens later, page by page (docs/bendie-revamp/35), not here.
- Dark mode is out of scope (Studio has none today).
- **Deferred, known issue K1 (developer decision, 2026-11-20):** two existing TopHeader controls keep their own component-owned focus style, which falls below 3:1: the product switcher ring (1.93:1), and the header search, whose `focus:ring` doesn't render. FR-007's shared indicator doesn't override component styles by design, and fixing these belongs to the app-shell feature, which replaces the header (`docs/bendie-revamp/40`, K1). SC-001 is assessed on the controls the shared rule covers.
