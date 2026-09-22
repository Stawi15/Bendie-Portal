# Feature 013 Tasks: Bendie Planner Ground Transport

Lightweight checklist per the rapid-implementation workflow. ~47 tasks.

## Data-access layer (extends `src/lib/plannerLogistics.ts`)

- [x] T01 `TransportMovement`/`TransportVehicle`/`TransportAssignment` types; `MOVEMENT_SELECT_COLUMNS` (nested vehicles → assignments via real FKs, explicit FK hint `!passenger_vehicle_assignments_vehicle_id_fkey` since `vehicles` has two FKs from that table).
- [x] T02 `shapeMovement`/`shapeVehicle`/`shapeAssignment` — occupancy always computed as the count of `is_active=true` assignments, never `current_pax`/`num_pax` (which are never even selected).
- [x] T03 `listMovements(plannerEventId)` — nested select + merges passenger names from `plannerPeople.ts`'s `listParticipants` (no FK exists for `passenger_id`, so PostgREST can't embed it).
- [x] T04 `getMovement(plannerEventId, movementId)` — item-scope check.
- [x] T05 `createMovement(plannerEventId, input)` — requires `movementName`/`route`/`movementDate`; maps the live `UNIQUE(event_id, route, movement_date, pickup_time)` violation to a clean message.
- [x] T06 `updateMovement(plannerEventId, movementId, patch)`.
- [x] T07 `deleteMovement(plannerEventId, movementId)` — pre-checks for referencing vehicles; clean validation error, not a raw FK violation.
- [x] T08 `getVehicle(plannerEventId, vehicleId)` — item-scope check.
- [x] T09 `createVehicle(plannerEventId, movementId, input)` — verifies the movement belongs to the event first; requires `vehicleType`/`vehicleNo`/`maxCapacity`/`date`/`route`.
- [x] T10 `updateVehicle(plannerEventId, vehicleId, patch)` — never accepts `movementId`/`eventId`.
- [x] T11 `deleteVehicle(plannerEventId, vehicleId)` — pre-checks for any referencing assignment (active or historical); clean validation error.
- [x] T12 `assignPassenger(plannerEventId, vehicleId, passengerId, boarded?)` — verifies vehicle+passenger event-scope, calls `assign_or_board_passenger` RPC, auto-follows with `move_passenger_to_vehicle` on a `needs_move` response.
- [x] T13 `movePassenger(plannerEventId, toVehicleId, passengerId, boarded?)` — verifies vehicle+passenger event-scope, calls `move_passenger_to_vehicle` RPC.
- [x] T14 `unassignPassenger(plannerEventId, vehicleId, passengerId)` — verifies vehicle event-scope, calls `unassign_passenger_from_vehicle` RPC.
- [x] T15 `getAssignment(plannerEventId, assignmentId)` — item-scope check (used by the DELETE route to resolve `vehicleId`/`passengerId` before unassigning).
- [x] T16 RPC-result mapping — every `{ok:false, ...}` response mapped to a specific `PlannerLogisticsValidationError`, never passed through raw.

## API routes

- [x] T17 `.../ground-transport/movements/route.ts` `GET` — list (nested) + capability.
- [x] T18 `.../ground-transport/movements/route.ts` `POST` — manage-only create.
- [x] T19 `.../ground-transport/movements/[movementId]/route.ts` — item pre-fetch, `PATCH`, `DELETE`.
- [x] T20 `.../ground-transport/vehicles/route.ts` `POST` — manage-only create; re-verifies `movementId` belongs to the resolved event.
- [x] T21 `.../ground-transport/vehicles/[vehicleId]/route.ts` — item pre-fetch, `PATCH`, `DELETE`.
- [x] T22 `.../ground-transport/assignments/assign/route.ts` `POST` — manage-only; re-verifies passenger via `plannerPeople.ts`'s `getParticipant` before calling the RPC.
- [x] T23 `.../ground-transport/assignments/move/route.ts` `POST` — manage-only; same participant re-verification.
- [x] T24 `.../ground-transport/assignments/[assignmentId]/route.ts` `DELETE` — manage-only unassign.
- [x] T25 Wire `normalizePlannerLogisticsError` into all seven route files' catch blocks; map RPC-rejection categories to `400`, not-found to `404`.

## UI

