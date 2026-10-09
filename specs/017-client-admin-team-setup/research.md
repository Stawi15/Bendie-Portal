# Research: Client Admins Set Up Their Own Team (Feature 017)

All findings verified against the current code (`developement` @ `c30a382`) and the live Portal
database on 2026-10-09. No NEEDS CLARIFICATION items remain.

## R1 — Where account creation lives today

- **Decision**: Add one organization-scoped "ensure people" route for account resolution/creation,
  outside `app/api/admin/**`; leave `/api/admin/create-user` and `/api/admin/bulk-create-users`
  unchanged for Stawi-only flows (creating org owners/admins).
- **Rationale**: Constitution v1.1.0 Principle II keeps `app/api/admin/**` platform-admin-only and
  allows org-scoped privileged routes elsewhere. Both admin routes check
  `profiles.global_role = 'admin'` and return 403 to client admins (verified in source).
- **Alternatives**: (a) Relax the admin routes' check — rejected, violates Principle II. (b)
  Supabase Edge Function — rejected, no precedent for privileged Portal actions there.

Callers found that create accounts:

| Caller | Today | Feature 017 |
| --- | --- | --- |
| `eventTeamProvisioning.resolveOrCreatePersonByEmail` (event "Invite new attendee", event spreadsheet import) | browser profile lookup, then `/api/admin/create-user`; roster row inserted from the browser | replaced for these callers by the new event route (R3), which does account + org + roster in one call |
| `AddPersonModal` (Organisation People single add, with org-role picker) | `/api/admin/create-user` with chosen `orgRole` | platform admin: unchanged; client admin: new org route, role picker hidden (member) |
| `people/page.tsx` spreadsheet import (`beforeImportPeople`) | `/api/admin/bulk-create-users`, then browser inserts `organization_members` with the row's `org_role` | platform admin: unchanged; client admin: new org route; row role capped to member and reported |

## R2 — Existing accounts are invisible to client admins

- **Finding**: `profiles` SELECT is `can_view_profile(id)`: self, shared event, shared chat, members
  of orgs the caller administers, or platform admin. A client admin's browser lookup of an email
  that belongs to someone outside their orgs/events returns nothing, and `createUser` then fails
  with "already registered".
- **Decision**: The org route resolves the email with the service-role client (case-insensitive),
  reuses the account if found, creates it otherwise. Responses return only `userId` and flags,
  never other organizations (spec FR-008).
- **Race**: on a `createUser` failure, re-look-up by email with short backoff before reporting an
  error — the pattern already proven in `plannerStaffSync.findOrCreatePlannerProfile`.

## R3 — Adding to the event roster from the browser fails for most client admins

- **Finding**: `event_members` INSERT policy requires `is_event_host_or_organizer(event_id)`, which
  checks the caller's own `event_members.role in ('host','organizer','admin')`; org admin status is
  not consulted. `create_event_with_products` adds only the creator (role `admin`). So Ann, an
  Xperia admin who did not create an event, cannot insert roster rows from the browser.
  `addPersonToEvent` and `EventAssignmentsDropdown` hit the same wall for her.
- **Decision**: Every flow that adds a person *by email* to an event writes the account, org
  membership and roster row server-side in one new event-scoped route ("ensure event member"),
  authorized by `canAdministerPlannerPermissions` (platform admin, or owner/admin of the event's own
  organization, resolved from `events.organization_id`). Callers: Planner "Add team member", Bendie
  "Invite new attendee", and the event spreadsheet import. Insert uses on-conflict-do-nothing so an
  existing row and its role are never changed (spec FR-012); the route returns the kept role. The
  browser then runs the existing follow-up steps (current-event pointer, Bendie access code,
  `grantPlannerAccess`) exactly as `addPersonToEvent` does today.
- **Not changed**: the RLS policy itself (no migration). Widening it would change Bendie flows too
  and is outside this spec. Flagged below.

## R4 — Planner access

- **Decision**: Reuse `grantPlannerAccess` (Enable + Save via Feature 008 routes) unchanged; export
  it from `eventTeamProvisioning.ts` so the new modal can call it after the server route returns.
