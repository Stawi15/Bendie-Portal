# Feature 012 Tasks: Bendie Planner Flights & Hotels (Travel Logistics)

Lightweight checklist per the rapid-implementation workflow. ~47 tasks.

## Data-access layer

- [x] T01 Create `src/lib/plannerLogistics.ts` (`'server-only'`), shared types: `LogisticsCapability`, error classes.
- [x] T02 `resolveCallerPlannerIdentity` (duplicated, established convention).
- [x] T03 `resolveLogisticsCapability(plannerEventId, plannerProfileId)` — platform-admin bypass; else `canView = can_view_logistics` on an active assignment; `canManage` always `false` here.
- [x] T04 `FlightLeg` type, `FLIGHT_SELECT_COLUMNS`, `shapeFlightLeg`.
- [x] T05 `listFlights(plannerEventId)` — sorted by passenger name then flight date.
- [x] T06 `getFlight(plannerEventId, recordId)` — item-scope check.
- [x] T07 `createFlight(plannerEventId, input)` — snapshots passenger identity fields; writes text + typed time column pairs identically; sets `source_table: 'portal_manual'`; requires `passengerId`/`flightType`/`flightDate`.
- [x] T08 `updateFlight(plannerEventId, recordId, patch)` — never touches `passengerId`; keeps text/typed time pairs in sync on any time edit.
- [x] T09 `deleteFlight(plannerEventId, recordId)`.
- [x] T10 `HotelBooking` type, `HOTEL_SELECT_COLUMNS` (+ named-FK `passengers(full_name)` embed), `shapeHotelBooking`.
- [x] T11 `listHotelBookings(plannerEventId)` — sorted by passenger name.
- [x] T12 `getHotelBooking(plannerEventId, bookingId)` — item-scope check.
- [x] T13 `createHotelBooking(plannerEventId, input)` — `accommodationRequired` defaults `true`; if `false`, server nulls `hotelName`/`roomNumber`/`roomingLabel` regardless of submitted values.
- [x] T14 `updateHotelBooking(plannerEventId, bookingId, patch)` — same clear-on-`false` rule; manually stamps `updated_at`.
- [x] T15 `deleteHotelBooking(plannerEventId, bookingId)`.
- [x] T16 `normalizePlannerLogisticsError`.

## API routes

- [x] T17 `src/app/api/events/[eventId]/planner-logistics/capability/route.ts` — capability-only, `canAdministerPlannerPermissions`-first sequence (plan.md).
- [x] T18 `.../planner-logistics/flights/route.ts` `GET` — list + capability.
- [x] T19 `.../planner-logistics/flights/route.ts` `POST` — `canManage` gate; independently re-verifies `passengerId` via `plannerPeople.ts`'s `getParticipant`; allowlist `{passengerId(required), flightType(required), flightCode, region, flightDate(required), departureTime, arrivalTime, stops, notes, marked}`.
- [x] T20 `.../planner-logistics/flights/[recordId]/route.ts` — item pre-fetch (404 cross-event/missing), `PATCH` allowlist (all editable fields except `passengerId`, empty-body rejected), `DELETE`.
- [x] T21 `.../planner-logistics/hotels/route.ts` `GET` — list + capability.
- [x] T22 `.../planner-logistics/hotels/route.ts` `POST` — `canManage` gate; independently re-verifies `passengerId`; allowlist `{passengerId(required), country, hotelName, roomNumber, roomingLabel, accommodationRequired, checkInDate, checkOutDate, nightsCount, specialStayPattern, notes}`.
- [x] T23 `.../planner-logistics/hotels/[bookingId]/route.ts` — item pre-fetch, `PATCH` allowlist (all editable fields except `passengerId`), `DELETE`.
- [x] T24 Wire `normalizePlannerLogisticsError` into all six route files' catch blocks.

## Navigation/capability integration

- [x] T25 `eventSectionMeta.ts` — add `planner-logistics` (`product: 'planner'`, label "Logistics").
- [x] T26 `EventLayout.tsx` — fifth independent capability block (`PlannerLogisticsCapabilityState`), parallel addition, no changes to Tasks/Vendors/Checklist/People blocks.

## UI

