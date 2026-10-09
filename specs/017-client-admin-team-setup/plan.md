# Implementation Plan: Client Admins Set Up Their Own Team

**Branch**: `017-client-admin-team-setup` (work continues on `developement`; no feature branch was created) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-client-admin-team-setup/spec.md`

## Summary

Client organization owners/admins get two new org-scoped server routes so they can add people
without Stawi: one ensures people exist in their organization (Organisation People add/import),
the other ensures a person (by email) is on an event's single roster (Planner "Add team member",
Bendie "Invite new attendee", event spreadsheet import). Both resolve or silently create the
account with the service-role client, add organization membership as `member` only, and never
change an existing role. Planner access is then granted by the existing Feature 008 Enable/Save
routes. The Planner Team & Access panel gains an "Add team member" modal built from existing
components. One migration (no new tables or columns) makes every organization owner/admin an
event admin on all of their organization's events, and stops client admins from creating or
changing organization owner/admin roles at the database level.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 14 App Router, React 18

**Primary Dependencies**: `@supabase/supabase-js` 2 (service-role admin client), `@supabase/ssr`
(cookie session in route handlers), existing `server-only` package

**Storage**: Supabase Postgres (Portal project); Planner project only via existing Feature 008 code

**Testing**: No automated test suite in the repo; `type-check`, `lint`, `build` plus the manual
checks in [quickstart.md](quickstart.md)

**Target Platform**: Web (Portal), server routes on the Next.js runtime

**Project Type**: Web application (single Next.js project)

**Performance Goals**: Add team member completes in under 5 s; spreadsheet import of 500 rows
within the existing bulk-import experience (bounded concurrency, per-row results)

**Constraints**: Service-role key server-only; authorization re-checked per request; idempotent
writes (on conflict do nothing); no new tables or columns; event creation must keep working
(creator excluded from the auto-add trigger, research R7)

**Scale/Scope**: 1 migration (2 policies, 2 triggers, backfill), 2 new routes, 1 server helper,
1 new modal, edits to 6 existing files; docs already reconciled

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — still passing.*

| Principle | Status | How |
| --- | --- | --- |
| I. Brownfield Preservation | Pass | Reuses `canAdministerPlannerPermissions`, `grantPlannerAccess`, `EventAccessConfigFields`, `FormModal`, `PlannerTeamAccessPanel`; Stawi flows and `app/api/admin/**` untouched |
| II. Architecture Boundaries (v1.1.0) | Pass | New privileged routes outside `app/api/admin/**`, org resolved server-side (route-addressed org verified against membership; event org from `events.organization_id`); no escalation: role always `member` |
| III. Supabase & DB Safety | Pass | One migration with a header explaining why; RLS change reviewed against the live policy set (R8); triggers checked against `create_event_with_products`, the role guard and the integrity triggers (R7); no table/column change so `database.ts` untouched. File name follows Principle III as clarified in constitution v1.1.1 (`zz_` to sort after the superseded policy files, R9) |
| IV. Security | Pass | Service-role client only in route handlers + a `server-only` helper; per-request auth; responses carry ids and flags only |
| V. UI Consistency | Pass | Existing modal, picker, `.row-action`/`.btn-*` styles, loading/error/empty states |
| VI. Scope Discipline | Pass | Pre-existing issues flagged in research, not fixed |
| VII. Documentation | Pass | `context/architecture.md` and `context/code-standards.md` reconciled with v1.1.0 (done 2026-10-09); `context/progress-tracker.md` and schema notes updated at completion (task) |
| VIII. Verification | Pass (task) | type-check, lint, build, quickstart checks, `/review` |
| IX. Spec Kit + JSM | Pass | This plan is the only plan for Feature 017 |

No violations; Complexity Tracking not needed.

## Design

### Database (migration, applied first)

`supabase/migrations/zz_organization_admin_event_membership_and_role_guard.sql` — see
[data-model.md](data-model.md) and research R7–R9. Order inside the file: replace the two
`organization_members` policies; create both trigger functions and triggers; run the backfill as
`service_role`. Verify afterwards: event creation still works for an org admin (creator gets
`admin` once, other admins added); a client admin's direct insert/update of an owner/admin row is
refused; backfill counts match (24 added, 1 raised, or the current equivalent).

### Server

- **`src/lib/accountProvisioning.ts`** (new, `import 'server-only'`): `ensureAccountByEmail(admin,
  email, fullName)` → `{ userId, account: 'created'|'existing' }` with the email-exists backoff
  re-look-up (pattern from `plannerStaffSync.findOrCreatePlannerProfile`); `ensureOrgMember(admin,
  orgId, userId)` → `'added'|'already_member'` (insert `member`, on conflict do nothing). Shared by
  both routes so the rules live in one place.
- **`src/app/api/organizations/[organizationId]/people/route.ts`** (new): contract
  [organization-people.md](contracts/organization-people.md). Auth: platform admin or owner/admin
  of the route's org. Uses `runWithConcurrency` from `csvImport.ts` (as `bulk-create-users` does).
- **`src/app/api/events/[eventId]/members/route.ts`** (new): contract
  [event-members.md](contracts/event-members.md). Auth: `canAdministerPlannerPermissions` with the
  cookie `authClient`; writes with the service-role client; `organization_id` taken from the event.
- Session/auth boilerplate follows the existing `planner-permissions/enable/route.ts` shape.

### Browser

- **`src/lib/eventTeamProvisioning.ts`**: add `addPersonToEventByEmail(eventId, eventName, email,
  fullName, config)` = POST the event route, then the existing follow-ups (current-event pointer,
  Bendie access code when `grantBendie`, `grantPlannerAccess` when chosen); returns the existing
  `PersonOutcome` plus `account`/`roleKept`. Export `grantPlannerAccess`. Keep
  `resolveOrCreatePersonByEmail` only if a caller remains; otherwise remove it.
- **`AddTeamMemberModal.tsx`** (new): `FormModal` + email, full name, `EventAccessConfigFields`
  (event role default `staff`, Planner access default by role; no Bendie toggle on Planner-only
  events); one result summary using `describeOutcome`.
- **`PlannerTeamAccessPanel.tsx`**: "Add team member" button (header) and empty-state action;
  replace the "Add people from Organisation People first" copy; refresh list on success.
- **`AddPeopleModal.tsx`** (invite mode) and **`members/page.tsx`** (event spreadsheet import):
  call `addPersonToEventByEmail` instead of `resolveOrCreatePersonByEmail` + `addPersonToEvent`.
- **`members/page.tsx`**: `canCreateAccounts={isGlobalAdmin || isOrgAdmin}` using
  `portalAuth.isOrgAdmin(event org)`.
- **`AddPersonModal.tsx`**: if the caller is not a platform admin, hide the org-role picker and
  call the organization route; platform admins unchanged.
- **`people/page.tsx`** import: if not a platform admin, `beforeImportPeople` calls the organization
  route (which also adds membership), and `importPersonRow` inserts org membership as `member`
  with a "limited to member" row note when the sheet asked for more; event assignments in the
  sheet keep today's behavior.

### Spec alignment notes

- FR-005 / FR-024: enforced in the UI paths and, via the migration, in the data layer.
- FR-018 and "Add from organisation/team" work for every org admin because they now hold event
  role `admin` on every org event (FR-021).

## Project Structure

### Documentation (this feature)

```text
specs/017-client-admin-team-setup/
├── spec.md
├── plan.md                         # this file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── organization-people.md
│   └── event-members.md
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
supabase/migrations/
└── zz_organization_admin_event_membership_and_role_guard.sql   # new
src/
├── app/api/
│   ├── organizations/[organizationId]/people/route.ts   # new
│   └── events/[eventId]/members/route.ts                 # new
├── lib/
│   ├── accountProvisioning.ts                           # new (server-only)
│   └── eventTeamProvisioning.ts                         # edit
├── components/portal/
│   ├── AddTeamMemberModal.tsx                           # new
│   ├── PlannerTeamAccessPanel.tsx                       # edit
│   ├── AddPeopleModal.tsx                               # edit
│   └── AddPersonModal.tsx                               # edit
└── app/portal/
    ├── events/[eventId]/members/page.tsx                # edit
    └── people/page.tsx                                  # edit
context/progress-tracker.md, context/schema notes                # docs at completion
```

**Structure Decision**: Single Next.js project, existing layout. Privileged code stays in route
handlers plus one `server-only` helper in `src/lib`, matching `plannerStaffSync.ts`.
