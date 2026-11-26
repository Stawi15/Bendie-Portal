# Implementation Plan: Speakers Table and Inspector Pilot

**Branch**: `031-speakers-table-inspector` | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/031-speakers-table-inspector/spec.md`

**Note**: The template was copied by hand; `setup-plan.ps1` needs PowerShell, which isn't on this Mac, and no override, preset or extension layers exist. The architect blueprint was confirmed by the developer on 2026-11-23.

## Summary

Build the reusable Studio 2.0 list-editing pattern and pilot it on Speakers:

- **`src/lib/speakers.ts`:** the single home for speaker reads and writes, plus pure rules (validation, search, filters, sort), each taking the Supabase client as an argument (constitution II). Callers: the v1 Speakers page (only its data calls change), the new v2 page, and Attendees' "Add to speakers".
- **`src/components/data/DataTable`:** a compound, headless table (TanStack Table) with search, filters, sort, open-row, empty, error and loading states, and a stacked-list mode below 768 px.
- **`src/components/form/DirtyGuard`:** the unsaved-changes guard. It intercepts in-app link clicks, Back, programmatic navigation through a guard hook, `beforeunload`, inspector close, row switching and Escape.
- **Inspector:** the 030 `RightPanel` gains a portal-style API that renders live children. It docks at ≥1280 px and is a focus-trapped sheet below. `SpeakerInspector` uses react-hook-form with the shared validator, and the open speaker lives in the URL (`?speaker=<id>|new`).
- **Routing:** `facilitators/page.tsx` becomes a thin switch by layout. `SpeakersPageV1` is today's page, moved verbatim except for the data calls; `SpeakersPageV2` is the new table and inspector.

## Technical Context

**Language/Version**: TypeScript, Next.js 15.5 App Router, React 19, Tailwind 3.4.19 (029 tokens, 030 shell)

**Primary Dependencies**:
- **New:** `@tanstack/react-table` **9.3.1** (pinned exact; published 2026-10-12; peer `react >=18`).
- **Existing:** `react-hook-form` 7.82.0, used for the first time.
- **No zod:** doc 21 assumed it was installed; it isn't (`npm ls zod` is empty). The rules are two field checks, so a shared validator in `speakers.ts` feeds a small react-hook-form resolver instead (research R2).
- **Not yet:** TanStack Virtual and Radix.

**Storage**: Supabase (Bendie). `facilitators`, read-only `agenda_sessions` / `agenda_session_speakers`, and `events.timezone`. **No schema or RLS change.**

**Testing**:
- vitest for `speakers.ts`: validation, search, filters, sort, sessions merge, and insert payloads built with a stub client.
- tsc, lint and a worktree `next build`.
- The Playwright walk-through in v1 (no change) and v2 (same access).
- A Speakers parity and behaviour script (quickstart), plus the focus detector, 390 px checks and reduced motion.

**Target Platform**: Desktop and mobile browsers. v2 shell breakpoints: `shellwide` ≥1280, `shellrail`, `shelldrawer`.

**Project Type**: Single Next.js web app.

**Performance Goals**:
- The table, search, filter and sort respond instantly for hundreds of rows. They run client-side over a list loaded once.
- Opening a speaker makes one small read (sessions plus the event time zone), and only when the inspector opens.
- No extra requests on page load compared with today: one `facilitators` select.

**Constraints**:
- v1 Speakers and Attendees are unchanged (SC-002).
- The rules exist in one place (SC-008).
- Focus contrast is at least 3:1, there's no sideways scrolling at 390 px, and reduced motion is respected.

**Scale/Scope**: About 12 new files (lib, data, form, inspector, page v2), 3 changed callers, 1 new dependency, and 2 doc rule updates.

## Constitution Check

*GATE: before Phase 0, re-checked after Phase 1.* Constitution **v2.0.0**.

| Principle | Check | Result |
|---|---|---|
| I Brownfield | v1 page kept, moved verbatim apart from its data calls; Attendees behaviour identical; parity checklist (doc 16 row 21) | ✅ |
| II Architecture | `speakers.ts` is a domain module with a passed-in client under RLS, created because a second caller exists (Attendees); no service role, no new API routes, no Server Actions | ✅ |
| III DB safety | No schema, RLS or type change | ✅ N/A |
| IV Security | No secrets; the URL holds only a speaker id; no permission change | ✅ |
| V UI consistency | Inspector replaces `FormModal` for this list (approved doc 20; `ui-rules.md` updated here); 029 tokens; one focus ring; reduced motion; status badge with icon + text; one new headless dependency, pinned and recorded | ✅ |
| VI Scope | No bulk actions, reordering, upload, Agenda or permissions | ✅ |
| VII Docs | `ui-rules.md`, `code-standards.md` (dependency, folders `data/` and `form/`), `ui-registry.md` (/imprint), `progress-tracker.md` | ✅ |
| VIII Verification | tsc, lint, build, unit tests, walk-through ×2, parity script, focus, responsive; `/review` | ✅ planned |
| IX Spec Kit + JSM | `/architect` → specify → plan → tasks → analyze → implement → `/imprint` → `/review` → converge | ✅ |

**Gate: PASS.** Post-design re-check: **PASS**. The `RightPanel` API change (research R4) is additive: the 030 registration API keeps working and has no callers yet.

## Project Structure

### Documentation (this feature)

```text
specs/031-speakers-table-inspector/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/list-editing-contract.md
├── checklists/requirements.md
└── tasks.md   (/speckit-tasks)
```

### Source Code (repository root)

```text
src/lib/speakers.ts (+ speakers.test.ts)        # domain module: list/create/update/delete/importRow/addFromAttendee/listSessions
                                                 # + pure rules: validateSpeaker, matchesSearch, applyFilters, sortSpeakers, CSV columns/parser