- [x] T27 `src/app/portal/events/[eventId]/planner-logistics/page.tsx` — state machine identical to `planner-people/page.tsx`; internal `Flights`/`Hotels` sub-tabs (local state, not separate `EVENT_SECTIONS` entries); fetches the participant roster once from `GET .../planner-people` for both create modals.
- [x] T28 `PlannerFlightList.tsx` — table (participant, type, flight code, date, times, stops, marked toggle), Edit/Delete for Manage-capable users.
- [x] T29 `PlannerFlightModal.tsx` — participant `<select>` (from the shared roster fetch; empty-roster state links to People), flight type, code, region, date, times, stops, notes.
- [x] T30 `PlannerHotelList.tsx` — table (participant, hotel, room, dates, nights, accommodation-required indicator), Edit/Delete for Manage-capable users.
- [x] T31 `PlannerHotelModal.tsx` — participant `<select>`, accommodation-required toggle (hides hotel/room fields when off), hotel/room/dates/nights (client-side default from dates)/notes.
- [x] T32 Confirm no control anywhere allows reassigning a Flight/Hotel record's participant after creation. (Verified by inspection: the participant `<select>` is `disabled` whenever `editing` is set in both modals; the route layer's `PATCH` allowlists never include `passengerId`.)
- [x] T33 Empty-roster state on both create modals directs the operator to the People tab instead of allowing a disconnected record.

## Quality gate

- [x] T34 `npm run type-check` clean.
- [x] T35 `npm run lint` clean (no errors or new warnings from any Feature 012 file).
- [ ] T36 Production build not run — dev server live throughout, identical accepted precedent to Features 008–011.

## Live verification (synthetic fixtures only)

- [x] T37 Manage-capable caller (via `canAdministerPlannerPermissions`): created a participant (Feature 011), created a Flight (arrival leg, full field set) and a Hotel booking for them, edited both (`marked` toggle on the Flight, `notes` on the Hotel booking), deleted both, confirmed repeat-delete 404s.
- [x] T38 View-only caller (real Planner identity + an active `event_user_assignments` row with `can_view_logistics=true`, no admin authority): capability correctly showed `canView:true, canManage:false`; create/edit/delete each independently denied `403 logistics_manage_denied` on both Flights and Hotels.
- [x] T39 No-access caller (no Planner identity, no admin authority): capability returned `{hasPlannerIdentity:false}`; the Flights list route correctly denied with `403 planner_identity_unavailable`.
- [x] T40 Creating a Flight and a Hotel booking against a passenger ID not linked to the current event both correctly rejected `400 participant_not_found`.
- [x] T41 Cross-event item-scope check (not just the workspace-access gate — the org-admin identity was independently granted workspace access to the second event too, so the record lookup itself was exercised): both Flight `PATCH` and Hotel `DELETE` correctly returned `404 logistics_record_not_found`; both records confirmed still present and unmodified on the original event immediately after.
- [x] T42 `accommodationRequired:false` submitted alongside `hotelName`/`roomNumber` values confirmed to persist as `null` for both fields — the server-side clearing rule works regardless of what the client sends.
- [x] T43 Canonical visibility: every create/edit response is a direct re-read via the service-role client; additionally confirmed via direct SQL that `all_flights_combined_table`/`hotel_bookings` row counts for the test passenger were exactly 0 after final cleanup (proving no orphaned writes and no second store).
- [x] T44 Planner-only event ("Stawi Escape — Planner Test") tested at the API/data level: capability and Flights list both succeeded with full access.
- [x] T45 People/Tasks/Vendors/Checklist spot-checked immediately after the Logistics mutations above with the same session: People still fully functional (admin bypass shared correctly), Tasks/Vendors/Checklist each correctly returned their own independent `{hasPlannerIdentity:false}` for this identity, unaffected by Logistics' own capability logic.
- [x] T46 Fixture cleanup: all 4 disposable auth users (3 Portal, 1 Planner) deleted via the Auth Admin API; all supporting rows (`organization_members`, `event_members`, `event_user_assignments`, Planner `profiles`, the disposable `passengers` row) deleted; confirmed via a live-DB row-count query returning all zeros on both projects. The two long-lived retained fixtures re-confirmed present and untouched.

## Close-out

- [x] T47 Checkboxes above reflect exactly what was genuinely verified this pass; T36 (production build) is the one item left honestly unchecked and deferred, per established precedent.
