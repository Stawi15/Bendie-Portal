# Implementation Plan: Planner Agenda Authoring

**Branch**: `018-planner-agenda-authoring` (work on `developement`) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

A new Planner workspace section, **Agenda** (`planner-agenda`), authors the linked Planner event's
`event_agenda_items` from the Portal, following the Production tab (Feature 014) pattern exactly:
server routes using the Planner service client after the shared Planner access check, a
`server-only` lib for the table, and a page + list + modal + spreadsheet import built from existing
components. Permission is Production's capability. Pushed Bendie Agenda rows are read-only. No
schema change in either database.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 14 App Router, React 18
**Primary Dependencies**: `@supabase/supabase-js` (Planner admin client via `getPlannerAdminClient`)
**Storage**: Planner Supabase project, table `event_agenda_items` (verified live 2026-10-09:
`agenda_item_id` identity; `event_id` int FK; `item_title` NOT NULL; `sort_order` int NOT NULL
default 0; `is_parallel` bool NOT NULL default false; naive `timestamp` `start_at`/`end_at`;
`time` `start_time`/`end_time`; CHECK `start_at < end_at` when both set; UNIQUE
`(event_id, source_portal_session_id)`; no triggers; `updated_at` default now(), not auto-updated)
**Testing**: no suite; type-check, lint, isolated build, quickstart
**Project Type**: single Next.js web app
**Constraints**: service keys server-only; per-request authorization; never write rows with
`source_portal_session_id IS NOT NULL` (pushed); scope every query by the resolved Planner event id
**Scale/Scope**: 1 lib, 2 routes, 1 page, 2 components, registry edits in 3 files

## Constitution Check (v1.1.1) — pass, re-checked after design

| Principle | How |
| --- | --- |
| I Brownfield | Mirrors Feature 014 file-for-file; reuses `resolvePlannerEventAccess`, `resolveProductionCapability`, `getPlannerAdminClient`, `FormModal`, `CsvImportModal`, `SectionHeader`, `EmptyState`-style empty state |
| II Boundaries | Org-scoped privileged routes under `app/api/events/[eventId]/planner-agenda/**`; authorization = Planner access check + `canAdministerPlannerPermissions` for writes |
| III DB safety | No schema change; live table verified; no migration |
| IV Security | Planner service client only server-side; cross-event ids → 404 |
| V UI | Existing modal/list/import patterns and Planner accent |
| VI Scope | Production, push and Bendie Agenda untouched |
| VII Docs | progress-tracker + schema notes at the end |
| VIII Quality | loading/error/empty states; type-check/lint/build |

## Design

### Decisions

- **D1 Permission**: capability = Production's (`canAdministerPlannerPermissions` → view+manage;
  else Planner identity + `can_view_production` → view only; else none).
- **D2 Pushed rows**: rows with `source_portal_session_id` set are returned with `readOnly: true`;
  PATCH/DELETE on them → 409 `pushed_item_read_only`.
- **D3 Times**: form gives `date` (YYYY-MM-DD) and optional `startTime`/`endTime` (HH:MM). Stored as
  `agenda_date`, `start_time`/`end_time` (`HH:MM:00`) and naive `start_at`/`end_at`
  (`YYYY-MM-DDTHH:MM:00`), matching Planner-native rows.
- **D4 Day number**: if blank, `agenda_date − Portal events.starts_at::date + 1` when the event has a
  start date (≥ 1), else null. Never renumbers other rows.
- **D5 Sort order**: if blank on create, `max(sort_order) + 1` within the same date (NOT NULL column).
- **D6 Navigation**: `alwaysIncluded: true` so events whose Planner modules were configured before
  this feature still show it; layout gates it with the Production capability state.
- **D7 `updated_at`**: set explicitly on update (no trigger).

### Files

- `src/lib/plannerAgenda.ts` (server-only): `AgendaItem` type, `listAgendaItems`,
  `createAgendaItem`, `updateAgendaItem`, `deleteAgendaItem`, `validateAgendaInput`.
- `src/app/api/events/[eventId]/planner-agenda/route.ts` — GET (capability + items or phase),
  POST (manage). Contract: [contracts/planner-agenda.md](contracts/planner-agenda.md).
- `src/app/api/events/[eventId]/planner-agenda/[itemId]/route.ts` — PATCH, DELETE (manage).
- `src/app/portal/events/[eventId]/planner-agenda/page.tsx` — state machine like Production's page.
- `src/components/portal/PlannerAgendaList.tsx`, `PlannerAgendaModal.tsx`.
- Registry: `src/lib/eventSectionMeta.ts`, `src/lib/eventModules.ts`,
  `src/app/portal/events/[eventId]/layout.tsx` (gate + pending/configuring states as Production).
