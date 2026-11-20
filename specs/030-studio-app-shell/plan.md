# Implementation Plan: Studio 2.0 App Shell

**Branch**: `030-studio-app-shell` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/030-studio-app-shell/spec.md`

**Note**: The template was copied by hand; `setup-plan.ps1` needs PowerShell, which isn't on this Mac, and no override, preset or extension layers exist. The architect blueprint was confirmed by the developer on 2026-11-20.

## Summary

Add a second, opt-in layout ("v2") around the existing pages:
- **Event layout:** extract the logic half of `src/app/portal/events/[eventId]/layout.tsx` (lines ~118–775: access, product availability, Planner capabilities, `isSectionAvailable`, redirects, journey, Manage modules) into `useEventWorkspace()` **without behaviour change**, then render it through either the existing JSX (v1, moved verbatim into `EventWorkspaceV1`) or the new sidebar layout (`EventWorkspaceV2`).
- **Org layout:** `portal/layout.tsx` switches between today's `OrgSideNav` + `TopHeader` (v1) and a new `AppShell` (v2).
- **Header pieces:** the reusable parts of `TopHeader` (org switcher, product switcher, event search, activity bell, account menu, New event) are extracted as named components that both layouts render, so behaviour isn't duplicated.
- **Layout choice:** a per-browser cookie, read on the server so there's no layout flash, with a `?shell=` override.

New components use the 029 tokens. K1 is fixed in v2. `context/architecture.md` is reconciled.

## Technical Context

**Language/Version**: TypeScript, Next.js 15.5 App Router, React 19, Tailwind 3.4.19 (029 tokens)

**Primary Dependencies**: Existing only. **No new dependencies** (Radix etc. are allowed by constitution v2.0.0, but not needed: drawer focus handling is small and hand-built, research R6).

**Storage**: One browser cookie `studio_shell` = `v1|v2` (not a database). No migration.

**Testing**: tsc, lint, vitest (+ new pure-logic tests: area mapping covers all 32 sections; visibility sentence; role label; shell resolution; panel state reducer); `next build` in a separate worktree; Playwright walk-through in **both** layouts (`tools/walkthrough.py` gains a `STUDIO_SHELL` setting); focus/contrast check (029 detector, corrected) on v2; screenshots at 1440/1024/768/390.

**Target Platform**: Desktop and mobile browsers; `desk` breakpoint behaviour preserved in v1.

**Project Type**: Single Next.js web app.

**Performance Goals**: v2 adds **no extra network requests** per event navigation beyond today, except one cached read of the user's own organisation role (research R4). The sidebar renders from the same state the v1 layout already computes.

**Constraints**:
- v1 must be pixel-identical to today (SC-004).
- The access walk-through must be identical in both layouts (SC-003).
- No section without a place (FR-008).
- WCAG 2.2 AA focus in v2 (FR-018).

**Scale/Scope**: About 12 new or extracted UI files, 2 layouts switched, `eventSectionMeta.ts` gains an `area` field, 1 docs reconciliation.

## Constitution Check

*GATE: before Phase 0, re-checked after Phase 1.* Constitution **v2.0.0**.

| Principle | Check | Result |
|---|---|---|
| I Brownfield | v1 kept as the default and unchanged; v2 is additive behind a flag; extraction keeps behaviour identical (verified by the walk-through) | ✅ |
| II Architecture | Routes unchanged (every `/portal/events/[eventId]/<section>` kept); new navigation structure **approved** in docs 17/18 and allowed by v2.0.0 II; availability decided "in one place" (`useEventWorkspace`), never re-implemented; no new privileged routes; the organisation role read uses the browser client under RLS (own row) | ✅ |
| III DB safety | No schema change; `src/types/database.ts` untouched | ✅ N/A |
| IV Security | No secrets; the cookie holds only `v1`/`v2`; no admission change (middleware untouched) | ✅ |
| V UI consistency | Tokens (029); `.focus-ring` / global focus; reduced motion; status/product never colour-only (product chips carry text); Material Symbols only; `/imprint` for the new shell patterns | ✅ |
| VI Scope | No page rewrites, merges, palette, inspector content or rollout | ✅ |
| VII Docs | `architecture.md` reconciled (G1), plus `ui-registry` (via `/imprint`), `progress-tracker` | ✅ |
| VIII Verification | tsc, lint, build, tests, walk-through ×2, focus, responsive; `/review` | ✅ planned |
| IX Spec Kit + JSM | `/architect` done → spec → plan → tasks → analyze → implement → `/imprint` → `/review` → converge | ✅ |

**Gate: PASS.** Post-design re-check: **PASS**. The `TopHeader` extraction is a refactor *for reuse by a second caller* (constitution II's "second caller" rule, applied to UI). `EventWorkspaceV1` is the existing JSX moved verbatim, so it isn't a rewrite.

## Project Structure

### Documentation (this feature)

```text
specs/030-studio-app-shell/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/shell-contract.md
├── checklists/requirements.md
└── tasks.md   (/speckit-tasks)
```

### Source Code (repository root)

```text
src/app/portal/layout.tsx                    # becomes a SERVER component: reads `studio_shell` cookie → <PortalShell initialShell>
src/components/shell/PortalShell.tsx         # (client) today's providers + v1/v2 switch (moved from layout.tsx)
src/components/shell/AppShell.tsx            # v2 frame: sidebar | global top bar (search, bell, New event, account menu) | canvas (toolbar slot, breadcrumbs) | right panel slot
src/components/shell/EventContentGate.tsx    # content gate shared by V1 and V2 (identical markup)
src/components/shell/OrgSidebar.tsx          # v2 org destinations + footer
src/components/shell/EventSidebar.tsx        # v2 6 areas × sections + footer utilities
src/components/shell/ContextStrip.tsx        # org › event, product chips, visibility line, role
src/components/shell/Breadcrumbs.tsx
src/components/shell/RightPanel.tsx          # slot + RightPanelProvider (open/close, focus return); no trigger
src/components/shell/ShellToggle.tsx         # "Try the new layout" / "Back to the current layout" (account menu)
src/components/header/{OrgSwitcher,ProductSwitcher,EventSearch,ActivityBell,AccountMenu,NewEventButton}.tsx
                                             # extracted from TopHeader.tsx (behaviour unchanged); TopHeader composes them
