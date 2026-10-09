---

description: "Task list for Feature 018 — Planner Agenda Authoring"
---

# Tasks: Planner Agenda Authoring

**Input**: specs/018-planner-agenda-authoring/ (spec.md, plan.md, contracts/)
**Tests**: none requested; manual validation + type-check/lint/isolated build.

## Phase 1: Foundational

- [X] T001 Create src/lib/plannerAgenda.ts (`import 'server-only'`): `AgendaItem` mapping, `validateAgendaInput` (title required ≤ 300; date YYYY-MM-DD; times HH:MM; end after start; dayNumber int ≥ 1; text fields ≤ 2000; unknown fields rejected), `listAgendaItems(plannerEventId)`, `createAgendaItem(plannerEventId, input, portalEventStartDate)` (plan D3–D5), `updateAgendaItem` (merge + re-validate times, set `updated_at`, refuse pushed rows), `deleteAgendaItem` (refuse pushed rows); every query filtered by `event_id = plannerEventId`.
- [X] T002 Create the Production-shaped capability helper for the routes inside the same lib: given `resolvePlannerEventAccess` ready-state, return Production's capability (plan D1).

## Phase 2: User Story 1 — Build the agenda (P1) 🎯 MVP

- [X] T003 [US1] Create src/app/api/events/[eventId]/planner-agenda/route.ts (GET, POST) per contracts/planner-agenda.md; the Portal event's `starts_at` read server-side for D4.
- [X] T004 [US1] Create src/app/api/events/[eventId]/planner-agenda/[itemId]/route.ts (PATCH, DELETE) per the contract (404 cross-event, 409 pushed).
- [X] T005 [P] [US1] Create src/components/portal/PlannerAgendaModal.tsx (FormModal: date, start, end, title required fields; "More details" for subtitle, speakers, MC, room, track, type, day label, day number, description, notes; field errors).
- [X] T006 [P] [US1] Create src/components/portal/PlannerAgendaList.tsx (grouped by date with day label, time · title · speakers/MC · room; row actions Edit/Delete only when canManage and not readOnly; pushed rows show "From the Bendie Agenda — edit it there"; empty state with Add + Import).
- [X] T007 [US1] Create src/app/portal/events/[eventId]/planner-agenda/page.tsx (loading / denied / configuring / loaded states as planner-production/page.tsx; create/edit/delete with confirm; header actions when items exist).
- [X] T008 [US1] Register the section: `planner-agenda` in src/lib/eventSectionMeta.ts (label "Agenda", Planner group "Production") and src/lib/eventModules.ts (`alwaysIncluded: true`, plan D6); in src/app/portal/events/[eventId]/layout.tsx gate it exactly like `planner-production` (visibility, pending and configuring states) using the existing Production capability state.

## Phase 3: User Story 2 — Spreadsheet import (P2)

- [X] T009 [US2] In the page, add "Import spreadsheet" (`CsvImportModal`) with columns date, start_time, end_time, title, subtitle, speakers, mc, room, track, type, day_label, day_number, description, notes; client-side row validation mirroring T001; each row POSTs to the collection route.

## Phase 4: User Story 3 — Pushed items read-only (P3)

- [ ] T010 [US3] (Data side verified 2026-10-09: event 53 has 7 pushed rows; the 409 path is code-only — confirm in the browser.) Verify against Planner event 53 (pushed items): GET marks them `readOnly`, list shows the label and no actions, PATCH/DELETE return 409.

## Phase 5: Polish

- [X] T011 type-check, lint (baseline 28 warnings), build in an isolated copy (never the live `.next`).
- [X] T012 Live check against Planner event 61 ("test", Xperia): create → edit → delete an item through the lib path and confirm in `event_agenda_items`; leave no test rows behind.
- [ ] T013 (docs + commit done 2026-10-09; `/review` pending) Update context/progress-tracker.md and context/schema-reference.md (Planner `event_agenda_items` now Portal-authored); `/review`; commit.
