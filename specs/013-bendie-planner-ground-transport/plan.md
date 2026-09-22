# Feature 013 Plan: Bendie Planner Ground Transport

## Canonical Data

- `transport_movements` + `vehicles` + `passenger_vehicle_assignments`, all in the Planner Supabase project. No schema change. No Portal-side copy.
- Real FKs exist for `vehicles.movement_id → transport_movements` and `passenger_vehicle_assignments.vehicle_id → vehicles` — nested PostgREST embeds work for both. **No FK exists** on `passenger_vehicle_assignments.passenger_id` (a live schema inconsistency, noted in the audit) — passenger names cannot be embedded via PostgREST and must be merged in application code from Feature 011's own participant roster (`plannerPeople.ts`'s `listParticipants`).
- Assignment mutations go exclusively through Planner's RPCs (`assign_or_board_passenger`, `move_passenger_to_vehicle`, `unassign_passenger_from_vehicle`) via the service-role client's `.rpc()` — never hand-written INSERT/UPDATE against `passenger_vehicle_assignments`.

## Data-Access Layer — extends `src/lib/plannerLogistics.ts`

Added to the existing file (not a new module) — Ground Transport shares `resolveLogisticsCapability`/`resolveCallerPlannerIdentity` verbatim with Flights/Hotels; splitting it out would duplicate the exact authorization Feature 012 already established for this permission domain.