src/app/portal/events/[eventId]/layout.tsx   # thin: useEventWorkspace() → EventWorkspaceV1 | EventWorkspaceV2
src/lib/useEventWorkspace.ts                 # logic moved verbatim from the layout (state, effects, redirects, journey)
src/components/shell/EventWorkspaceV1.tsx    # today's JSX, moved verbatim
src/components/shell/EventWorkspaceV2.tsx    # new layout using EventSidebar + ContextStrip + page area + Prev/Next
src/lib/shellLayout.ts (+ .test.ts)          # resolveShell(cookie, query), cookie name/values
src/lib/eventAreas.ts (+ .test.ts)           # AREA order/labels; area per section (all 32 covered)
src/lib/workspaceContext.ts (+ .test.ts)     # visibilitySentence(status), roleLabel(...)
src/lib/eventSectionMeta.ts                  # + `area` field (display only)
src/lib/useWorkspaceRole.ts                  # org role (own membership row, cached) + existing getUserEventRole
context/architecture.md                      # reconciled (G1)
docs/bendie-revamp/tools/walkthrough.py      # + STUDIO_SHELL env to run in v1 or v2
```

**Structure Decision**: New shell UI lives in `src/components/shell/` (the folder split approved in doc 21). The header pieces go in `src/components/header/`. Pure logic goes in `src/lib/` with vitest tests. Pages under `app/portal/**` aren't touched.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| `portal/layout.tsx` becomes a server component wrapping a client `PortalShell` | Read the layout cookie on the server so v2 users don't see a v1 flash on every load | A `localStorage` read happens after hydration and causes a visible layout swap on every navigation reload |
