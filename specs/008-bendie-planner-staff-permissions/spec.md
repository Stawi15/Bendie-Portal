# Feature Specification: Bendie Planner Staff & Module Permissions

**Feature Branch**: `008-bendie-planner-staff-permissions`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Feature 008 provides the manager-facing foundation for administering Bendie Planner access and module permissions for people who are already members of a Portal event. Today Planner's `event_user_assignments` permission model exists and Feature 007 enforces Tasks permissions, but Portal managers have no proper workflow for viewing or configuring those permissions."

## Context

Features 001–007 are converged and are preserved unchanged by this feature. Feature 001 established the Portal↔Planner identity bridge (`profiles.planner_profile_id`) and the automatic, role-derived staff sync (`plannerStaffSync.ts`). Feature 007 built the first real consumer of Planner's per-event permission model (`event_user_assignments`), enforcing `can_view_tasks`/`can_manage_tasks` for its Tasks module — but Feature 007 was deliberately scoped to *reading* that model, never to letting anyone administer it.

This carry-forward requirement was identified on 2026-09-18 during Feature 007's own manual acceptance testing: an organization-owning Portal platform admin correctly could not see the Tasks tab, because no assignment existed for them and Portal has no workflow for a manager to create or edit one. The subsequent Feature 008 architecture/discovery pass (this session, 2026-09-20) re-verified the live Planner schema directly and confirmed the facts this specification treats as authoritative:

- `event_user_assignments` currently exposes exactly seven view flags and three manage flags: `can_view_overview`, `can_view_production`, `can_view_logistics`, `can_view_tasks`/`can_manage_tasks`, `can_view_notifications`, `can_view_checklist`/`can_manage_checklist`, `can_view_vendors`/`can_manage_vendors`, plus `access_role` and `is_active`. No `can_manage_overview`/`can_manage_production`/`can_manage_logistics`/`can_manage_notifications` columns exist.
- Planner's own native RLS on this table already gates every write (`INSERT`/`UPDATE`/`DELETE`) on `is_super_admin() OR is_org_admin_for_event(event_id)` — a separate authority from any `can_manage_*` module flag. This independently corroborates Locked Product Decision 2 below: Planner's own design already treats "who may administer an assignment" as distinct from "what a module manager can do."
- `plannerStaffSync.ts`'s `syncStaffMemberToPlanner()` is the only current writer of this table. It derives an all-or-nothing permission bundle from `event_members.role` via `roleToPlannerFlags()` (host/organizer/admin → full view + every currently-supported manage flag; facilitator/staff/speaker → full view, no manage) and upserts on the live `UNIQUE (event_id, profile_id)` constraint. `findOrCreatePlannerProfile()` performs race-safe identity resolution/creation by exact-email match.
- `resolveTaskCapability()` (Feature 007) reads `can_view_tasks`/`can_manage_tasks` fresh from the live row on every request, with no assumption about who last wrote them or why — confirming Feature 007 requires no code change from this feature.
- Portal's existing authorization primitives (`src/lib/eventAuth.ts`) already distinguish platform admin (`profiles.global_role = 'admin'`), organization owner/admin (`organization_members.role`), and event-workspace membership (`event_members`) as three independent checks — this feature reuses that vocabulary rather than inventing a new one.
- `event_members` already carries four Planner-sync bookkeeping columns from Feature 001 (`planner_assignment_id`, `planner_synced_at`, `planner_sync_status`, `planner_sync_error`); this feature's one new column follows that same established, additive pattern.
- **Verified during this specification's own review (2026-09-20)**: `access_role` is not referenced by any live Planner RLS policy or SQL function (confirmed by inspecting every function/policy definition mentioning it — none exist beyond the column itself); it currently has zero effect on any live Planner authorization decision. Treating it as a purely cosmetic, server-derived value (FR-026–FR-028) is therefore safe and introduces no hidden privilege gap.
- **Also verified during this specification's own review**: today's automatic Planner sync (`syncStaffMemberToPlanner`) is invoked only from member-add/re-add paths (`handleAddMember`, CSV import, "Add All Organisation Members," "Assign a Team" in `members/page.tsx`) and the Feature 004 event-creator auto-provision — never from `changeRole` (the in-place role-edit action), which updates `event_members.role` directly with no Planner-side call at all. This specification's requirements have been worded to match that actual trigger surface rather than assuming a role-change-triggered resync exists today.
- **Also verified during this specification's own review**: removing a member from an event (e.g. `EventAssignmentsDropdown.tsx`'s unassign action) is an existing, unmodified hard `DELETE` of the `event_members` row — there is no soft-delete/`is_active` concept on that table today. See FR-041a for the resulting lifecycle rule this implies for `planner_permissions_configured_at`.
- **Also verified during this specification's own review**: `members/page.tsx`'s CSV import (`importMemberRow`) calls `syncToPlanner` unconditionally after its `event_members` insert, even when that insert hits the existing unique-membership constraint (code `23505`) and is silently a no-op — meaning re-uploading a CSV roster that includes an already-existing, currently-active event member triggers automatic sync for that member too, not only for genuinely new rows. This is real, concrete confirmation that FR-043/FR-044/FR-045 are not a hypothetical/defensive-only concern: a routine CSV re-upload is an ordinary, expected way this exact overwrite risk occurs for any staff-tier member who has not been removed from the event.

## Clarifications

