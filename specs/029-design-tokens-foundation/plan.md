# Implementation Plan: Design Tokens, Focus Ring and Reduced-Motion Foundation

**Branch**: `029-design-tokens-foundation` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/029-design-tokens-foundation/spec.md`

**Note**: `setup-plan.ps1` couldn't run (no PowerShell on this Mac; known gap). The template was copied by hand from `.specify/templates/plan-template.md`, which is the only resolution layer present: no overrides, presets or extensions.

## Summary

Add the missing design tokens (radius, elevation, status, product accent, density, motion) as **new, namespaced** keys under `theme.extend` in `tailwind.config.js`, so no existing class changes value. Add a global keyboard-only focus indicator and a global reduced-motion rule in `src/globals.css`. Document every token in `context/ui-tokens.md`, and reconcile `context/ui-rules.md` and `context/code-standards.md` with constitution v2.0.0.

Verification: screenshot comparison against the 2026-11-19 walk-through baseline, a keyboard focus check, a reduced-motion check, and the access-matrix walk-through. No page is migrated to the new tokens in this feature.

## Technical Context

**Language/Version**: TypeScript, Next.js 15.5 (App Router), React 19, CSS via Tailwind CSS 3.4.19

**Primary Dependencies**: Tailwind CSS (existing). **No new dependencies** (FR-012).

**Storage**: N/A (no data changes)

**Testing**: `tsc --noEmit`, `next lint`, `vitest` (79 existing tests), `next build`; Playwright walk-through and screenshot comparison on the **test environment** (docs/bendie-revamp/15, `tools/walkthrough.py`); keyboard and reduced-motion checks via Playwright (`emulateMedia({ reducedMotion: 'reduce' })`, Tab navigation)

**Target Platform**: Desktop and mobile browsers (Chromium, Safari, Firefox); hover-capable `desk` breakpoint behaviour preserved

**Project Type**: Web application (single Next.js app)

**Performance Goals**: No measurable change. The CSS added is small (a few utilities; Tailwind purges unused tokens).

**Constraints**: Zero visual change except focus indicators and reduced-motion behaviour (FR-009); WCAG 2.2 AA contrast for every status/product pair and for the focus indicator

**Scale/Scope**: 2 config/CSS files, 3 documentation files. Token values are documented in [data-model.md](data-model.md).

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.* Constitution **v2.0.0**.

| Principle | Check | Result |
|---|---|---|
| I. Brownfield preservation | Additive tokens; namespaced names avoid changing Tailwind's built-in `rounded-sm/md/lg` (used 121+ times) | ✅ |
| II. Architecture boundaries | No data access, routes, auth or service changes | ✅ N/A |
| III. Supabase/DB safety | No migration, no schema | ✅ N/A |
| IV. Security | No secrets, no env vars | ✅ N/A |
| V. UI consistency | Implements the v2.0.0 requirements directly: a single focus-ring utility, reduced-motion support, token-only styling, status never colour-only (status tokens paired with icons) | ✅ This is the purpose of the feature |
| VI. Scope discipline | Page migration, shell and inspector explicitly out of scope; two `outline-none` cases reviewed and left as is (see research R4) | ✅ |
| VII. Documentation | `ui-tokens.md`, `ui-rules.md`, `code-standards.md` updated (the Sync Impact Report follow-ups); `progress-tracker.md` updated at the end | ✅ |
| VIII. Verification | tsc, lint, build, tests + walk-through + screenshot diff; `/review` before done | ✅ planned |
| IX. Spec Kit + JSM | spec → plan → tasks → analyze → implement → `/imprint` (new tokens) → `/review` → converge | ✅ |

**Gate: PASS.** No violations, so Complexity Tracking stays empty.

Post-design re-check (after Phase 1): still **PASS**. The design adds keys only; the global focus rule uses `:where()` (zero specificity), so any component's own focus styling still wins, which prevents double rings (research R2).

## Project Structure

### Documentation (this feature)

```text
specs/029-design-tokens-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Token catalogue (names, values, uses)
├── quickstart.md        # Validation guide
├── contracts/
│   └── ui-tokens-contract.md   # Class names and behaviours other features may rely on
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
tailwind.config.js            # + borderRadius ui-*, boxShadow elev-*, colors status-*/product-*,
                              #   height/minHeight row*/control*, transitionDuration/TimingFunction motion-*
src/globals.css               # + :focus-visible base rule (:where, zero specificity), .focus-ring utility,
                              #   @media (prefers-reduced-motion: reduce) global rule
context/ui-tokens.md          # + "Studio 2.0 tokens" section
context/ui-rules.md           # reconciled with constitution v2.0.0
context/code-standards.md     # reconciled with constitution v2.0.0
context/progress-tracker.md   # feature entry
```

**Structure Decision**: Single Next.js app. All changes are in the two existing style sources and the three rule documents. No components are touched (research R4 found no missing focus replacement that needs a code change).

## Complexity Tracking

None.