- **Rationale**: Those routes already authorize with `canAdministerPlannerPermissions`, find-or-
  create the Planner profile by email / `planner_profile_id`, and upsert the assignment on
  `(event_id, profile_id)` — no duplicates (spec FR-014, SC-004).

## R5 — UI reuse

- `PlannerTeamAccessPanel` (Planner Overview, already gated by `can-administer`) gets the "Add team
  member" button and empty-state copy.
- New `AddTeamMemberModal` built on `FormModal` + `EventAccessConfigFields` (the role/access picker
  already used by `AddPeopleModal`), Planner-only variant (no Bendie toggle on Planner-only events).
- `AddPeopleMenu.canCreateAccounts` on the Bendie Attendees & Access page becomes
  `isGlobalAdmin || isOrgAdmin(event org)` using existing `portalAuth.isOrgAdmin` (UI hint only;
  the server is authoritative).

## R6 — Organization role of new members

- **Decision**: The org route only ever inserts `organization_members.role = 'member'`, with
  on-conflict-do-nothing, so an existing membership (any role) is left as is.

## R7 — Organization admins on every event (spec US4, FR-021–FR-023)

- **Finding**: workspace access is `requireEventWorkspaceAccess` = platform admin, or an
  `event_members` row (Feature 003 deliberately excludes org role alone). 123 RLS policies on 32
  tables gate on `is_event_member` / `is_event_host_or_organizer` / `event_members`. Org admins who
  are not on an event cannot open it, see its roster, or add people.
- **Decision** (developer, 2026-10-09): keep Feature 003's model and put every org owner/admin on
  every org event with role `admin`, via one migration:
  1. `AFTER INSERT ON events` trigger (`SECURITY DEFINER`): insert all org owners/admins except
     `NEW.created_by` as `admin`, `ON CONFLICT (event_id, user_id) DO NOTHING`. Excluding the
     creator is required: `create_event_with_products` inserts the creator itself afterwards and
     re-raises any unique violation that is not its idempotency key, so a pre-inserted creator row
     would fail event creation.
  2. `AFTER INSERT OR UPDATE OF role ON organization_members` trigger (`SECURITY DEFINER`), when the
     new role is owner/admin and the old was not: insert into every event of that org as `admin`,
     `ON CONFLICT DO UPDATE SET role = 'admin' WHERE role NOT IN ('host','organizer','admin')`.
     After R8 only platform admins or the service role can make owners/admins, both of which the
     role-immutability guard already allows.
  3. One-time backfill with the same upsert, run as `service_role` so the guard's documented
     exemption applies. Measured on 2026-10-09: 24 rows added, 1 upgraded (Bendie Planner Sample
     21, Xperia Agency 3 + 1, World Bank Group 0).
- **Alternatives**: grant org admins access in all 123 policies plus `requireEventWorkspaceAccess` —
  rejected (large, risky, reverses Feature 003); keep the gap — rejected by the developer.
- **Side effects, accepted**: each new roster row triggers the existing automatic access-code issue
  (no email). Planner access is not auto-enabled. Demotion does not remove rows (no record of which
  rows were automatic); Stawi removes manually.
- With this, "Add from organisation", "Add from team" and the People "Events" dropdown work for
  every org admin (they hold event role `admin`), closing the remaining roster gap.

## R8 — Organization role protection (spec US5, FR-024–FR-025)

- **Finding**: `organization_members_insert_self` allows `is_organization_admin(org)` to insert any
  `user_id` with any role; `organization_members_update_owner_admin` allows org admins to set any
  role. The only browser path that writes elevated roles is the People spreadsheet import
  (`org_role` column); no screen edits org roles. Live counts: owner 2, admin 6.
  `organizations` INSERT is platform-admin-only, so the policy's org-creator self-bootstrap clause
  is already covered by the platform-admin ALL policy.
- **Decision**: replace both policies (same migration as R7):
  - INSERT: `is_organization_admin(organization_id) AND role NOT IN ('owner','admin')`.
  - UPDATE: `USING (is_organization_admin(organization_id) AND role NOT IN ('owner','admin'))`,
    `WITH CHECK` the same — client admins can neither touch an owner/admin row nor produce one.
  - Platform-admin ALL policy and the service role (Stawi routes) unchanged.
