# Memory: Bendie Studio 2.0 redesign (Features 029–030 done)

Last updated: 2026-11-23

## What was built

All redesign work lives on branch `redesign` (pushed). Each roadmap phase is its own Spec Kit feature branched from `redesign` and merged back. `main` only receives bug fixes the developer asks for.

- **Discovery and proposals:** `docs/bendie-revamp/` docs 00–41, plus `data/`, `tools/` and `screenshots/`. The brief is `docs/Portal_2.0.md` (local only). These docs are research input, not specs.
- **Constitution v2.0.0** (`.specify/memory/constitution.md`, amended 2026-11-20). It allows domain modules, inspector/sheet panels and a navigation redesign.
- **Feature 029 (design tokens, focus ring, reduced motion):** merged in 304fa5c. Tokens: `rounded-ui-*`, `shadow-elev-*`, `status-*`, `product-*`, `h-row`/`h-control`, `motion-*`. Also a global `:focus-visible` outline, `.focus-ring`, and a reduced-motion rule.
- **Feature 030 (Studio 2.0 app shell):** merged in 9f5971d. Everything is in `specs/030-studio-app-shell/`, including `verification.md` and `evidence/`.
  - **Layout choice:** two layouts. v1 (current) is the default; v2 (new shell) is opt-in per browser via the `studio_shell` cookie (path `/portal`), from the account menu ("Try the new layout") or `?shell=v2|v1`. `src/app/portal/layout.tsx` is now a server component that reads the cookie and renders `src/components/shell/PortalShell.tsx`.
  - **Extracted logic:** `src/lib/useEventWorkspace.ts` is the single place that decides event-section availability, redirects and the journey. Both `EventWorkspaceV1` (the old render, verbatim) and `EventWorkspaceV2` render from it, and share `EventWorkspaceParts` (the content gate, the access screens and Previous/Next).
  - **Header:** `src/components/header/useHeaderModel.ts` and `HeaderParts.tsx` hold the old TopHeader, split into a model and parts reused by both layouts.
  - **v2 UI** in `src/components/shell/`:
    - `AppShell`: top bar, `ShellSidebar` (full width ≥1280, rail 1024–1279, drawer below) and `ShellCanvas`.
    - `OrgSidebar` and `EventSidebar` (6 areas from the new `EVENT_SECTIONS[].area` field, `src/lib/eventAreas.ts`).
    - `ContextStrip` (products, attendee-app visibility, role), `Breadcrumbs`, `RightPanel` (an empty slot) and `ShellToggle`.
  - **Pure logic with tests** in `src/lib/`: `shellLayout`, `eventAreas`, `workspaceContext`, `rightPanel` and `orgNav` (active rules and the v2 breadcrumb trail). There are 105 vitest tests.
  - **K1 (weak focus in the header):** fixed in v2 by a rule scoped to `[data-shell-chrome]` in `globals.css`. v1 is unchanged by design.
  - **Docs:** `context/architecture.md` is reconciled (doc 40 G1 closed). `ui-registry.md` and `progress-tracker.md` are updated.

## Decisions made

- The developer takes my recommended approach on redesign decisions. Bugs found along the way are flagged, not fixed, unless the developer approves; fixes go on a branch from `main`.
- v2 stays opt-in until a later rollout feature. Page content is not rewritten in 030; later phases migrate pages.
- Never decide section availability in a layout or sidebar. Always use `useEventWorkspace()`.
- New shell UI uses only the 029 tokens. The `control` sizes are height-only, so use `aspect-square` for square buttons.
- Spec Kit is authoritative, and the JSM skills support it. The workflow is architect → specify → clarify → plan → tasks → analyze → implement → imprint → review → converge → remember.

## Problems solved

- **No PowerShell on this Mac:** set `.specify/feature.json` by hand and copy the Spec Kit templates.
- **Builds:** run `next build` in a separate git worktree (symlinked `node_modules`, `.env.test.local` copied as `.env.local`). The developer's `next dev` on :3000 must keep running. A `next/font` "reading '1'" error is a Google Fonts network blip: just retry.
- **Walk-through** (`docs/bendie-revamp/tools/walkthrough.py`, with Playwright venv `pw-venv` in the session scratchpad):
  - `STUDIO_SHELL=v1|v2` picks the layout; `WALKTHROUGH_OUT` redirects output.
  - Set the cookie with path `/portal`. A Playwright cookie given by `url` lands on `/` and shadows the app's own cookie.
  - Don't run builds at the same time, or pages time out. Re-visit any timeouts.
  - Compare v1 against a same-day run of the old commit on another port, because the test data drifts.
- **Focus detector:** wait 300 ms after each Tab; count only rings with blur or spread greater than 0; ignore the Next.js dev overlay.

## Current state

- `redesign` is at 9f5971d (pushed). Everything works. Test results:
  - Access walk-through: v1 has 0 differences vs the pre-030 code over 252 visits; v2 ends on the same final pages as v1.
  - Focus in the v2 shell: 6.49:1.
  - 768 and 390 px: OK.
  - Toggle survives a reload.
- The developer has tried v2 in their browser and approved it.
- **Known, flagged, not fixed (pre-existing):** an org admin opening a Planner-only page on a Bendie-only event is sometimes redirected to the Dashboard and sometimes not (a race in the wrong-product redirect).
- Test environment only: Bendie test `baqivpboykobrqlxxoph`, Planner test `xwqhisiwvnhluihcpliz`. Never write to the production projects. Test passwords are in the gitignored `.env.test.local`; never print them.

## Next session starts with

1. `/remember restore`, then read `docs/bendie-revamp/36` (roadmap) to pick the next phase after the app shell. That is Phase 3: data table, inspector, first page migrations into the v2 shell.
2. Create the next Spec Kit feature (031) from `redesign`: run `/architect` first, then specify → … → converge, and merge back into `redesign`.

## Open questions

- Should the org-admin redirect race be fixed now, on a branch from `main`?
- When should v2 become the default, and who decides the rollout? That belongs to a later feature.
- AI/Copilot: the concept must be approved as a working prototype on synthetic data before the legal/DPA and region questions (doc 40).
- Still pending: the Part 19 skills (`bendie-product`, `bendie-data`, `bendie-ai-copilot`).
