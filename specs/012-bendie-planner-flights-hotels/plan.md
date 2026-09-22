# Feature 012 Plan: Bendie Planner Flights & Hotels (Travel Logistics)

## Canonical Data

- `all_flights_combined_table` (Flights) + `hotel_bookings` (Hotels), both in the Planner Supabase project. No schema change. No Portal-side copy.
- No triggers on either table — Portal sets `updated_at` on `hotel_bookings` itself (no trigger does it); `all_flights_combined_table` has no `updated_at` column at all (only `created_at` — edits don't get their own timestamp, matching the live schema honestly rather than inventing one).
- Item-scope security: every mutation resolves the target by `(plannerEventId, recordId)` / `(plannerEventId, bookingId)`, mirroring every prior module's "404 covers both missing and wrong-event" shape.
- Participant-scope security: every create independently re-verifies the target `passengerId` via Feature 011's own `getParticipant(plannerEventId, passengerId)` — reused directly from `plannerPeople.ts`, not reimplemented.

## Data-Access Layer — `src/lib/plannerLogistics.ts`

One file for both domains (they share authorization and are presented as one workspace module), mirroring the established shape (`'server-only'`, explicit column lists, narrow functions).

- `FlightLeg` type, `FlightLegCreateInput`, `FlightLegPatch` (`Partial<{flightType, flightCode, region, flightDate, departureTime, arrivalTime, stops, notes, marked}>` — never `passengerId`).
- `HotelBooking` type, `HotelBookingCreateInput`, `HotelBookingPatch` (`Partial<{country, hotelName, roomNumber, roomingLabel, accommodationRequired, checkInDate, checkOutDate, nightsCount, specialStayPattern, notes}>` — never `passengerId`).
- `LogisticsCapability`/`ResolvedLogisticsCapability` — same `{hasPlannerIdentity:false} | {hasPlannerIdentity:true, canView, canManage}` shape as every prior module.
- `PlannerLogisticsValidationError` / `PlannerLogisticsNotFoundError`.
- `resolveCallerPlannerIdentity` — duplicated verbatim (established convention).
- `resolveLogisticsCapability(plannerEventId, plannerProfileId)` — Planner platform-admin bypass grants `canView+canManage`; otherwise `canView` reflects `can_view_logistics` on an active `event_user_assignments` row (a real, existing flag — unlike People); `canManage` always `false` here (Portal-layer-only elevation via `canAdministerPlannerPermissions`, applied at the route layer, identical composition to Feature 011's People routes).
- Flights: `listFlights(plannerEventId)`, `getFlight(plannerEventId, recordId)`, `createFlight(plannerEventId, input)` (requires `passengerId` + `flightType` + at least a date; snapshots the passenger's identity fields at creation; writes `departuretime`/`arrivaltime` text AND `depart_time`/`arrive_time` typed columns identically; sets `source_table: 'portal_manual'`), `updateFlight(...)`, `deleteFlight(...)`.
- Hotels: `listHotelBookings(plannerEventId)`, `getHotelBooking(plannerEventId, bookingId)`, `createHotelBooking(plannerEventId, input)` (requires `passengerId`; `accommodationRequired` defaults `true`; if `false`, server clears `hotelName`/`roomNumber`/`roomingLabel` to `null` regardless of what was submitted — matching the verified live invariant), `updateHotelBooking(...)` (same clear-on-`false` rule applied on edit too), `deleteHotelBooking(...)`.
- `normalizePlannerLogisticsError`.

## Authorization — Route-Layer Composition

Identical composition to Feature 011's People routes: 1) Portal auth, 2) selected org, 3) `requireEventWorkspaceAccess`, 4) `isProductAvailableForEvent('planner')`, 5) provisioning/`event_planner_links`, then:

6. `canAdministerPlannerPermissions(eventId, userId, authClient)` — if true, full access regardless of Planner identity.
7. Otherwise resolve `plannerProfileId`; if absent, deny.
8. Otherwise `resolveLogisticsCapability(plannerEventId, plannerProfileId)` for `{canView: can_view_logistics, canManage: false}`.

Copied inline per route file (established convention).

## API Routes

- `GET /api/events/[eventId]/planner-logistics/capability` — capability-only.
- `GET/POST /api/events/[eventId]/planner-logistics/flights` — list + capability (GET); manage-only create (POST).
- `PATCH/DELETE /api/events/[eventId]/planner-logistics/flights/[recordId]`.
- `GET/POST /api/events/[eventId]/planner-logistics/hotels` — list + capability (GET); manage-only create (POST).
- `PATCH/DELETE /api/events/[eventId]/planner-logistics/hotels/[bookingId]`.
- No new participant-listing endpoint — both create flows fetch the roster from the existing `GET /api/events/[eventId]/planner-people`.

## UI Structure

- `src/app/portal/events/[eventId]/planner-logistics/page.tsx` — one page, internal client-side sub-tabs (`Flights`/`Hotels`, local `useState`, not separate `EVENT_SECTIONS` entries), identical loading/denied/configuring/loaded state machine to `planner-people/page.tsx`.
- `PlannerFlightList.tsx` / `PlannerFlightModal.tsx` — modal's participant `<select>` is populated from a `GET .../planner-people` fetch done by the page and passed down (no duplicate fetch logic).
- `PlannerHotelList.tsx` / `PlannerHotelModal.tsx` — same participant-picker reuse.
- One new `EVENT_SECTIONS` entry: `planner-logistics` (label "Logistics").

## Brownfield Files Reused

`plannerAdmin.ts`, `eventAuth.ts` (`requireEventWorkspaceAccess`, `isProductAvailableForEvent`, `canAdministerPlannerPermissions`), `plannerOverview.ts` (`resolveProvisioningPhase`), `plannerPeople.ts`'s `getParticipant` (participant-scope verification) and its `GET /planner-people` route (participant picker data source), `eventSectionMeta.ts`, the event workspace layout's independent-capability-block pattern (a fifth parallel block).

## Security Considerations

- Hotels' own live RLS (`USING(true)`) and Flights' own (`any active assignment`) are both more permissive than Portal's chosen View/Manage gates — Portal's server-side check is strictly narrower, which is safe (service-role bypasses RLS entirely regardless; Portal never relies on it for authorization).
- The denormalized passenger-identity snapshot on Flight rows is captured once at creation and is **not** kept live-synced if the participant's own record is later edited via People — documented as an accepted, pragmatic limitation (matching how every other module treats a captured snapshot vs. a live join), not an oversight.
- `accommodation_required=false` clearing hotel/room fields server-side (regardless of what the client submits) prevents a client bug from creating a self-contradictory row — mirrors the live data invariant already observed in 100% of existing `false` rows.