### Session 2026-09-20 (product decisions supplied directly by the product owner, locking the Feature 008 architecture's recommended defaults)

- Q: How does the system know a person's Planner permissions have been deliberately hand-configured, so automatic role-based sync stops overwriting them? → A: A single new Portal-side field, `event_members.planner_permissions_configured_at` (nullable timestamp). `NULL` = never explicitly configured (automatic sync may still apply defaults); non-`NULL` = manager-owned from that point forward. No corresponding field is added to Planner's own schema. This is an ownership marker, not an audit log.
- Q: Who is allowed to administer another person's Planner permissions? → A: Only a Portal Platform Admin, or an Organization Owner/Admin of the event's own organization. No event role (host/organizer/admin/facilitator/staff/speaker) and no Planner module-manage flag (`can_manage_tasks`/`can_manage_checklist`/`can_manage_vendors`) confers this authority.
- Q: Should the UI expose the seven module flags as raw checkboxes only, or offer a faster path? → A: Offer three UI-only conveniences — Viewer, Manager, Custom — that populate the real flags; no preset column is stored, and a manually-diverged combination simply displays as Custom.
- Q: Should Feature 008 build a full audit-history UI? → A: No. It MUST record meaningful changes (access enabled/changed/disabled/reactivated) in a minimal, server-side, append-only Portal structure capturing who/what/when/before/after, but exposing that history is explicitly deferred to a later feature.

No `[NEEDS CLARIFICATION]` markers remain — every decision point the architecture pass flagged as needing product input has been resolved above.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An authorized manager grants Bendie Planner access to an event staff member (Priority: P1)

An organization owner/admin (or Portal platform admin) opens an event member's existing Members-page entry, sees that person currently has no Bendie Planner access, and turns it on — triggering identity provisioning and a role-derived starting set of permissions, without ever seeing a raw ID or database term.

