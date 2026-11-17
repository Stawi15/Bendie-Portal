# Implementation Plan: Event Time Zone

**Branch**: `024-event-timezone` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

## Summary

Every Bendie event gets an IANA time zone. It's required and pre-filled on the create form, and editable on the basics page. Dates entered on those two screens are venue time in that zone. The zone is copied to the Planner event at provisioning, and Planner start/end dates are then computed in the zone, which fixes a latent off-by-one. Planner agenda day numbers use the event's zone. The feedback-link hint explains the new wrap-up push.

There's no migration. The column, its grant and its check already exist live per the Bendie brief; they must be confirmed by research R9 before merge.

## Technical Context

**Language/Version**: TypeScript 5.3, React 18, Next.js 14 App Router

**Primary Dependencies**: none new. `Intl` for zones; `vitest` (from Feature 023) for tests.

**Storage**: `public.events.timezone` (Bendie) and `public.events.timezone` (Planner). Both already exist.

**Testing**: `npm test` (new `src/lib/eventTimeZone.test.ts`), type-check, lint, build, and a browser pass per [quickstart.md](quickstart.md)

**Constraints**:
- No RPC or migration change.
- The grant must be verified before `EVENTS_SELECT_COLUMNS` changes ship.
- Behaviour for events with no zone stays as today.

**Scale/Scope**: 1 new lib file plus tests. Edits to `CreateEventModal.tsx`, `api/events/create/route.ts`, `basics/page.tsx`, `terminology/page.tsx`, `lib/plannerEventProvisioning.ts`, `lib/plannerAgenda.ts`, `lib/eventColumns.ts` and `types/database.ts`.

## Constitution Check

| Principle | Result | Notes |
|---|---|---|
| I. Brownfield | PASS | Follows the existing post-RPC caller-write pattern (R1) and the datalist pattern (R3). Events with no zone behave exactly as today. |
| II. Architecture | PASS | Page-owned Supabase calls. The privileged Planner write stays in the existing server-only provisioning path. No new route. |
| III. DB safety | PASS (gated) | No migration. `types/database.ts` is updated by hand. Live grant and constraint verification is **required before merge** (R9), because the column-list change can break every events read. |
| IV. Security | PASS | `timezone` is never added to an anon query. There are no new secrets. Every Planner write stays service-role and server-side. |
| V. UI | PASS | `.input`/`.label`/`.hint` and the token-styled notice. No raw colours. |
| VI. Scope | PASS | Edit-time Planner sync, other date displays and the back-fill are out of scope. FR-010 is narrowed to a log, recorded in the spec. |
| VII. Docs | PASS (planned) | `schema-reference.md` changelog, `progress-tracker.md`, `architecture.md` (venue-time rule). |
| VIII. Verification | PASS (planned) | Tests, type-check, lint, build, the browser pass, and `/review`. |
| IX. Spec Kit | PASS | The `/architect` decisions (2026-11-17) are folded in here. |

## Design

1. **`src/lib/eventTimeZone.ts`** (R2): the pure helpers and a fallback list of about 40 common zones. Tests cover Nairobi (no daylight saving), London and New York (across both DST change-overs), invalid names, and fallback detection.
2. **Types and columns**:
   - add `timezone: string | null` to `events` Row/Insert/Update in `src/types/database.ts`;
   - append `timezone` to `EVENTS_SELECT_COLUMNS`.
3. **Create**:
   - **Modal**: `form.timezone`, default `detectTimeZone()`; a picker in the basics step; validation; sends `timeZone`; warns if `timeZoneSaved === false`.
   - **Route**: validates `timeZone` with `Intl`, then converts `startsAt`/`endsAt` (date-only) to the start of that day in the zone before the RPC. It adds `timezone` to the post-RPC caller update and returns `timeZoneSaved`.
4. **Provisioning**: read `timezone`; compute `start_date`/`end_date` with `zonedDateOf` when it's set; include `timezone` in the insert; on failure, retry once without it (R4).
5. **Planner agenda**: `readPortalEventStartDate` prefers `events.timezone` (R5).
6. **Basics** (R6): the picker; venue-time display and save; the no-zone notice; the Planner hint; the error mapping (R8).
7. **Terminology** (R7): the hint text.
8. **Docs**: as listed in the Constitution Check.

## Complexity Tracking

Empty.
