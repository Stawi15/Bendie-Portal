# Tasks: Client Admins Edit Their People; Batch Task Status Updates

- [X] T001 [US1] Create `src/app/api/organizations/[organizationId]/people/[userId]/route.ts` (PATCH) per FR-001: session → 401; platform admin or caller owner/admin of the route's org → else 403; target must be a member of that org → else 404; target platform admin and caller not → 403; validate fields (`full_name` required ≤ 200; phone/job_title/avatar_url ≤ 500; bio ≤ 2000; `email` only for platform admins); write with the service client.
- [X] T002 [US1] `src/components/portal/EditProfileModal.tsx`: optional `organizationId`; when given and the caller is not a platform admin (or is editing someone else), save via T001; email field read-only for non-platform admins; show the route's message on error.
- [X] T003 [US1] Pass `organizationId` from `src/app/portal/people/page.tsx` and `src/app/portal/events/[eventId]/members/page.tsx`; in People, pass `onToggleAdmin` only for platform admins (FR-002).
- [X] T004 [US2] `src/components/portal/PlannerTaskList.tsx`: status colours (FR-003) for pills and status selects.
- [X] T005 [US3] `PlannerTaskList.tsx`: manager status edits held locally with count, Save changes / Discard bar, failed-row messages (FR-004–FR-006).
- [X] T006 [US3/US4] `src/app/portal/events/[eventId]/planner-tasks/page.tsx`: `saveStatuses(changes)` (bounded-parallel PATCH, per-row results), silent `refresh()` used after every mutation instead of the loading-state reload (FR-007), beforeunload guard (FR-006).
- [X] T007 [US4] `src/app/api/events/[eventId]/planner-tasks/route.ts`: tasks + assignable staff in parallel (FR-008).
- [X] T008 Validate: type-check, lint baseline, isolated build; live check of T001 (Ann edits a colleague's name; refused cases) and batch status save; commit.

## Results (2026-10-09)

- Live through the real routes as the Xperia test org admin: colleague name edit saved (then restored); email change 403; editing someone outside the org 404; empty name 400; 3 statuses saved in one batch and stored as chosen; test tasks deleted. 7/7.
- Tasks GET (dev server, warm): 3.8–7.4 s before → 1.7–2.5 s after (≈11 sequential DB round trips of 0.22–0.55 s → ~4 parallel waves). Same checks, same order of responses.
- type-check; lint 0 errors / 28 warnings (baseline); production build succeeded (isolated copy).
- Not yet checked in a browser: the colour styling, the save bar and the leave-page warning.