src/components/data/DataTable.tsx                # compound: Root, Toolbar, Search, Filter, Reset, Body, Empty, Error; list mode <768px
src/components/data/StatusBadge.tsx              # explicit variants (StatusBadge.Done / .Neutral …) with icon + label (029 status tokens)
src/components/form/DirtyGuard.tsx               # DirtyGuardProvider, useDirtyGuard(), useNavigationGuard(): link/popstate/beforeunload interception
src/components/form/resolverFrom.ts              # react-hook-form resolver around a pure validator (no zod)
src/components/shell/RightPanel.tsx              # + <RightPanel.Portal>: live children; docked ≥1280, focus-trapped sheet below
src/components/entities/SpeakerInspector.tsx     # form (10 fields), avatar preview, claim badge, sessions list, save/delete
src/components/speakers/SpeakersPageV1.tsx       # today's page, moved verbatim; data calls → speakers.ts
src/components/speakers/SpeakersPageV2.tsx       # DataTable + SpeakerInspector + ImportButton(CsvImportModal), ?speaker= URL state
src/app/portal/events/[eventId]/facilitators/page.tsx  # thin switch: useShell().shell → V1 | V2
src/app/portal/events/[eventId]/members/page.tsx       # makeFacilitator → speakers.addSpeakerFromAttendee (role update stays here)
src/components/header/useHeaderModel.ts          # goToEvent / handleLogout await useNavigationGuard() (no-op without a guard)
context/ui-rules.md · context/code-standards.md · context/ui-registry.md · context/progress-tracker.md
```

**Structure Decision**: The new folders `data/`, `form/` and `entities/` follow doc 21's approved split (recorded in `code-standards.md` here). Page-specific components live in `src/components/speakers/`. The route file stays a thin switch, as in 030.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| `DirtyGuard` intercepts link clicks in the capture phase and re-pushes history on a guarded Back | The App Router has no navigation-blocking API, and FR-013 requires asking before every way of leaving | Guarding only the inspector's own buttons would let sidebar links and Back silently drop typed work (doc 13 #4) |
| `useHeaderModel` gains a guard call in `goToEvent` / `handleLogout` | Those two leave the page by code, not by a link | Leaving them unguarded breaks FR-013; the call is a no-op where no guard exists, so v1 behaviour is identical |