- **Impact**: People import by a client admin with `org_role=admin` is capped to member in the UI
  before insert (plan), so it never hits the refusal.

**Applied and verified 2026-10-09 (T006/T007)**: applied by the developer via the SQL Editor of the
shared Bendie Supabase project (`droaamagpsojkzznywgd` — the Portal has no project of its own; the
same database serves the Evently-App mobile app). Old `organization_members_insert_self` /
`_update_owner_admin` policies gone, `_insert_org_admin` / `_update_org_admin` present, both
triggers present; owners/admins missing or below admin on any org event: 0; `event_members`
388 → 412 (24 added; the 1 raise confirmed by the 0). Because it was run in the SQL Editor, it is
not recorded in Supabase's migration history table.

**Verified 2026-10-09 (analysis U2)**: `postgres` (the migration role) is a member of
`service_role`, so `SET LOCAL ROLE service_role` works for the backfill.

**T022 audit (2026-10-09)** — browser writes to `organization_members` after Feature 017:
`AddPersonModal` add-existing inserts `member`; People import inserts the sheet role only for platform
admins, and for client admins caps owner/admin to member (notice) and applies a non-admin sheet role
only to memberships the import just created; `accountProvisioning.ensureOrgMember` (server) inserts
`member`; People "remove" deletes (no org-admin DELETE policy — flagged item 2). The People page's
admin toggle writes `profiles.global_role`, which `enforce_profile_role_immutability` already
reverts for anyone but platform admins/service role. No client-admin path writes owner/admin.

## R10 — Org admins use every Planner module (US6, 2026-10-09)

- **Finding (browser test)**: on Xperia's Planner-only "test" event the client admin saw an
  "Operations" area containing only the Stawi-only Bendie Planner integration page (shared section,
  page denies non-platform-admins), and no Planning area: Tasks/Vendors/Checklist have no Portal-admin
  override because their writes need a real Planner identity (`created_by_profile_id`, Planner RLS
  `operational_tasks_write_self_or_manager_or_admin`). Planner had **zero** assignments for event 61;
  the creator's automatic sync left `planner_sync_status` NULL (an early silent exit — replaying every
  read step today succeeds, so the exact cause at creation time is not recoverable).
- **Decision**: give every org owner/admin a real full-access Planner assignment (MANAGER_FLAGS,
  access_role admin) — at provisioning (all admins, not only the creator), self-healed on opening
  the event (`planner-capabilities` → `ensureOrgAdminPlannerAccess`), and backfilled. Sync now reads
  and writes the target profile with the service client (the caller's session cannot update another
  user's `planner_profile_id`) and records skip reasons (FR-029). `bendie-planner` section listed only
  for platform admins (FR-030). Manager-configured access is never overwritten (FR-028).

## R9 — Migration file name

- **Decision**: `supabase/migrations/zz_organization_admin_event_membership_and_role_guard.sql`.
  The `zz_` prefix follows the repo precedent (`zz_event_members_role_guard_final_authoritative.sql`)
  so filename-order replay applies it after the files that created the replaced policies.
- **Resolved**: constitution v1.1.1 (2026-10-09) rewords Principle III to the real convention
  (descriptive names; later-sorting name such as `zz_` when superseding earlier files).

## Flagged, not fixed (Principle I / VI)

1. `pointCurrentEventAt` updates another user's profile from the browser; `profiles` UPDATE allows
   only self or platform admin, so for client admins it affects 0 rows without error. Pre-existing;
   irrelevant to Planner-only events.
2. Organisation People "remove person" deletes `organization_members` from the browser, but there
   is no DELETE policy for org admins, so it silently removes nothing for client admins.
   Pre-existing; separate follow-up.
3. `context/architecture.md` still says `/portal` requires `global_role = 'admin'` (stale since
   Feature 003) and other pre-003 statements. Only the privileged-route rules were reconciled
   (done 2026-10-09 with constitution v1.1.0).
