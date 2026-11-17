# Tasks: Profiles Lock-down Readiness (C1)

## Phase 1: Foundation

- [X] T001 Create `src/lib/callerProfile.ts` (`readCallerProfile`, server-only, service role) (FR-002, FR-003).
- [X] T002 [P] Create `src/lib/profileContacts.ts` (`eventMemberContacts`, `profileContacts`, `organizationPeopleContacts`) (FR-005).
- [X] T003 [P] Create `src/app/api/organizations/[organizationId]/people/contacts/route.ts` (FR-005, FR-006).
- [X] T004 [P] Create `src/app/api/organizations/[organizationId]/people/search/route.ts` (FR-008).

## Phase 2: US1, sign-in and permission checks

- [X] T005 [US1] `src/middleware.ts`, `src/lib/portalAuth.ts`, `src/lib/eventAuth.ts`, `src/lib/orgProductsAdminServer.ts`: own admin check via `portal_is_global_admin` (FR-002).
- [X] T006 [US1] `src/contexts/AuthContext.tsx`: explicit public columns, admin RPC, own contact (FR-004).
- [X] T007 [US1] Every API route's own-profile read goes through `readCallerProfile`, including `src/lib/plannerModuleAccess.ts` (FR-002, FR-003).
- [X] T008 [US1] `resolveCallerPlannerIdentity` / `planner_profile_id` reads in `plannerTasks`, `Vendors`, `Checklist`, `People`, `Logistics`, `Production` go through `readCallerProfile` (FR-003).

## Phase 3: US2, contacts

- [X] T009 [US2] Event lists: `members`, `attendee-travel`, `gallery`, `planner-people`, `BreakoutAssignmentsModal`, `PlannerTeamAccessPanel`, `AddParticipantFromPortalModal` (event) (FR-005).
- [X] T010 [US2] Organisation lists: `useOrgPeople`, `TeamMembersModal`, `eventTeamProvisioning` (candidates, team preview), `AddParticipantFromPortalModal` (organisation) (FR-005, FR-006).
- [X] T011 [US2] Activity: org and event `activity-log` pages, `OrganizationHome`, `useRecentActivity`, `admin/organisations/[organizationId]` (FR-005).
- [X] T012 [US2] `EditProfileModal`: email/phone are read-only and left out of the payload when not loaded (FR-009).
- [X] T013 [US2] `src/app/api/admin/planner-pull-travel/route.ts`: member emails via `get_event_member_contacts` (the caller is a Stawi admin) (FR-001).

## Phase 4: US3, Stawi people tools

- [X] T014 [US3] `bulk-create-users` resolves existing accounts with `ensureAccountByEmail`; `people/page.tsx` drops the browser lookup (FR-007).
- [X] T015 [US3] `AddPersonModal` search uses the search route (FR-008).

## Phase 5: Verification

- [X] T016 Code search for hidden-column user-key reads returns nothing (SC-001).
- [X] T017 `tsc`, lint, `npm test`, placeholder-env build (SC-003).
- [X] T018 Rolled-back C1 simulation on live Bendie: revoke and grant as C1 will, then run the Portal's own-profile select, `portal_is_global_admin`, `get_profile_contact` and `get_event_member_contacts` as an organiser and as a Stawi admin, and confirm a hidden-column select fails (SC-002).
- [X] T019 Docs: `context/architecture.md`, `context/progress-tracker.md`, `context/schema-reference.md`.
- [ ] T020 Browser pass (developer, at the end with 024–026).
- [ ] T021 `/review`, then converge.

## Verification note

**2026-11-17:** `tsc` and lint exit 0 (the 7 warnings in changed files all existed before), `npm test` 68/68, and the placeholder-env build passes. The code search finds no user-key hidden-column read; the remaining ones use the service role or the Planner database. C1 simulation on live Bendie, in one block rolled back by a final `RAISE`, run as an organiser, an org admin (another organisation) and a Stawi admin: own public columns 1/1/1; `portal_is_global_admin` false/false/true; own contact 1/1/1; `get_event_member_contacts` 14 / 42501 (expected: not their event) / 14; event and org embeds of public columns work; own `UPDATE … RETURNING id` 1/1/1; selecting `email`, `global_role`, `planner_profile_id` blocked (42501) for all three. Afterwards, live `authenticated` still has table SELECT (unchanged). Still open: T020 (browser pass) and T021.
