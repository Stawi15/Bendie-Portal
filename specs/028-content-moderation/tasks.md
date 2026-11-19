# Tasks: Content Moderation

## Phase 1: Foundation
- [X] T001 Extract `deactivatePlannerOnRemoval` to `src/lib/plannerRemoval.ts`; `deactivate-on-removal/route.ts` uses it, with behaviour unchanged (FR-006).
- [X] T002 `src/lib/moderation.ts`: `listReports`, `loadReportDetail`, `applyModerationAction`, plus the reviewer-field fallback (FR-002–FR-007).

## Phase 2: US1 + US2, moderation
- [X] T003 [US1] `src/app/api/admin/moderation/route.ts` (GET list) and `[reportId]/route.ts` (GET detail, POST action) behind `requirePlatformAdmin` (FR-001).
- [X] T004 [US1] [US2] `src/app/portal/admin/moderation/page.tsx`: tabs, list, detail, actions, confirmations, states (FR-003, FR-004, FR-005).
- [X] T005 [US1] Add a Moderation link in `src/components/portal/TopHeader.tsx` (FR-009).

## Phase 3: US3, Gallery
- [X] T006 [US3] `src/app/api/events/[eventId]/gallery/route.ts` (GET) and `[postId]/route.ts` (PATCH, DELETE) (FR-008).
- [X] T007 [US3] `src/app/portal/events/[eventId]/gallery/page.tsx` uses the routes.

## Phase 4: Verification
- [X] T008 `tsc`, lint, `npm test`, placeholder-env build.
- [X] T009 Live read-only check: the detail queries return content for all 4 pending reports.
- [X] T010 Docs: `context/architecture.md`, `context/progress-tracker.md`, `context/schema-reference.md`; write the backend request for the reviewer columns.
- [ ] T011 Browser pass (developer).
- [ ] T012 `/review`, then converge.

## Verification note

**2026-11-19:** `tsc` exits 0, lint adds no warnings (the 2 Gallery warnings already existed), `npm test` 68/68, and the placeholder-env build passes (4 new routes plus the page).

Live read-only check: all 4 pending reports' targets exist (2 posts, 2 profiles; no comments). The removal candidates are in 12, 2, 4 and 4 events, and no target has a second report. `event_members → events` has a single FK, so the embed isn't ambiguous.

Behaviour notes:
- **Gallery:** a non-Stawi organiser who clicks Hide or Delete now sees "Only Stawi admins can hide or delete attendees' photos." Before, the action silently did nothing, because RLS allowed only Stawi admins and authors.
- **Old delete steps removed:** the browser's likes/comments pre-delete is gone; the foreign keys cascade.

Still open: T011, T012.
