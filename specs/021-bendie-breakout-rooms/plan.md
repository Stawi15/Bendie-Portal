# Implementation Plan: Bendie Breakout Rooms

**Branch**: `021-bendie-breakout-rooms` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-bendie-breakout-rooms/spec.md`

## Summary

Move breakout rooms from the `agenda_sessions.breakout_rooms` JSON into three durable tables: rooms, room mini-agenda blocks, and attendee assignments. Add a per-session `breakout_mode`. The database keeps `breakout_rooms` derived from the tables so the released attendee app keeps working.

Three database functions carry the rules:
- an atomic room save for the editor and CSV
- a race-safe attendee room choice with mode and capacity rules
- a counts-only availability read

Owners/admins of the event's organisation can now edit agenda sessions (FR-033), through new row-level-security policies and one helper, `is_event_org_admin`.

In the Portal (agenda tab only), the existing room panel is extracted into an editor with a Speaker picker, capacity, location and mode. A new assignments modal shows headcounts and lists and lets organisers assign, move and unassign. Two CSV uploads go through small optional extensions to the existing `CsvImportModal`, plus an assignments download. Planner and the Planner push are untouched.

> **Update 2026-10-14 (developer request: make it as easy as possible):** spreadsheets were simplified.
> - Breakouts now go in the existing agenda spreadsheet: a `breakout_room` column, one row per room. Re-uploads update matching sessions instead of duplicating them.
> - Room assignments are a per-breakout people list (Download list / Upload list) inside Manage people.
> - The separate rooms and assignments uploads described in R9/R10/R11 and the structure below were dropped.
> - See spec FR-019–FR-026 and [contracts/csv-formats.md](contracts/csv-formats.md).

## Technical Context

**Language/Version**: TypeScript 5, Next.js 14 App Router, React 18; SQL (PostgreSQL 15 via Supabase).

**Primary Dependencies**:
- `@supabase/supabase-js`, using the shared browser client (no service role needed)
- PapaParse, via `src/lib/csvImport.ts`
- existing portal components: `SectionHeader`, `FormModal`, `CsvImportModal`, `useConfirm`, toast

**Storage**: the shared Bendie Supabase database (also the live attendee app's backend). One new migration in `supabase/migrations/`.

**Testing**: the repo has no automated test suite. Verification is `npm run lint`, `npm run type-check` and `npm run build`, plus the scenarios in [quickstart.md](quickstart.md) and SQL checks against the live database (pre-flight and post-flight, the race test, Supabase advisors).

**Target Platform**: Portal web app (desktop-first, responsive); the attendee app (Release 2, separate repo).

**Project Type**: web application (single Next.js project) plus database functions.

**Performance Goals**:
- The assignments view loads one breakout (≤ ~20 rooms, ≤ ~500 attendees) in one round of queries.
- A 300-row assignments upload completes in under 3 minutes (SC-003); the per-row import runs 5 at a time.

**Constraints**:
- **Additive migration only.** The released app's read path (`agenda_sessions_summary.breakout_rooms`) must stay correct.
- **Capacity is enforced in the database** for attendee picks.
- **No service-role usage.**
- **Constitution Principles II, III and V.**

**Scale/Scope**: today 3 breakout sessions with 5 rooms, and 326 attendee memberships across all events.

**Live-state verification**: done 2026-10-13. See research L1–L14.

## Constitution Check

*GATE: checked before Phase 0 and again after Phase 1 design. Result: **PASS**. Both earlier flags were resolved by the developer on 2026-10-13.*

| Principle | Check | Result |
|---|---|---|
| I. Brownfield Preservation | Reuses the existing agenda tab, room panel (extracted), `CsvImportModal`, CSV helpers, RLS helper functions and `log_content_change()`. The released app's JSON keeps working (R4). Planner push unchanged. | Pass |
| II. Architecture Boundaries | Data calls stay in the page and components through the shared browser client. Database functions follow the `create_event_with_products` precedent. No API route, Server Action or service layer. No new nav section. | Pass |
| III. Supabase & DB Safety | One descriptively named migration with a "why" header. RLS defined for all three tables, following the `agenda_session_speakers` precedent (L2). `src/types/database.ts` updated by hand. Live state verified (L1–L11). | Pass |
| II/IV. Authorization tiers | The organisation-admin tier for FR-033 is resolved from the record (`events.organization_id` inside `is_event_org_admin`), never from a client-selected organisation, and it is scoped to that organisation's events only. No escalation. | Pass |
| IV. Security | No service role. Every `SECURITY DEFINER` function has a fixed `search_path`, checks `auth.uid()` and membership itself, and has EXECUTE revoked from `public`/`anon`. Attendees can't read other attendees' assignments. | Pass |
| V. UI Consistency | Existing components and tokens. The new assignments modal is a reusable pattern, so run `/imprint` after implementation. Hardcoded hex values in the extracted panel (e.g. `border-[#E4EAF0]`) are normalised to tokens only where touched. | Pass |
| VI. Scope Discipline | The `CsvImportModal` extension is needed by the spec and is optional and backwards-compatible. Session editing for organisation admins (FR-033) was added to scope explicitly by the developer. The agenda CSV duplicating on re-upload stays **flagged, not fixed**. | Pass |
| VII. Documentation | Update `context/schema-reference.md` (agenda section), `context/progress-tracker.md` and `context/architecture.md`, and note the migration for the app team (R14). | Pass |
| VIII. Verification | Lint, type-check and build; quickstart scenarios; loading, error and empty states in the new modal and editor. `/review` before completion. | Pass |
| IX. Spec Kit + JSM | This plan is the single plan; `/architect` output was folded in. | Pass |

**Developer decisions (2026-10-13)**

1. **Session editing is extended to organisation admins (FR-033).** Owners/admins of the event's organisation can now create, edit and delete agenda sessions, and so use the room editor. Event hosts and organisers keep their current session rights and manage rooms and assignments through the new tables (R1).
2. **Feature 020 is committed** (`3aca993`), so `CsvImportModal` has a clean base.

## Project Structure

### Documentation (this feature)

```text
specs/021-bendie-breakout-rooms/
├── spec.md
├── plan.md              # this file
├── research.md          # live-state findings L1–L14, decisions R1–R14
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── database-functions.md
│   ├── csv-formats.md
│   └── attendee-app-release-2.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/migrations/
└── bendie_breakout_rooms_and_assignments.sql   # NEW: org-admin helper + agenda_sessions org-admin policies,
                                                 #      tables, mode column, RLS, triggers, functions, backfill

src/types/database.ts                            # EDIT: new row types, breakout_mode, choose result union

src/lib/
├── breakoutRooms.ts                             # NEW: pure helpers: types, editor⇄RPC mapping, CSV column specs,
│                                                #      row parsers and matchers, download row builder
└── csvImport.ts                                 # unchanged (buildCsvTemplate reused for the download)

src/components/portal/
├── CsvImportModal.tsx                           # EDIT: optional refineResults / previewWarnings / importAll
├── BreakoutRoomsEditor.tsx                      # NEW: extracted from agenda page's BreakoutRoomsPanel, plus
│                                                #      Speaker picker, capacity, location, mode, delete warning
└── BreakoutAssignmentsModal.tsx                 # NEW: headcounts, room lists, unassigned list, assign/move/unassign

src/app/portal/events/[eventId]/agenda/page.tsx  # EDIT: load rooms from tables; save via save_breakout_rooms after
                                                 #       the session save; stop writing breakout_rooms; "Manage people"
                                                 #       per breakout; rooms/assignments upload buttons; download

context/schema-reference.md, context/progress-tracker.md, context/architecture.md   # EDIT (Principle VII)
```

**Structure Decision**: the single existing Next.js project. All UI stays inside the agenda tab section (`app/portal/events/[eventId]/agenda`). The new components live in `src/components/portal/` next to the existing modals, and the pure logic lives in `src/lib/`.

## Implementation phases

Tasks will expand on these; the order is by dependency.

1. **Database (US1, US4 foundation).**
   - Write the migration: mode column, three tables, constraints, RLS, triggers, the derived-JSON function, the three callable functions, and the backfill. See [data-model.md](data-model.md) and [contracts/database-functions.md](contracts/database-functions.md).
   - Run the pre-flight snapshot, apply the migration, then the post-flight comparison and advisors (quickstart §1).
   - Update `src/types/database.ts`.
2. **Room editor (US1).**
   - Create `breakoutRooms.ts` mapping helpers.
   - Extract `BreakoutRoomsEditor` and extend it.
   - Load the agenda page's rooms from the tables, and save them through `save_breakout_rooms` after the session save, with the delete-with-people warning.
   - Remove `breakout_rooms` from the session payload.
3. **Assignments modal (US2).**
   - Build `BreakoutAssignmentsModal`, with the attendee list from `event_members` joined to `profiles`, plus loading, error and empty states.
   - Open it from the session list.
4. **CSV (US3).**
   - Add the optional `CsvImportModal` props.
   - Add the rooms and assignments column specs and parsers in `breakoutRooms.ts`.
   - Wire the two uploads and the download into the agenda page.
5. **Attendee rule verification (US4).** Run the quickstart §5 checks, including the race test.
6. **Wrap-up.**
   - Docs (Principle VII) and the app-team migration note.
   - Lint, type-check and build.
   - `/imprint` for the assignments modal, then `/review`, `/speckit-converge` and `/remember save`.
7. **Release 2 (Evently-App, separate).** Hand over [contracts/attendee-app-release-2.md](contracts/attendee-app-release-2.md).

## Complexity Tracking

No constitution violations. Two choices to note:

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| Derived JSON maintained by triggers (R4) | The released app only reads `breakout_rooms` (L7) | Having the Portal write the JSON drifts as soon as CSV or another client changes rooms |
| `SECURITY DEFINER` for `choose_breakout_room` | Attendees must not write assignments directly, but must be able to pick within the rules | Letting attendees write the table directly can't enforce capacity race-safely or stop source spoofing |