- `TransportMovement`, `TransportVehicle`, `TransportAssignment` types. Vehicles nest under their movement; assignments (only `is_active=true` ones) nest under their vehicle; `occupancy` is always `assignments.length` (a live count), never `current_pax`/`num_pax`.
- `listMovements(plannerEventId)` — one nested PostgREST select (`transport_movements` → `vehicles` → `passenger_vehicle_assignments`), then merges passenger names from `plannerPeople.ts`'s `listParticipants(plannerEventId)` by `passenger_id` (the one merge PostgREST can't do itself, per the missing-FK note above).
- `getMovement(plannerEventId, movementId)` — item-scope check.
- `createMovement`, `updateMovement` — plain inserts/updates, no trigger obstacles.
- `deleteMovement` — pre-checks for any `vehicles` row referencing this movement; throws a clean `PlannerLogisticsValidationError('Remove all vehicles from this movement first.')` rather than surfacing the underlying FK violation the live schema would otherwise raise (`vehicles.movement_id` is `NOT NULL`, so a raw delete attempt while vehicles exist fails at the database level regardless — this pre-check just gives an operator-readable reason instead of a raw Postgres error).
- `getVehicle(plannerEventId, vehicleId)` — item-scope check.
- `createVehicle(plannerEventId, movementId, input)` — first verifies the movement belongs to the resolved event (`getMovement`), then inserts with `event_id`/`movement_id` from resolved context, never from an unverified client value.
- `updateVehicle` — never accepts `movementId`/`eventId` (immutable after creation, consistent with every prior module's core-identity-fixed pattern).
- `deleteVehicle` — pre-checks for any `passenger_vehicle_assignments` row (active or historical) referencing this vehicle; throws a clean validation error preserving assignment history, matching the live `NO ACTION` FK behavior.
- `assignPassenger(plannerEventId, vehicleId, passengerId, boarded?)` — verifies vehicle belongs to event and passenger is a Feature 011 participant of the event, then calls `assign_or_board_passenger`. If the RPC responds `{ok:false, action:'needs_move'}` (passenger already on a different vehicle in the same movement), automatically follows up with `move_passenger_to_vehicle` to the requested vehicle — this is still exclusively RPC-driven, just two RPC calls in the sequence Planner's own semantics already define, never a hand-rolled state transition.
- `movePassenger(plannerEventId, toVehicleId, passengerId, boarded?)` — verifies destination vehicle belongs to event and passenger is a participant, then calls `move_passenger_to_vehicle`.
- `unassignPassenger(plannerEventId, vehicleId, passengerId)` — verifies vehicle belongs to event, then calls `unassign_passenger_from_vehicle`. Never touches `event_passengers` or `passengers`.
- Every RPC call checks the returned `{ok: boolean, ...}` shape and maps a `false` result to a specific, clean `PlannerLogisticsValidationError` (e.g. `not_currently_assigned`, `already_on_target_vehicle`, `not_assigned_to_this_vehicle`) — the raw jsonb payload is never passed through to the client.

## Authorization — Route-Layer Composition (identical to Flights/Hotels, not duplicated logic — copied inline per established convention)

Same 8-step sequence as every `planner-logistics/*` route: Portal auth → selected org → `requireEventWorkspaceAccess` → `isProductAvailableForEvent('planner')` → provisioning/`event_planner_links` → `canAdministerPlannerPermissions` (full bypass) → else Planner identity + `resolveLogisticsCapability` (`can_view_logistics`/platform-admin). Manage-gated for every mutation, exactly as Flights/Hotels.

## API Routes (under the existing `/api/events/[eventId]/planner-logistics/` namespace)

- `GET/POST /ground-transport/movements` — list (nested vehicles/assignments/occupancy) + capability; manage-only create.
- `PATCH/DELETE /ground-transport/movements/[movementId]`.
- `POST /ground-transport/vehicles` — manage-only create (requires `movementId` in body, re-verified server-side).
- `PATCH/DELETE /ground-transport/vehicles/[vehicleId]`.
- `POST /ground-transport/assignments/assign` — `{vehicleId, passengerId, boarded?}`.
- `POST /ground-transport/assignments/move` — `{toVehicleId, passengerId, boarded?}`.
- `DELETE /ground-transport/assignments/[assignmentId]` — resolves `vehicleId`/`passengerId` from the assignment row, then unassigns.
- No standalone vehicle-listing endpoint — the movements endpoint's nested response is the single source for the whole hierarchy, avoiding N+1 fetches and an unnecessary extra route.

## UI Structure

- Extends the existing `planner-logistics/page.tsx` — a third sub-tab (`'flights' | 'hotels' | 'groundTransport'`), reusing the page's existing capability (already fetched from the Flights response — no second capability fetch, per explicit instruction) and its existing loading/denied/configuring state machine.
- `PlannerGroundTransportList.tsx` — renders the movement → vehicle → assignment hierarchy (movement cards, each listing its vehicles with a computed occupancy badge and an expandable passenger list), Manage-only add/edit/delete/assign/move/unassign controls.
- `PlannerMovementModal.tsx` — create/edit a movement (name, route, date, pickup time, notes).
- `PlannerVehicleModal.tsx` — create/edit a vehicle under a selected movement (type, number, capacity, route, times, status, notes).
- `PlannerAssignPassengerModal.tsx` — participant `<select>` sourced from the same roster fetch Flights/Hotels already use, optional Flight-leg `<select>` sourced from that participant's own flights (fetched from the existing `GET .../planner-logistics/flights`, filtered client-side by `passengerId` — no new endpoint).

## Brownfield Files Reused

`plannerLogistics.ts` (extended, not replaced), `plannerPeople.ts`'s `getParticipant`/`listParticipants`, `eventAuth.ts`, `plannerOverview.ts`, the existing `planner-logistics/page.tsx`'s state machine and capability fetch, the existing Flights/Hotels list-fetch pattern for the optional Flight picker.

## Security Considerations

- The Planner RPCs (`assign_or_board_passenger` etc.) are plain functions (not `SECURITY DEFINER`) with no internal auth check of their own — Portal's route-layer authorization is the entire authorization boundary for these calls; the service-role client executing them is a database mechanism, never treated as authorization.
- `trg_validate_passenger_vehicle_assignment` independently re-verifies passenger/event/vehicle/movement consistency at the database level regardless of what Portal already checked — belt-and-suspenders, not a substitute for Portal's own pre-checks.
- Movement/vehicle deletion pre-checks exist specifically to turn an otherwise-raw FK-violation error into an operator-readable message — the underlying database constraint is the real safety net either way.
