# Feature 013 Spec: Bendie Planner Ground Transport

Rapid-implementation lightweight spec. Extends the existing Feature 012 Logistics workspace with a third sub-tab. Canonical model already resolved during targeted discovery (`context/planner-backend-coverage-audit.md` §4.4) — this spec records the decision, not re-derives it.

## Scope

Third Logistics sub-tab: **Ground Transport**. Manages the canonical three-tier hierarchy: **Movement** (route/date/time grouping) → **Vehicle(s)** (a per-event vehicle instance under a movement) → **Passenger Assignment(s)** (one participant riding one vehicle).

## Canonical Model (locked, from discovery)

- **`transport_movements`** — CANONICAL ACTIVE. `movement_id` (PK), `event_id` (required), `movement_name`, `route`, `movement_date`, `pickup_time`, `notes`, `created_at`. `UNIQUE(event_id, route, movement_date, pickup_time)`.
- **`vehicles`** — CANONICAL ACTIVE. A per-event, per-run vehicle instance, **not** a fleet master. `vehicle_id` (PK), `event_id` (required), `movement_id` (required FK → `transport_movements`), `date`, `route`, `pickup_time`, `end_time`, `vehicle_type`, `vehicle_no`, `max_capacity`, `status`, `notes`, `note_type`. `current_pax`/`names`/`num_pax` are **not exposed** — unmaintained under the current model (no trigger keeps them accurate); occupancy is always computed live from active `passenger_vehicle_assignments`.
- **`passenger_vehicle_assignments`** — CANONICAL ACTIVE, the sole write target for passenger-to-vehicle assignment. Mutated **only** via Planner's own RPCs: `assign_or_board_passenger`, `move_passenger_to_vehicle`, `unassign_passenger_from_vehicle`. Never hand-written INSERT/UPDATE — these RPCs already correctly implement the "already assigned elsewhere → move" state machine and `moved_from_vehicle_id` history.
- **Legacy, never written to**: `vehicle_boardings`, `vehicle_passengers`, `transport_logistics`. **Out of scope, never used**: `shuttles` (no event FK, not part of the canonical model).
- **No driver model exists anywhere in canonical schema.** No driver picker, driver record, or driver field is implemented.
- **No Hotel relationship exists.** Pickup/drop-off locations are free text (`route`) only.
- **Flight relationship is optional**: `passenger_vehicle_assignments.passenger_record_id` → `all_flights_combined_table.record_id`, never required by the RPCs.

## Participant Model

Reuses Feature 011 exactly — `passengers.passenger_id` + `event_passengers`. The live `trg_validate_passenger_vehicle_assignment` trigger already enforces this at the database level; Portal additionally re-verifies event membership (via `plannerPeople.ts`'s `getParticipant`) **before** invoking any assignment RPC, never relying on the trigger alone as the authorization boundary.

## Supported Operations

- **Movements**: list, create, edit, delete (blocked with a clear error if any vehicle still references it — matches the live `NO ACTION`/required-FK behavior; never cascade-deletes).
- **Vehicles**: list (nested under their movement), create (under a selected movement — Movement-first, Vehicle-second creation order, per locked UX decision), edit, delete (blocked with a clear error if any assignment — active or historical — references it, preserving assignment history).
- **Passenger assignment**: assign (participant → vehicle), move (vehicle → different vehicle, same movement — matches the RPC's own scoping), unassign (removes only the Ground Transport assignment; never touches `event_passengers` or the global `passengers` record).
- **Occupancy**: always computed as a live count of `is_active=true` assignments per vehicle, never read from `current_pax`/`num_pax`.
- **Optional Flight link**: a manager may associate an assignment with one of the participant's own Flight legs (`passenger_record_id`); validated to belong to the same passenger and event.

## Authorization (reused from Feature 012, not duplicated)

Identical to Flights/Hotels — same permission domain, same functions: **View** = `can_view_logistics` on an active assignment, or `canAdministerPlannerPermissions`, or Planner platform-admin. **Manage** = `canAdministerPlannerPermissions` or Planner platform-admin only. No new flag invented; `resolveLogisticsCapability`/`canAdministerPlannerPermissions` are called exactly as Flights/Hotels already do.

## Security Requirements

- Every mutation resolves Portal `eventId` → workspace access → active `event_planner_links` → Planner `event_id` before touching any Ground Transport data; the browser never supplies an authoritative Planner event ID.
- Before invoking any Planner RPC, Portal independently verifies: the caller has Manage capability, the target passenger belongs to the resolved event (Feature 011), the target vehicle belongs to the resolved event, and (for create-vehicle) the target movement belongs to the resolved event. The RPC/trigger's own validation is a second, not the only, line of defense.
- Movement/vehicle item-scope checks return 404 for both "doesn't exist" and "belongs to a different event," never leaking cross-event existence.

## Acceptance Criteria

1. A Manage-capable caller can create a movement, add a vehicle to it, assign a participant, move them to another vehicle in the same movement, and unassign them — all via the canonical RPCs, all reflected immediately in `passenger_vehicle_assignments`.
2. A View-only caller sees the full movement/vehicle/assignment structure but has no mutation controls; the server independently rejects every mutation attempt.
3. Deleting a movement with vehicles, or a vehicle with any assignment (active or historical), is rejected with a clear operational message, never a raw database error.
4. A cross-event movement, vehicle, or passenger ID is unusable through the current event's routes.
5. Displayed occupancy always matches a live count of active assignments, never a stored counter.
6. Unassigning a passenger leaves their Feature 011 participant record and event membership fully intact.
7. The module works fully for a Planner-only event.
8. Flights, Hotels, People, Tasks, Vendors, Checklist, and Staff/Permissions are unaffected.

## Exclusions

- No driver management of any kind.
- No fleet-master vehicle registry — vehicles remain per-event-run records.
- No Hotel FK/relationship.
- No new `event_user_assignments` permission flag.
- No hand-written state-machine logic duplicating the canonical RPCs.
- No cascading deletes.
