# Feature 011 Spec: Bendie Planner People & Participant Identity

Rapid-implementation lightweight spec. Not a Staff & Permissions extension (Feature 008 owns that) — this feature owns the separate operational **participant/attendee** identity that Flights (012) and Ground Transport (013) will depend on.

## Scope

Portal event workspace module for viewing and maintaining the canonical Bendie Planner participant roster for one event: `passengers` (global person identity) joined to the event via `event_passengers` (event participation link).

## Canonical Model (verified live, this pass)

- **`passengers`** — global, person-level identity. Columns: `passenger_id` (PK), `full_name` (required), `title`, `passport`, `dietary_requirements`, `gender`, `email`, `phone`, `created_at`, `updated_at`. No `event_id` — the same passenger row is reused across every event they attend. **342 live rows, 337 with no email/phone at all** — contact info is commonly absent; do not require it.
- **`event_passengers`** — the event-participation join. `event_passenger_id` (PK), `event_id` → `events`, `passenger_id` → `passengers`, `created_at`. `UNIQUE(event_id, passenger_id)` — one passenger can only be linked to a given event once, but **can belong to multiple events** (verified live — several passengers already span 2 events).
- Flights (`all_flights_combined_table`) and Hotels (`hotel_bookings`) both FK directly to `passengers.passenger_id` — confirming `passenger_id` is the correct canonical reference for Features 012/013 to build on.
- No triggers exist on either table (verified) — no auto-`updated_at` stamping, no notification generation, no `auth.uid()`-dependent logic. Simpler lifecycle than Tasks/Vendors/Checklist; Portal must set `updated_at` itself on edit.
- No FK from `passengers`/`event_passengers` to `profiles` or `event_user_assignments` — participants are a **structurally separate population from Planner staff**, confirmed. A participant never requires a Planner Auth account, a `profiles` row, or an `event_user_assignments` row.

## Authorization (locked product decision)

Feature 008 has no `can_view_people`/`can_manage_people` flag, and none was invented. Live RLS shows `passengers` allows `SELECT` to any authenticated user but has **no** write policy for anyone; `event_passengers` has **zero** RLS policies at all (service-role only). No SECURITY DEFINER function exists to create/edit either table — even Planner's own client has no ordinary-user write path here. Locked authority model:

- **View**: Portal event workspace access (`requireEventWorkspaceAccess`) **and** (a Portal org owner/admin or platform admin, **or** a Planner platform admin, **or** any *active* `event_user_assignments` row for the event — regardless of which flags it holds).
- **Manage** (add/edit/remove): `canAdministerPlannerPermissions` (Portal org owner/admin of the event's own org, or Portal platform admin) **or** a Planner platform admin. Ordinary Planner staff assignments — even Task/Vendor/Checklist managers — do **not** get participant-management rights merely by holding those flags (rejected option, per explicit product decision this pass).

This mirrors Feature 008's own precedent for "a Planner domain with no dedicated permission flag."

## Supported Capabilities

- **View** — participant roster for the resolved Planner event: name, title, passport, dietary requirements, gender, email, phone, when added.
- **Add — new person**: create a new `passengers` row + link it to the event in one operation.
- **Add — existing person**: search the global `passengers` pool and link an existing person to this event (no new `passengers` row). Required because passengers are legitimately reused across events (verified live).
- **Edit**: update a linked participant's identity fields. Because `passengers` is global, an edit is visible from every event that participant is linked to — this is expected, correct behavior given the schema shape, not a bug.
- **Remove from event**: deletes the `event_passengers` link only. The global `passengers` record, and any other event's link to it, is untouched.
- **No global hard-delete of a `passengers` record** — deliberately excluded (see Exclusions).

## Verified Business Rules

1. A participant can belong to multiple events; adding an existing participant must not create a duplicate `passengers` row.
2. `event_passengers` enforces `UNIQUE(event_id, passenger_id)` — attempting to link an already-linked participant must fail cleanly (`already_linked`), not silently duplicate or crash.
3. Editing a participant mutates the shared, global `passengers` record — changes are visible from any other event that participant is linked to.
4. Removing a participant from an event deletes only the `event_passengers` row; the `passengers` record survives for reuse and for any other event's history.
5. `full_name` is the only required field; every other identity field may be absent (matches live data: 98%+ of existing passengers have no email/phone on file).
6. No lifecycle/status concept exists for participants (no stage flags, no approval workflow) — this module is pure identity/roster management.
7. `passport` is a sensitive PII field. It is exposed and editable to Manage-level access holders only, with no masking — consistent with this tool's existing operator-trust model (no other Portal module masks PII either). Flagged for awareness, not held back.
8. Search results for "add existing" are **not** scoped to the caller's own organization — `passengers` is genuinely global in Planner's own schema (its own RLS already allows any authenticated user to read every passenger, across every org/event). Portal does not add a narrower scope Planner's own data model doesn't have; this is an inherited platform characteristic, not a defect introduced here.

## Authorization / Security Requirements

- Every request resolves Portal `eventId` → workspace access → active `event_planner_links` → Planner `event_id`. The browser never supplies an authoritative Planner event ID.
- Every mutation (edit, remove) re-verifies capability server-side and independently re-verifies the target participant is actually linked to the resolved event (a `passenger_id` linked only to a different event returns `404`, identical to "doesn't exist" — no cross-event existence leak).
- Manage-only actions: add (new or existing), edit, remove. View-only callers get zero usable mutation controls.
- Works identically for Planner-only and Both events; absent entirely for Bendie-only events (tab doesn't apply).

## Acceptance Criteria

1. A Manage-capable user can list, add (new), add (existing), edit, and remove a participant; all changes are visible immediately in the canonical `event_passengers`/`passengers` tables.
2. A View-only (active-assignment, non-admin) caller can see the roster but has no mutation controls, and the server independently rejects any mutation attempt from that caller.
3. A caller with no workspace access, no active Planner assignment, and no Portal admin/org-admin authority is denied both view and manage.
4. Linking an already-linked participant is rejected with a clear, non-crashing error.
5. Removing a participant from Event A does not affect their link to Event B, nor delete the underlying `passengers` record.
6. Editing a participant from Event A's workspace is reflected when viewing them from Event B's workspace (same global record).
7. The module is available and fully functional for a Planner-only event, with no dependency on the Bendie product.
8. Tasks, Vendors, Checklist, and Feature 008 staff/permissions are unaffected by this feature's routes or capability resolution.

## Exclusions

- No hard delete of a global `passengers` record (verified FK behavior: `hotel_bookings.passenger_id` has `ON DELETE NO ACTION`, meaning a delete would outright fail if any hotel booking references that passenger, and `all_flights_combined_table.passenger_id` is `ON DELETE SET NULL`, which would silently orphan flight history — both outcomes are unsafe to expose in a rapid MVP with no undo).
- No CSV bulk import in this pass — no existing generic CSV-import utility was found to reuse without materially expanding this feature's scope; documented as a follow-up, not attempted here.
- No new `event_user_assignments` permission flag introduced.
- No changes to Feature 008's staff/permission administration, Tasks, Vendors, or Checklist.
- No Ground Transport work — `passenger_vehicle_assignments`/`vehicle_passengers`' ambiguous canonical model (per the coverage audit) is explicitly out of scope and left for Feature 013's own discovery pass.
- No org-scoping added to the global passenger search — matches Planner's own existing, already-permissive data model (see Verified Business Rule 8).