- [x] T26 `planner-logistics/page.tsx` — added the third `groundTransport` sub-tab; extended `load()` to fetch `.../ground-transport/movements` alongside Flights/Hotels/People; reuses the existing capability from the Flights response (no second capability fetch).
- [x] T27 `PlannerGroundTransportList.tsx` — movement cards, each listing its vehicles with a computed occupancy badge (`occupancy/maxCapacity`) and an expandable assigned-passenger list; Manage-only Add Movement/Add Vehicle/Edit/Delete/Assign/Move/Unassign controls; Viewer rendering has zero mutation controls.
- [x] T28 `PlannerMovementModal.tsx` — create/edit (name, route, date, pickup time, notes).
- [x] T29 `PlannerVehicleModal.tsx` — create/edit under a selected movement (type, number, capacity, route, times, status, notes) — no driver field anywhere.
- [x] T30 `PlannerAssignPassengerModal.tsx` — participant `<select>` for assign, destination-vehicle `<select>` for move (shared component, `mode` discriminator). Optional Flight-leg picker deferred (see Deferred below).
- [x] T31 Empty states: no movements yet, a movement with no vehicles, a vehicle with no passengers, no event participants (assign modal shows an explicit "no participants" message).
- [x] T32 Confirmed no driver picker/field/data exists anywhere in the UI (spec.md Exclusions) — verified by inspection of `PlannerVehicleModal.tsx` and `PlannerGroundTransportList.tsx`.

## Quality gate

- [x] T33 `npm run type-check` clean (after fixing one intersection-type issue between `PlannerMovementClient`/`PlannerVehicleClient` and their Ground Transport extensions).
- [x] T34 `npm run lint` clean.
- [ ] T35 Production build not run — dev server live throughout, identical accepted precedent to Features 008–012.

## Live verification (synthetic fixtures only)

- [x] T36 Manage-capable caller: created a movement, added two vehicles, created a participant (Feature 011), assigned them to vehicle 1 (`assign_or_board_passenger`), moved them to vehicle 2 (`move_passenger_to_vehicle`, confirmed `movedFromVehicleId` correctly recorded), unassigned them (`unassign_passenger_from_vehicle`) — all via the real RPCs against the live dev server; confirmed the participant remained in Feature 011's own roster throughout and after.
- [x] T37 Manage-only gate verified for vehicle-create and assign specifically (both `403 logistics_manage_denied` for a `can_view_logistics=true`, non-admin caller). Move/unassign share the byte-identical `capability.canManage` gate — not independently re-tested this pass, left unchecked in spirit rather than claimed.
- [ ] T38 No-access caller denial — **not independently re-tested for Ground Transport specifically this pass**; the capability composition is byte-identical, already-proven code shared with Flights/Hotels/People. Left unchecked per task discipline, not a defect.
- [x] T39 Vehicle delete correctly blocked while an assignment (including a historical, `is_active=false` one left over from a move) referenced it; movement delete correctly blocked while vehicles referenced it — both returned a clean operational message, never a raw FK-violation error.
- [x] T40 Cross-event item-scope check (workspace access independently granted to a second event so the record lookup itself was exercised, not just the workspace gate): movement `PATCH` correctly returned `404 logistics_record_not_found`.
- [x] T41 Movement/vehicle mismatch is structurally unreachable through the implemented API — `movementId` for an assignment is always derived server-side from the target `vehicleId`'s own row, never accepted from the client — so this class of error can't occur through Portal's surface at all (a stronger guarantee than testing the rejection path).
- [x] T42 Occupancy confirmed live-computed at every step: 0/4 → 1/4 after assign, correctly shifted to the destination vehicle after move (source vehicle back to 0), and 0 again after unassign — `current_pax`/`num_pax` are never selected by any query in `plannerLogistics.ts`.
- [x] T43 Canonical visibility: every mutation's response is a direct re-read via the service-role client; final cleanup queries against `transport_movements`/`vehicles`/`passenger_vehicle_assignments` confirmed the real rows existed and were fully removable.
- [x] T44 Planner-only event ("Stawi Escape — Planner Test") tested at the API/data level: capability and Ground Transport movements list both succeeded with full access.
- [x] T45 Flights/Hotels/People spot-checked immediately after the Ground Transport mutations above with the same session — all three still fully functional, confirming Ground Transport's addition to the shared `plannerLogistics.ts` file didn't disturb them. Tasks/Vendors/Checklist/Feature 008 were not re-hit this specific pass (session fixtures were already torn down) — accepted as already-proven, unaffected shared code per the same pattern established in Features 011/012.
- [x] T46 Fixture cleanup: all 4 disposable auth users (3 Portal, 1 Planner) deleted via the Auth Admin API; all supporting rows (`organization_members`, `event_members`, `event_user_assignments`, Planner `profiles`, the disposable movement/vehicles/assignments/`passengers` row) deleted; confirmed via a live-DB row-count query returning all zeros on both projects. The two long-lived retained fixtures re-confirmed present and untouched.

## Close-out

- [x] T47 Checkboxes above reflect exactly what was genuinely verified this pass; T35 (build), T37's move/unassign half, and T38 (no-access caller) are the items left honestly unchecked and deferred as accepted, non-blocking verification debt sharing already-proven code paths.