**Why this priority**: Without an explicit, manager-triggered "on" switch, nothing else in this feature is reachable — this is the entry point the whole feature exists to provide (the exact gap Feature 007's acceptance testing surfaced).

**Independent Test**: As an organization owner/admin, open a staff-eligible event member who has never had Planner access, enable it, and confirm a Planner identity and an active, role-appropriate permission set now exist for them — verifiable by that person then being able to use Feature 007's Tasks module per their new permissions.

**Acceptance Scenarios**:

1. **Given** an event member with no prior Planner identity, **When** an authorized manager enables Bendie Planner access for them, **Then** a Planner identity is resolved or created, an active event assignment is created, and its module permissions match the role-derived defaults for that member's current Portal event role.
2. **Given** an event member whose email already matches an existing Planner identity, **When** access is enabled, **Then** the existing identity is reused — no duplicate Planner account is created.
3. **Given** a manager has merely opened the permissions panel without enabling anything, **When** they navigate away, **Then** no Planner identity or assignment has been created.
4. **Given** identity provisioning fails, **When** the manager retries the exact same enable action, **Then** the retry succeeds without creating a duplicate identity or assignment, and no raw Planner/database error text is ever shown.

---

### User Story 2 - An authorized manager configures an individual's module permissions (Priority: P1)

Once Planner access is enabled for someone, the same authorized manager can view and change exactly which of the seven modules that person can view, and which of the three manage-capable modules they can also manage — using Viewer/Manager/Custom conveniences or individual checkboxes — and that configuration is never silently overwritten again by an unrelated role change.

**Why this priority**: This is the actual product gap: a real, enforced permission model with no way for anyone to see or shape it per person.

**Independent Test**: As an authorized manager, change an individual module flag for someone with active Planner access, confirm the change persists and is reflected the next time the panel is opened, then change that person's Portal event role and confirm their Planner module permissions are unaffected by the role change.

**Acceptance Scenarios**:

1. **Given** a person with active Planner access, **When** the manager selects the Manager preset, **Then** every module's manage-capable flag (and its dependent view flag) is set to true, and non-manage-capable modules remain view-only true.
2. **Given** a person with active Planner access, **When** the manager selects the Viewer preset, **Then** every view flag is true and every manage flag is false.
3. **Given** a preset has been applied, **When** the manager changes one individual flag away from that preset's exact combination, **Then** the UI represents the current state as Custom, not as the original preset.
4. **Given** a manager saves any module permission change for the first time for this person, **Then** `planner_permissions_configured_at` transitions from unset to set, and it never becomes unset again while access remains enabled.
5. **Given** permissions have already been explicitly configured for a person, **When** their Portal event role later changes for an unrelated reason, **Then** their Planner module permissions remain exactly as last configured.
6. **Given** a module with no live manage capability (Overview, Production, Logistics, Notifications), **When** the manager views its row, **Then** only a View control is shown — no Manage control is rendered at all.

---

### User Story 3 - Only authorized managers can reach or change Planner permissions (Priority: P1)

An ordinary event member, an event host/organizer/admin without organization-level authority, or a person who holds a Planner module-manage flag (e.g. `can_manage_tasks`), cannot view or change anyone's Bendie Planner permissions — including their own module-manage flags — through any route, including direct API calls.

**Why this priority**: This is the anti-escalation boundary the architecture pass identified as a deliberate, evidence-grounded requirement (echoed by Planner's own native RLS); it must hold from the first release, not be retrofitted.

**Independent Test**: As an event member who is not an organization owner/admin and not a Portal platform admin — including one who holds `can_manage_tasks` for the event — attempt to view and then to submit a permissions change via the UI and directly via the API, and confirm both are denied.

**Acceptance Scenarios**:

1. **Given** a caller who is only an event host/organizer/admin/facilitator/staff/speaker/attendee for the event, **When** they attempt to open or submit the permissions surface, **Then** access is denied.
2. **Given** a caller whose own Planner assignment has `can_manage_tasks = true` (or any other manage flag true), **When** they attempt to change any person's Planner permissions — including their own — through anything other than being an org owner/admin or platform admin, **Then** access is denied.
3. **Given** a caller submits a permissions-write request directly to the API without having gone through the UI, **When** the request is processed, **Then** the same organization owner/admin/platform-admin check is independently re-verified server-side and enforced identically to the UI path.
4. **Given** an organization owner/admin, **When** they view or edit their own Planner permissions, **Then** the action is allowed, and disabling their own module access afterward does not remove their standing organization authority to re-enable or reconfigure it later.

---

### User Story 4 - An authorized manager disables and later restores someone's Bendie Planner access (Priority: P2)

A manager can turn Bendie Planner access off for someone without deleting their configuration, and later turn it back on to find their previously configured permissions exactly as they left them.

**Why this priority**: Access needs to be revocable without being destructive — deactivation, not deletion, is the established pattern this feature must follow, and losing a manager's prior deliberate configuration on re-enable would be a real regression risk.

**Independent Test**: As an authorized manager, disable Planner access for someone with custom-configured permissions, confirm they immediately lose Planner capability, then re-enable access and confirm their exact prior module configuration is restored rather than reset to role-derived defaults.

**Acceptance Scenarios**:

1. **Given** a person with active, configured Planner access, **When** the manager disables it, **Then** their assignment becomes inactive while its module flags and identity remain intact, and Feature 007's Tasks module immediately stops granting them any capability.
2. **Given** a person whose access is currently disabled, **When** the manager re-enables it, **Then** the assignment becomes active again with the same module flags it held before disabling — never reset to role-derived defaults.
3. **Given** a person whose access has never been explicitly configured before being disabled, **When** it is re-enabled, **Then** the same "not yet configured" state applies as before (role-derived defaults may still apply automatically).

---

### User Story 5 - Removing an event member safely winds down their Bendie Planner access (Priority: P2)

When an authorized manager removes someone from an event's membership, their Bendie Planner access is deactivated rather than deleted, so that Feature 007 tasks still referencing them continue to display correctly.

**Why this priority**: Prevents a data-integrity regression in an already-shipped feature (Feature 007's historical-assignee display) and matches this feature's own "deactivate, don't delete" principle.

**Independent Test**: Remove an event member who has active Planner access and an assigned Feature 007 task, then confirm their Planner assignment is now inactive (not deleted) and the task still renders their name with a "no longer active" indication exactly as Feature 007 already specifies.

**Acceptance Scenarios**:

1. **Given** an event member with active Planner access, **When** they are removed from the event, **Then** their Planner assignment becomes inactive; it is never deleted.
2. **Given** the Planner-side deactivation fails at the moment of removal, **When** the member removal itself has already succeeded, **Then** the removal is not rolled back or blocked, and the system retains enough information to retry or reconcile the Planner-side deactivation afterward rather than silently leaving it active forever.

---

### User Story 6 - Automatic sync keeps working safely for everyone who has never been manually configured (Priority: P3)

For any event member whose Planner permissions have never been touched through this feature's explicit configuration screen, the existing automatic, role-derived synchronization continues to behave exactly as it does today — this feature changes nothing for them.

**Why this priority**: Backward compatibility is a hard requirement, not a nice-to-have — most existing staff-tier members have never been manually configured and must see zero behavior change.

**Independent Test**: For an event member who has never had their Planner permissions explicitly configured, trigger one of today's existing automatic-sync events for them (e.g. re-adding them via the Members page, a CSV import row, or the Feature 004 event-creator auto-provision — the only paths that call `syncStaffMemberToPlanner` today) and confirm their Planner permissions are still re-derived exactly as `plannerStaffSync.ts` behaves today. Separately, confirm that merely editing their Portal event role in place (with no add/re-sync action) has no automatic Planner-side effect, matching today's behavior — no role-change-triggered sync exists today, and this feature does not introduce one.

**Acceptance Scenarios**:

1. **Given** a staff-tier event member whose `planner_permissions_configured_at` is unset, **When** an existing automatic-sync-triggering action occurs for them (add, re-add, CSV import, or event-creator auto-provision), **Then** their Planner module permissions are re-derived from their current role exactly as today's automatic sync does.
2. **Given** the same unconfigured member, **When** an unrelated Planner-sync-triggering event occurs (e.g. a re-sync action), **Then** their `is_active` state and permissions continue to follow the existing automatic logic without requiring this feature's involvement.
3. **Given** the same unconfigured member, **When** only their Portal event role is edited in place with no add/re-sync action attached, **Then** no automatic Planner-side change occurs, consistent with today's behavior (`changeRole` does not itself invoke Planner sync).

---

### User Story 7 - Every meaningful Planner access/permission change is recorded (Priority: P3)

Whenever Planner access is enabled, its permissions are changed, it is disabled, or it is reactivated, the system records who did it, for whom, on which event, what changed, and when — without exposing a history UI in this feature.

**Why this priority**: A lightweight accountability trail is a locked requirement for this feature, but it is explicitly not user-facing yet — lower priority than the functionality it observes, but still a required foundation so a future feature can build history/audit UI without a model change.

**Independent Test**: Perform an enable, a permission change, a disable, and a reactivation for the same person, then confirm a server-side record exists for each action with the correct event, member, actor, before/after state, and timestamp — derived entirely server-side, never from client-supplied actor or timestamp values.

**Acceptance Scenarios**:

1. **Given** any of the four tracked action types occurs, **When** it completes successfully, **Then** exactly one corresponding record is created capturing the event, the affected member, the authenticated actor, the action type, the prior state, the resulting state, and a server-generated timestamp.
2. **Given** a client attempts to submit an actor identity or timestamp as part of a permissions request, **When** the request is processed, **Then** any such client-supplied values are ignored in favor of server-derived values.
3. **Given** a retry after a partial failure re-applies the same logical action, **When** the retry succeeds, **Then** it does not produce duplicate records for what is logically one operation.

---

### Edge Cases

- A manager opens the permissions panel for an event that has no active Bendie Planner entitlement, no canonical Planner link, or a pending/failed Planner provisioning state: the panel reflects that state using the same vocabulary Features 005/007 already established, never a distinct new "unavailable" message.
- A manager attempts to enable Planner access for someone who is not currently a member of this Portal event at all: rejected — this feature can only configure access for existing event members.
- Two authorized organization admins edit the same person's permissions at nearly the same moment: the later successful write wins; no merge, no corruption — an accepted limitation consistent with Feature 007's own concurrency precedent.
- A manager enables Manage on a module while View is unchecked: the system corrects this to View-and-Manage both true, both client-side (immediate feedback) and server-side (authoritative), never persisting Manage-true/View-false.
- A manager unchecks View on a module where Manage is currently true: Manage is also cleared, both client-side and server-side.
- A manager submits an `access_role` value directly (e.g. via a replayed or hand-crafted request): the submitted value is ignored; the server always derives it from the resulting manage-flag state.
- Identity provisioning succeeds but the Planner assignment write fails (or vice versa): the manager sees a distinct "partially set up — try again" state, and retrying is safe to run in full again.
- The Planner assignment write succeeds but the Portal-side `planner_permissions_configured_at` update fails: the Planner-side change is not reverted; the marker is corrected on a later read/retry rather than the manager's edit being silently lost.
- The Planner assignment write succeeds but the audit record write fails: the permission change still stands; the audit gap does not block or reverse the change, and the audit record can be safely retried without duplicating the underlying permission change.
- An organization owner/admin disables their own Planner module access: they retain full authority to view and re-enable it, since that authority was never derived from a Planner flag.
- A person's Planner identity can be resolved (existing account) but their Portal event role has no defined default mapping (should not occur given the fixed role set, but if a role value is ever unrecognized, the system treats it as the non-elevated default rather than failing).
- A member with Planner access removed via bulk/CSV-driven event-member removal receives the same deactivation treatment as a single removal — no separate bulk-only code path with different behavior.
- A person who was explicitly configured, then removed from the event (hard-deleting their `event_members` row and its marker), then later re-added: they are treated as never-configured per FR-041a; if a subsequent automatic-sync-triggering action re-derives their permissions from their (possibly different) new role, this is accepted, deterministic reset behavior, not a defect — a manager who wants to preserve a specific configuration across a removal must reconfigure it after re-adding.
- Editing an existing event member's role in place (the `changeRole` action) does not itself trigger any Planner-side change today, for either a configured or unconfigured member — automatic sync only ever runs from an add/re-add/CSV/event-creation path, never from a bare role edit; this feature does not change that trigger surface.

## Requirements *(mandatory)*

### Functional Requirements

**Product / event gating**

- **FR-001**: The Planner permissions surface MUST be available only for an event with an active Bendie Planner entitlement and an existing canonical Planner link (Planner-only or Both events); it MUST NOT be available for a Bendie-only event.
- **FR-002**: The Planner permissions surface MUST reuse the existing product/entitlement/link/provisioning states already established by Features 002–007 (inactive entitlement, missing link, provisioning pending, provisioning failed) rather than introducing a second state vocabulary.
- **FR-003**: Feature 003 event-workspace access MUST be established before any Planner-permission-specific check is evaluated.
- **FR-004**: Opening the Planner permissions surface for a given member MUST NOT, by itself, trigger Planner identity or assignment creation.

**Who may administer permissions**

- **FR-005**: Only a Portal platform admin, or an organization owner/admin of the event's own organization, MAY view or change any person's Bendie Planner access or module permissions.
- **FR-006**: No event role (host, organizer, admin, facilitator, staff, speaker, attendee) MAY, by itself, confer authority to administer Planner permissions.
- **FR-007**: No Planner module-manage flag (`can_manage_tasks`, `can_manage_checklist`, `can_manage_vendors`, or any future manage flag) MAY, by itself, confer authority to administer Planner permissions.
- **FR-008**: Every read and write operation involved in permission administration MUST independently re-verify the FR-005 authorization server-side, regardless of what the UI does or does not display.
- **FR-009**: An authorized organization owner/admin or platform admin MAY view and edit their own Planner permissions under the same rules as anyone else's.
- **FR-010**: Disabling a person's own Planner module access MUST NOT remove their standing Portal organization/platform authority to administer permissions (including their own) afterward.

**Planner permission surface**

- **FR-011**: The permissions surface MUST represent exactly the seven modules and their currently live flags: Overview (view only), Production (view only), Logistics (view only), Tasks (view + manage), Notifications (view only), Checklist (view + manage), Vendors (view + manage).
- **FR-012**: The permissions surface MUST NOT display a Manage control for any module that has no live manage flag; it MUST NOT be rendered in a disabled/greyed state either — it simply MUST NOT appear.
- **FR-013**: This feature MUST NOT introduce new Planner-side manage-capability columns for Overview, Production, Logistics, or Notifications.
- **FR-014**: The permissions surface MUST present all permission and access concepts using plain access/permission language (e.g. "Enable Bendie Planner access," module names, "View"/"Manage"); it MUST NOT display `planner_profile_id`, assignment IDs, Planner event IDs, or any other raw database identifier or Supabase-specific term.

**Portal role vs. Planner permission vs. administration authority**

- **FR-015**: This feature MUST treat Portal event role, Planner module permissions, and permission-administration authority as three independent concepts; no requirement in this feature may conflate them.
- **FR-016**: The Portal event role held by a member at the moment Planner access is first enabled for them MUST determine their initial module permission defaults, using the existing role-to-permission mapping (host/organizer/admin → full view plus every currently-supported manage flag; facilitator/staff/speaker → full view, no manage) without introducing a second, independent defaulting algorithm.
- **FR-017**: Initial role-derived defaults per FR-016 apply only at the moment access is first enabled for a person whose permissions have never been explicitly configured; they MUST NOT be reapplied once that person's permissions are manager-owned (see FR-021).
- **FR-018**: A later change to a person's Portal event role MUST NOT alter their Planner module permissions once those permissions are manager-owned (see FR-021).

**Explicit configuration and ownership**

- **FR-019**: Every module-permission save performed through this feature MUST write the actual resulting module flags to `event_user_assignments`, not a preset identifier.
- **FR-020**: The system MUST offer Viewer, Manager, and Custom as UI-only conveniences that populate the real module flags; no preset value MAY be persisted as its own field, and a flag combination that does not exactly match Viewer or Manager MUST be represented as Custom. The two presets MUST be defined precisely, across all seven modules, as: **Viewer** — every view flag (`can_view_overview`, `can_view_production`, `can_view_logistics`, `can_view_tasks`, `can_view_notifications`, `can_view_checklist`, `can_view_vendors`) true, and every manage flag (`can_manage_tasks`, `can_manage_checklist`, `can_manage_vendors`) false; **Manager** — every view flag true, and every manage flag also true. (These two exact combinations are already what `roleToPlannerFlags()` produces for facilitator/staff/speaker and for host/organizer/admin respectively, per FR-016 — the presets intentionally reuse the same two combinations as a manual, per-person convenience rather than a second defaulting algorithm.)
- **FR-021**: The first successful explicit permission configuration for a person MUST set a Portal-side marker (`event_members.planner_permissions_configured_at`) from unset to a server-generated timestamp; once set, it MUST NOT be cleared while the person remains an event member with a Planner assignment.
- **FR-022**: No Planner-side schema field may be added to represent the FR-021 marker; it is Portal-side bookkeeping only, and MUST NOT be treated as, or substitute for, the audit record required by FR-052–FR-058.

**View/Manage dependency rules**

- **FR-023**: For any module offering a manage capability, enabling Manage MUST result in View also being true, enforced identically on the client and re-validated on the server.
- **FR-024**: For any module offering a manage capability, disabling View while Manage is true MUST also disable Manage, enforced identically on the client and re-validated on the server.
- **FR-025**: The combination View=false with Manage=true MUST never be persisted under any circumstance, regardless of what the client submits.

**Access role derivation**

- **FR-026**: `access_role` MUST NOT be an editable field exposed to the manager; it MUST be treated as an internal, server-derived value.
- **FR-027**: `access_role` MUST be derived as `admin` when every currently-supported manage flag (`can_manage_tasks`, `can_manage_checklist`, `can_manage_vendors`) is true for the resulting permission state, and `member` otherwise.
- **FR-028**: Any `access_role` value submitted by a client MUST be ignored; the server-derived value per FR-027 always governs the write.

**Identity provisioning**

- **FR-029**: Planner identity resolution/creation MUST reuse the existing Feature 001 bridge and mechanism (`profiles.planner_profile_id`, `findOrCreatePlannerProfile`) unmodified in its matching/creation logic.
- **FR-030**: Identity provisioning MUST occur only as a direct result of an explicit "enable Bendie Planner access" action for a specific person — never as a side effect of viewing the permissions surface.
- **FR-031**: An existing Planner identity matching the member's email MUST be reused rather than a new one created.
- **FR-032**: Identity provisioning MUST be safely retryable: repeating the same enable action after a failure MUST NOT create a duplicate Planner identity or a duplicate event assignment.
- **FR-033**: A provisioning or assignment-write failure MUST surface a plain, human-readable state (e.g. "Couldn't set up Bendie Planner access — try again"); raw Planner database or Auth error text MUST NOT be shown to the manager.

**Assignment lifecycle**

- **FR-034**: Enabling Planner access for a person for the first time MUST, in order: resolve or create their Planner identity, then create (or reactivate) their `event_user_assignments` row, then apply the FR-016 initial defaults if their permissions have never been explicitly configured.
- **FR-035**: Saving explicit module-permission changes MUST write the resulting flags, derive `access_role` per FR-027, set the FR-021 marker if not already set, and record an audit entry (FR-052–FR-058) for the change.
- **FR-036**: Disabling Planner access for a person MUST set their assignment's `is_active` to false while preserving their module flags, their Planner identity, and the assignment row itself; it MUST record an audit entry.
- **FR-036a**: If `event_members.planner_permissions_configured_at` is still unset at the moment a manager explicitly disables a person's access (i.e., they were enabled and disabled without an intervening explicit Save), disabling MUST also set that marker, exactly as FR-035 already does for a Save. *(Added during `/speckit.analyze` — closes a gap the Enable-vs-Save split otherwise left open: without this, FR-045's "automatic sync MUST NOT reactivate a deliberately deactivated assignment" could not actually be enforced by the planned `plannerStaffSync.ts` guard for a member disabled before ever being explicitly configured, since that guard's only signal is this same marker. This does not change FR-041a — member removal still deletes the `event_members` row and this marker along with it, exactly as before.)*
- **FR-037**: Reactivating a previously disabled assignment MUST set `is_active` back to true and MUST restore the exact module permissions the assignment held immediately before being disabled; it MUST NOT reset those permissions to role-derived defaults, and MUST record an audit entry.
- **FR-038**: This feature MUST NOT expose any control that performs a hard delete of a Planner assignment.

**Member removal**

- **FR-039**: When an event member with active Planner access is removed from the event, their Planner assignment MUST be deactivated (`is_active = false`), never deleted.
- **FR-040**: Deactivation on member removal MUST preserve the assignment's module flags and the underlying Planner identity, so any Feature 007 task historically assigned to that person continues to render per Feature 007's existing historical-assignee rules.
- **FR-041**: If the member removal itself succeeds but the associated Planner-side deactivation fails, the member removal MUST NOT be blocked or reverted; the system MUST retain enough information to retry or reconcile the deactivation afterward rather than leaving Planner access silently active indefinitely.
- **FR-041a**: Member removal in this application is an existing, unmodified hard delete of the `event_members` row (verified live in `EventAssignmentsDropdown.tsx`), which necessarily also deletes that row's `planner_permissions_configured_at` marker, even though the corresponding Planner `event_user_assignments` row survives (deactivated, per FR-039). Consequently, if the same person is later re-added to the same event, their new `event_members` row MUST start with `planner_permissions_configured_at` unset, and they MUST be treated as never having been explicitly configured for the purposes of FR-016/FR-034/FR-042 — even though a prior, now-inactive Planner assignment for them may still exist and will be reused (per the existing upsert-on-`(event_id, profile_id)` pattern, FR-047) and may have its flags re-derived from their (possibly new) role the next time an automatic-sync-triggering action runs for them. This is an accepted, deterministic reset on re-add, consistent with this application's existing member-removal semantics; this feature does not add a second, more durable storage location for the marker to survive row deletion.

**Automatic sync compatibility**

- **FR-042**: For any event member whose `planner_permissions_configured_at` is unset, automatic role-derived synchronization MUST continue to operate exactly as it does today, with no behavior change introduced by this feature.
- **FR-043**: For any event member whose `planner_permissions_configured_at` is set, automatic synchronization MUST NOT recompute or overwrite their `can_view_*`/`can_manage_*`/`access_role` values from their Portal event role.
- **FR-044**: For a member whose `planner_permissions_configured_at` is set, automatic synchronization MAY still ensure their Planner identity exists and MAY ensure assignment-row existence/consistency, but MUST NOT change their configured module flags.
- **FR-045**: Automatic synchronization MUST NOT reactivate (`is_active = true`) a Planner assignment that this feature has deliberately deactivated, as a side effect of an unrelated role-change sync.

**Cross-database sequencing, idempotency, and partial failure**

- **FR-046**: A Planner permission or access change MUST NOT be described or implemented as a single atomic transaction spanning both Supabase projects; the system MUST instead define and follow a deterministic write order across (1) Planner identity, (2) the Planner `event_user_assignments` write, (3) the Portal-side `planner_permissions_configured_at` marker, and (4) the Portal-side audit record.
- **FR-047**: The Planner `event_user_assignments` write MUST use the existing upsert-on-`(event_id, profile_id)` pattern already established by `plannerStaffSync.ts`, so a retry after a transient failure resolves to the same row rather than creating a duplicate.
- **FR-048**: If the Planner-side write (identity or assignment) succeeds but the Portal-side marker write fails, the Planner-side change MUST stand as the source of truth; the marker MUST be reconcilable on a subsequent read or retry rather than the manager's change being silently reverted.
- **FR-049**: If the Planner-side write succeeds but the audit write fails, the permission/access change MUST stand; the audit gap MUST be safely retryable without duplicating the underlying permission change.
- **FR-050**: A manager retrying the same logical action (enable, save, disable, reactivate) after a partial failure MUST NOT produce duplicate Planner identities, duplicate assignment rows, or duplicate audit records for that one logical operation.
- **FR-051**: Concurrent edits by two different authorized administrators to the same person's permissions MAY resolve as last-write-wins; no optimistic-locking/version column is required or introduced by this feature.

**Audit**

- **FR-052**: The system MUST record a server-side, append-only entry for at least each of: Planner access enabled, Planner permissions changed, Planner access disabled, Planner access reactivated.
- **FR-053**: Each audit entry MUST capture: the event, the affected member, the actor who performed the change, the action type, the permission/access state before the change, the permission/access state after the change, and a timestamp.
- **FR-054**: The actor identity and the timestamp on every audit entry MUST be derived server-side from the authenticated session; the client MUST NOT be able to supply or override either value.
- **FR-055**: Audit entries MUST be append-only; they MUST NOT be edited or deleted through this feature.
- **FR-056**: Audit entries MUST NOT be treated as the authoritative source of current permissions; `event_user_assignments` remains authoritative for current state at all times.
- **FR-057**: This feature MUST NOT expose any audit-history viewing UI; the audit structure MUST be designed so a future feature can build such a UI without requiring a change to the core permission model.
- **FR-058**: A retry of a partially-failed action MUST NOT create more than one audit entry representing that one logical operation.

**Members experience integration**

- **FR-059**: The Bendie Planner permissions surface MUST be reached from the existing event Members experience, scoped to a specific member, rather than introduced as a new top-level Planner module.
- **FR-060**: The permissions surface MUST be shown only when the event has active Bendie Planner entitlement per FR-001; it MUST NOT appear for events without it.
- **FR-061**: The permissions surface MUST show, at minimum: whether Bendie Planner access is enabled for this person, and — when enabled — the Viewer/Manager/Custom state plus each module's applicable View/Manage controls per FR-011/FR-012.
- **FR-062**: This feature MUST NOT require a broader redesign of the Members list or page beyond adding the entry point to this surface.

**Feature 007 compatibility**

- **FR-063**: This feature MUST NOT change how Feature 007 interprets `can_view_tasks`/`can_manage_tasks`, nor its self-assignee restrictions; it changes only who may configure those underlying flags.
- **FR-064**: No change to `resolveTaskCapability` or any other Feature 007 read path is required or permitted by this feature.

### Security Requirements

- **SR-001**: An ordinary event member (any role that is not organization owner/admin or platform admin) MUST be denied both read and write access to any person's Planner permissions.
- **SR-002**: An event host/organizer/admin MUST NOT be granted permission-administration authority solely by virtue of that event role (restates FR-006 as a security boundary).
- **SR-003**: A caller holding `can_manage_tasks` MUST NOT be able to escalate their own or anyone else's Planner permissions through this feature (restates FR-007).
- **SR-004**: A caller holding `can_manage_checklist` or `can_manage_vendors` MUST NOT be able to escalate permissions through this feature, under the same rule as SR-003.
- **SR-005**: All permission-administration operations MUST be scoped to a single resolved event and a single resolved organization; cross-event or cross-organization editing MUST be rejected, consistent with Feature 003's existing workspace-scoping rules.
- **SR-006**: A client MUST NOT be able to submit an arbitrary `planner_profile_id`; identity MUST always be resolved server-side via the existing Feature 001 bridge.
- **SR-007**: A client MUST NOT be able to submit an arbitrary Planner event ID; the canonical event MUST always be resolved server-side via `event_planner_links`, per existing Features 001/004/005/007 precedent.
- **SR-008**: A client MUST NOT be able to submit an arbitrary `access_role` value; it is always server-derived per FR-027/FR-028.
- **SR-009**: Planner access MUST NOT be assignable to anyone who is not currently an explicit member of the Portal event in question.
- **SR-010**: An inactive or removed event member MUST NOT retain effective Planner capability; deactivation per FR-039 MUST take effect immediately for authorization purposes.
- **SR-011**: No caller may elevate their own permission-administration authority through this feature; that authority derives solely from `organization_members`/`profiles.global_role` and is never a value this feature writes (restates FR-010).
- **SR-012**: Every mutation exposed by this feature MUST independently re-verify the SR-001/FR-005 authorization check on the server immediately before acting, regardless of any prior client-side or page-level check.
- **SR-013**: No audit entry's actor or timestamp may be forged or supplied by the client (restates FR-054).
- **SR-014**: Planner service-role credentials MUST never be reachable from the browser at any point in this feature's flows.
- **SR-015**: The list of people eligible for Planner-permission configuration MUST be scoped strictly to existing event members of the resolved Portal event; no organization-wide or Planner-wide profile search/enumeration MAY be exposed through this feature.
- **SR-016**: A stale or replayed permission-mutation request MUST be evaluated against current server-side state at the time it is processed, not against any client-cached state; the accepted concurrency behavior remains last-write-wins per FR-051.
- **SR-017**: Automatic role-derived synchronization MUST NOT overwrite explicitly configured (`planner_permissions_configured_at` set) permissions under any code path, scheduled or triggered (restates FR-043).
- **SR-018**: API responses from this feature's routes MUST NOT include raw Planner error objects, stack traces, or any column outside an explicit, documented, safe allowlist.

### Key Entities

- **Planner Event Assignment** (`event_user_assignments`, existing, now writable by this feature): the per-event, per-profile Planner permission record — `is_active`, `access_role`, and the seven view/three manage flags. Remains the sole authoritative source of current Planner permissions.
- **Planner Profile** (`profiles`, Planner project, existing): the Planner-side identity bridged from a Portal user via `profiles.planner_profile_id` (Feature 001); provisioned by this feature only through the existing, unmodified `findOrCreatePlannerProfile` mechanism.
- **Event Member** (`event_members`, Portal, existing, gains one new field): gains `planner_permissions_configured_at` (nullable timestamp) — the one-way marker distinguishing "role-derived defaults still apply" from "manager-owned, never auto-overwritten."
- **Planner Permission Change Record** (new, Portal-side, append-only): one entry per tracked action (enable / permission change / disable / reactivate), capturing event, member, actor, action type, prior state, resulting state, and timestamp. Never authoritative for current permissions; exists solely for accountability and future audit-UI reuse.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Bendie Planner access enable/disable/reactivate actions performed by an authorized manager complete without the manager ever seeing a raw database identifier or Supabase-specific term.
- **SC-002**: 100% of permission-administration attempts by a caller who is not an organization owner/admin or platform admin — including one who holds a Planner module-manage flag — are denied, both via the UI path and a direct API call, in tested scenarios.
- **SC-003**: 100% of people whose permissions have been explicitly configured retain their exact configuration across at least one subsequent, unrelated Portal event-role change.
- **SC-004**: 100% of people who have never been explicitly configured continue to be governed by today's automatic role-derived sync with zero observable behavior change.
- **SC-005**: 100% of tested retry-after-partial-failure scenarios (identity provisioning, assignment write, marker write, audit write) resolve without creating a duplicate identity, assignment, or audit record.
- **SC-006**: 100% of tested member-removal scenarios leave the removed person's historical Feature 007 task assignments rendering correctly, per Feature 007's existing historical-assignee display rule.
- **SC-007**: 100% of tracked action types (enable, permission change, disable, reactivate) produce exactly one corresponding audit record per logical operation in tested scenarios, with actor and timestamp always server-derived.
- **SC-008**: 0% of tested attempts to submit a client-side `access_role`, arbitrary `planner_profile_id`, or arbitrary Planner event ID are honored by the server.

## Assumptions

- The Members experience remains the correct integration point for this feature's entry point, per the Feature 008 architecture pass's explicit recommendation; no new top-level Planner module is introduced.
- The exact visual/interaction design of the per-member permissions surface (panel, drawer, or modal) is a planning/implementation-level decision, not a specification-level one, so long as FR-059–FR-062 hold.
- The exact schema shape of the new Planner Permission Change Record (table name, columns beyond what FR-053 requires) is a planning-level decision; this specification only requires that it satisfy FR-052–FR-058.
- `roleToPlannerFlags()`'s existing role-to-permission mapping is treated as the correct and sufficient initial-defaults algorithm for FR-016; this feature does not re-evaluate whether that mapping itself is ideal.
- The live Planner schema facts recorded in Context (columns, RLS, constraints) reflect the current production Planner database as of 2026-09-20 and are treated as authoritative ground truth for this specification.
- "Organization Owner" and "Organization Admin" map to the existing live `organization_members.role` values `owner` and `admin` respectively; no new role value is introduced.
- A single small, additive Portal-side schema column (`event_members.planner_permissions_configured_at`) is expected; no Planner-side schema change is expected or permitted by this feature.

## Dependencies

- **Feature 001** — the Portal↔Planner identity bridge (`profiles.planner_profile_id`, `findOrCreatePlannerProfile`) and the existing automatic sync (`plannerStaffSync.ts`), both reused rather than replaced.
- **Feature 002** — organization/event product entitlement (`organization_products`, `event_products`), which gates whether this feature's surface appears at all.
- **Feature 003** — event-workspace access as the access floor, and the organization owner/admin distinction this feature raises to a ceiling for permission administration.
- **Feature 004** — `event_planner_links`, the sole mechanism for resolving an event's canonical Planner counterpart.
- **Feature 005** — the established provisioning-state vocabulary (pending/failed/etc.) this feature reuses rather than duplicating.
- **Feature 006** — product-context gating, ensuring this surface only appears where Bendie Planner is genuinely active for the event.
- **Feature 007** — the first, and so far only, real consumer of the permissions this feature configures; left entirely unmodified in its own read logic.

## In Scope

- Manager-facing Bendie Planner access state per event member: enable, disable, reactivate.
- Explicit, manager-triggered Planner identity provisioning (replacing the current silent side effect for anyone this feature touches).
- Module permission editing across the seven modules, view/manage-where-it-exists.
- Viewer/Manager/Custom UI conveniences that resolve to real, persisted module flags.
- The manual-configuration ownership marker and the resulting change to automatic-sync behavior.
- The organization-owner/admin/platform-admin-only authorization boundary for permission administration, enforced server-side on every operation.
- Member-removal deactivation behavior for Planner assignments.
- Server-side, append-only, lightweight audit recording for the four tracked action types.
- Deterministic sequencing, idempotency, and partial-failure handling across the two Supabase projects for every write this feature performs.
- Integration into the existing Members experience, scoped to Planner-entitled events (Planner-only and Both).

## Out of Scope

- Production, Logistics, Checklist-content, Vendors-content, or Notifications *module management* (this feature only configures who can view/manage those modules, not their content).
- Participants management.
- Any new Planner-side `can_manage_*` schema column.
- A full audit-history viewing UI (the underlying record is required; a UI to browse it is not).
- Organization billing, entitlement purchasing, or entitlement administration.
- Any broad redesign of Portal's visual design system or of the Members list/page beyond this feature's entry point.
- Any change to Feature 003's workspace-authorization model itself.
- Feature 009 and Feature 010 functionality of any kind.
