---

description: "Task list for Feature 017 — Client Admins Set Up Their Own Team"
---

# Tasks: Client Admins Set Up Their Own Team

**Input**: Design documents from `specs/017-client-admin-team-setup/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No automated test suite exists in this repo and the spec does not request one. Each
story ends with a manual validation task that runs the matching rows of
[quickstart.md](quickstart.md); Polish runs `type-check`, `lint` and `build` (constitution VIII).

**Organization**: Tasks are grouped by user story. Story order follows priority: US1 (P1), US4 (P1),
US2 (P2), US5 (P2), US3 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to
- Paths are relative to the repository root (single Next.js project)

---

## Phase 1: Setup

**Purpose**: Confirm the live database still matches what the design assumed before writing SQL.

- [ ] T001 Re-verify the live Portal database (Supabase MCP, read-only) still has: policies `organization_members_insert_self` and `organization_members_update_owner_admin` with the definitions quoted in research R8; `event_members` primary key `(event_id, user_id)`; `create_event_with_products` inserting the creator as `admin` after the `events` insert and re-raising non-idempotency unique violations; `enforce_event_member_role_immutability` exempting `current_setting('role', true) = 'service_role'` and platform admins; `organizations` INSERT platform-admin-only; the migration role can switch to `service_role` (`select pg_has_role(current_user, 'service_role', 'MEMBER')` — true for `postgres` on 2026-10-09) and `service_role` holds INSERT/UPDATE on `public.event_members`. Record any drift at the end of specs/017-client-admin-team-setup/research.md and stop if a design assumption no longer holds.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The database changes (US4 + US5) and the shared server helper (US1, US2, US3). No user story can be validated before these land.

**⚠️ CRITICAL**: T006 changes the live database. Get the developer's explicit go-ahead immediately before applying.

- [ ] T002 Create supabase/migrations/zz_organization_admin_event_membership_and_role_guard.sql with a header comment explaining why it exists (Feature 017; spec FR-021–FR-025; research R7–R9; why `zz_`), then section 1: `DROP POLICY organization_members_insert_self` and create `organization_members_insert_org_admin` (FOR INSERT TO authenticated WITH CHECK `public.is_organization_admin(organization_id) AND role NOT IN ('owner','admin')`); `DROP POLICY organization_members_update_owner_admin` and create `organization_members_update_org_admin` (FOR UPDATE TO authenticated USING and WITH CHECK `public.is_organization_admin(organization_id) AND role NOT IN ('owner','admin')`). Leave "Global admins can manage all organization members" untouched.
- [ ] T003 In the same migration file, section 2: create `public.add_org_admins_to_new_event()` (plpgsql, `SECURITY DEFINER`, `SET search_path = public`) returning trigger that inserts into `event_members (event_id, user_id, organization_id, role)` one row per `organization_members` row of `NEW.organization_id` with role in ('owner','admin'), **excluding the creator with `om.user_id IS DISTINCT FROM NEW.created_by`** (never `<>`: a NULL `created_by` would then exclude everyone), role `'admin'`, `ON CONFLICT (event_id, user_id) DO NOTHING`; create trigger `trg_add_org_admins_to_new_event AFTER INSERT ON public.events FOR EACH ROW`. Comment why the creator is excluded (research R7).
- [ ] T004 In the same migration file, section 3: create `public.add_new_org_admin_to_events()` (plpgsql, `SECURITY DEFINER`, `SET search_path = public`) returning trigger that, when `NEW.role IN ('owner','admin')` and (`TG_OP = 'INSERT'` or `OLD.role NOT IN ('owner','admin')`), upserts `event_members` for every `events` row of `NEW.organization_id` with role `'admin'`: `ON CONFLICT (event_id, user_id) DO UPDATE SET role = 'admin' WHERE event_members.role NOT IN ('host','organizer','admin')`; create trigger `trg_add_new_org_admin_to_events AFTER INSERT OR UPDATE OF role ON public.organization_members FOR EACH ROW`.
- [ ] T005 In the same migration file, section 4: one-time backfill wrapped in `SET LOCAL ROLE service_role; … RESET ROLE;` (so the role guard's documented service-role exemption applies) that runs the same upsert as T004 for every current owner/admin × every event of their organization. Add a comment with the measured impact (2026-10-09: 24 added, 1 raised). Fallback if `SET LOCAL ROLE` is refused at apply time: keep the insert-only part (`ON CONFLICT DO NOTHING`, which never fires the role guard) in the migration and run the role-raising `UPDATE` as a separate statement through the service-role API client, recording it in research R7.
- [ ] T006 With the developer's explicit go-ahead, apply the migration to the live Portal project via Supabase MCP `apply_migration` (name `zz_organization_admin_event_membership_and_role_guard`), using the exact file contents from T002–T005.
- [ ] T007 Verify T006 on the live database with read-only SQL: the two new policies exist and the two old ones are gone; both triggers exist; a query of every owner/admin × every org event returns 0 rows missing from `event_members` or below role host/organizer/admin; totals match T005's comment (or explain the difference). Record results in specs/017-client-admin-team-setup/research.md under R7.
- [ ] T008 [P] Create src/lib/accountProvisioning.ts with `import 'server-only'`: `normalizeEmail(raw)` (trim, lower-case, basic format check → `invalid_email`), `ensureAccountByEmail(admin, email, fullName?)` → `{ userId, account: 'created' | 'existing' }` (look up `profiles` by email case-insensitively with the service-role client; else `auth.admin.createUser({ email, email_confirm: true, user_metadata })` with no password and no email; on create failure re-look-up up to 4 times with 150 ms × attempt backoff, as in `findOrCreatePlannerProfile` in src/lib/plannerStaffSync.ts; set `profiles.full_name` when created and given), and `ensureOrgMember(admin, organizationId, userId)` → `'added' | 'already_member'` (insert role `'member'` only, ignore duplicate). `fullName` max 200 chars. Never return other organizations or roles.

**Checkpoint**: Database hardened and org admins on every org event; shared helper ready.

---

## Phase 3: User Story 1 - Add a team member from the Planner event (Priority: P1) 🎯 MVP

**Goal**: A client org owner/admin adds a person by email to a Planner event's team with Planner access, from Team & Access, in one flow.

**Independent Test**: quickstart rows 1–7.

- [ ] T009 [US1] Create src/app/api/events/[eventId]/members/route.ts implementing [contracts/event-members.md](contracts/event-members.md): cookie `createServerClient` session (pattern of src/app/api/events/[eventId]/members/[memberId]/planner-permissions/enable/route.ts) → 401 `not_authenticated`; event lookup → 404 `event_not_found`; `canAdministerPlannerPermissions(eventId, user.id, authClient)` → 403 `forbidden` (add a comment: reused because its rule — platform admin or owner/admin of the event's own organization — is exactly this route's rule, including for Bendie invites; not Planner-specific here); body validation (`email` required, `fullName` ≤ 200 chars, `eventRole` in `EVENT_MEMBER_ROLES`) → 400 `invalid_request`; then with the service-role client: `ensureAccountByEmail`, `ensureOrgMember` (event's organization), insert `event_members` with `organization_id` = the event's, on conflict do nothing, and read back the row's role. Respond `{ userId, email, account, organization, event: 'added' | 'already_member', eventRole }`, or with `failedStep` + plain `error` on a partial failure.
- [ ] T010 [US1] In src/lib/eventTeamProvisioning.ts: export `grantPlannerAccess`; add `addPersonToEventByEmail(eventId, eventName, organizationId, email, fullName, config)` that POSTs the event route, maps the response into `PersonOutcome` (add `account?: 'created' | 'existing'` and `roleKept?: string` fields), then runs the existing follow-ups exactly as `addPersonToEvent` does (current-event pointer, Bendie access code when `config.grantBendie`, `grantPlannerAccess` when `config.plannerAccess !== 'none'`). Extend `describeOutcome` to mention a kept role ("kept their existing role: Attendee").
- [ ] T011 [P] [US1] Create src/components/portal/AddTeamMemberModal.tsx: `FormModal` with email (required), full name (optional), and `EventAccessConfigFields` (event role default `staff`; Planner access offered; Bendie access offered only when the event uses Bendie); submit calls `addPersonToEventByEmail`; shows one result summary via `describeOutcome`, including partial failures and "Planner access not available yet" when the event has no active Planner link; loading and error states per constitution VIII; `onAdded` callback.
- [ ] T012 [US1] In src/components/portal/PlannerTeamAccessPanel.tsx: add an "Add team member" primary action in the panel header and in the empty state; replace the empty-state copy "Add people from Organisation People (Events column) first, then grant their Planner access here." with copy pointing to Add team member; open `AddTeamMemberModal`; refresh the roster on success. Accept the props the modal needs (event name, organization id, product availability).
- [ ] T013 [US1] In src/app/portal/events/[eventId]/planner-overview/page.tsx: pass the event name, organization id and product availability to `<PlannerTeamAccessPanel>` (line ~248) from data the page already loads; do not add a new fetch if the event context already has them.
- [ ] T014 [US1] Run quickstart rows 1–7 against the running app and the live databases; for row 4 confirm with SQL that `event_members` and Planner `event_user_assignments` have no duplicates; for row 7 call the route directly as a plain member and as another organization's admin. Record results in specs/017-client-admin-team-setup/quickstart.md (Results section).

**Checkpoint**: MVP — client admins staff their own Planner events.

---

## Phase 4: User Story 4 - Every organization admin can work on every organization event (Priority: P1)

**Goal**: Org owners/admins can open and manage every event in their organization. Delivered by the Phase 2 migration; this phase validates it end to end.

**Independent Test**: quickstart rows 13–15.

- [ ] T015 [US4] Run quickstart row 13: as client admin A create a Planner event in the app; confirm creation succeeds within 5 s (FR-023), A is on the roster once as `admin` and still gets the existing creator Planner auto-sync (src/lib/plannerEventProvisioning.ts), and admin B is on the roster as `admin`. Record in specs/017-client-admin-team-setup/quickstart.md.
- [ ] T016 [US4] Run quickstart rows 14–15: admin B opens an event created before release, sees the full team on Planner Overview Team & Access and Bendie Attendees & Access (if Bendie), and uses "Add from organisation"; as Stawi, promote an attendee-on-one-event member to org admin and confirm they become `admin` on every org event. Record in specs/017-client-admin-team-setup/quickstart.md.

**Checkpoint**: Multi-admin clients share all events.

---

## Phase 5: User Story 2 - Client admins create accounts from Organisation People (Priority: P2)

**Goal**: Organisation People single add and spreadsheet import work for client admins; new people are members.

**Independent Test**: quickstart rows 8, 9 and 11.

- [ ] T017 [US2] Create src/app/api/organizations/[organizationId]/people/route.ts implementing [contracts/organization-people.md](contracts/organization-people.md): session → 401; allow only platform admin or an `organization_members` row for the route's `organizationId` with role owner/admin → 403 `forbidden`; body `people` 1–500 items, `email` required, `fullName` ≤ 200 chars → 400 `invalid_request`; process each person independently with `runWithConcurrency` from src/lib/csvImport.ts, deduplicating emails within the request (`duplicate`), using `ensureAccountByEmail` + `ensureOrgMember`; respond `{ results: [...] }` exactly as the contract.
- [ ] T018 [P] [US2] In src/components/portal/CsvImportModal.tsx: let `importRow` optionally return `{ notice?: string }` alongside `error`, carry it on `ImportOutcome`, and show it on successful rows in the results list. Existing callers that return only `{ error }` must render exactly as before.
- [ ] T019 [P] [US2] In src/components/portal/AddPersonModal.tsx: when the caller is not a platform admin (`useAuth().isGlobalAdmin` false), hide the org-role picker and create new people through `POST /api/organizations/[organizationId]/people`; platform admins keep the existing `/api/admin/create-user` path and role picker unchanged.
- [ ] T020 [US2] In src/app/portal/people/page.tsx: when the caller is not a platform admin, `beforeImportPeople` resolves/creates all rows through the organization route (which also adds membership) instead of `/api/admin/bulk-create-users`; `importPersonRow` inserts `organization_members` with role `member` when the sheet's `org_role` is `owner` or `admin` and returns `notice: "Organisation role limited to member"`; event assignments in the sheet keep today's behavior. Platform admins unchanged.
- [ ] T021 [US2] Run quickstart rows 8, 9 and 11; record results in specs/017-client-admin-team-setup/quickstart.md.

**Checkpoint**: Client admins add colleagues organization-wide.

---

## Phase 6: User Story 5 - Only Stawi manages organization owners/admins (Priority: P2)

**Goal**: No non-Stawi path can create, promote to, demote from or edit an org owner/admin membership. Database enforcement landed in Phase 2; UI paths were capped in US2.

**Independent Test**: quickstart rows 16–17.

- [ ] T022 [US5] Audit browser-side writes to `organization_members` across src/ (grep `from('organization_members')` with `.insert`/`.update`/`.upsert`): confirm every client-admin path writes only non-admin roles after T019/T020; list findings in specs/017-client-admin-team-setup/research.md under R8.
- [ ] T023 [US5] Run quickstart rows 16–17 with a client admin's browser session (direct supabase-js calls: insert role admin, promote member to admin, change an admin to member — all refused; change member ↔ attendee — works) and with a Stawi admin (all succeed); record in specs/017-client-admin-team-setup/quickstart.md.

**Checkpoint**: Org admin role is Stawi-controlled at the data layer.

---

## Phase 7: User Story 3 - Client admins add new people from event Add People flows (Priority: P3)

**Goal**: "Invite new attendee" and "Import spreadsheet" on Bendie events work for client org admins.

**Independent Test**: quickstart row 10.

- [ ] T024 [US3] In src/app/portal/events/[eventId]/members/page.tsx: set `canCreateAccounts` (line ~413) to `isGlobalAdmin || orgAdmin`, where `orgAdmin` comes from `isOrgAdmin(organizationId)` in src/lib/portalAuth.ts for the event's organization (UI hint only; the server is authoritative).
- [ ] T025 [US3] In src/components/portal/AddPeopleModal.tsx (invite mode, line ~115): replace `resolveOrCreatePersonByEmail` + `addPersonToEvent` with `addPersonToEventByEmail`, keeping the current outcome display.
- [ ] T026 [US3] In src/app/portal/events/[eventId]/members/page.tsx (event spreadsheet import, line ~356): replace `resolveOrCreatePersonByEmail` + `addPersonToEvent` with `addPersonToEventByEmail` per row, keeping per-row outcomes.
- [ ] T027 [US3] In src/lib/eventTeamProvisioning.ts: remove `resolveOrCreatePersonByEmail` if T025/T026 left no callers (grep src/ first); otherwise leave it and note why.
- [ ] T028 [US3] Run quickstart row 10 as client admin B on a Bendie event; record in specs/017-client-admin-team-setup/quickstart.md.

**Checkpoint**: All stories complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T029 Run the package.json scripts `npm run type-check`, `npm run lint` and `npm run build`; all must pass (lint warnings no worse than the current baseline).
- [ ] T030 [P] Update context/progress-tracker.md with Feature 017 (what shipped, migration name, flagged follow-ups from research); context/schema-reference.md with the new `organization_members` policies and the two triggers; and the "Role-Based Access Control" section of context/architecture.md to state that every organization owner/admin is automatically an event `admin` on every event of their organization (FR-021) and that only platform admins manage organization owner/admin roles (FR-024) — constitution VII.
- [ ] T031 [P] Update context/ui-registry.md with `AddTeamMemberModal` if it is treated as a reusable pattern (run `/imprint`), per constitution V.
- [ ] T032 Run `/review` and report findings before fixing; then `/speckit.converge`, which appends any remaining work to specs/017-client-admin-team-setup/tasks.md.
- [ ] T033 Save session state with `/remember save` to the project memory directory (decisions, migration applied, open follow-ups); no secrets.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T008)**. T002–T005 edit one file in order; T006 needs T002–T005 and the developer's go-ahead; T007 needs T006. T008 is independent of T002–T007.
- **US1** needs T008 (route) and T007 (so org admins not on the event can be tested); T009 → T010 → T012/T013 → T014; T011 needs T010.
- **US4** needs T007 only (no app code); can run in parallel with US1 implementation.
- **US2** needs T008; T017 → T019/T020 → T021; T018 is independent; T020 needs T018 for the notice.
- **US5** needs T007, T019 and T020.
- **US3** needs T010 (`addPersonToEventByEmail`) from US1.
- **Polish** after all stories.

## Parallel Opportunities

- T008 alongside T002–T007.
- Within US1: T011 (modal) alongside T012/T013 once T010 is done.
- US4 validation (T015–T016) alongside US1 implementation once T007 is done.
- Within US2: T018 and T019 in parallel after T017.
- T030 and T031 in parallel.

## Implementation Strategy

1. **MVP**: Phases 1–3 (T001–T014). Client admins can staff Planner events, and every org admin can reach every event.
2. **Then** US4 validation, US2 + US5 (organization-wide accounts and role protection), then US3.
3. Stop after each checkpoint to validate; commit per phase.
