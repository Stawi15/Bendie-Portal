# Feature 012 Spec: Bendie Planner Flights & Hotels (Travel Logistics)

Rapid-implementation lightweight spec. Manages the canonical Planner backend directly — this is explicitly NOT Feature 001's narrow, Both-product-only, Bendie-side travel *pull* (which copies selected data into Portal's own `attendee_travel_details` for display and never writes back to Planner).

## Scope

One Planner event-workspace module, **Logistics**, with two internal sections: **Flights** and **Hotels**. Ground Transport is explicitly excluded (Feature 013, canonical schema still unresolved).

## Canonical Model (verified live, this pass)

### Flights — `all_flights_combined_table`
A genuine base table (not a view), no triggers. **One row = one passenger's one flight leg** — arrival and departure are separate rows (`flight_type`), confirmed via live data (a passenger typically has 2 rows: an inbound leg and an outbound leg). One flight code/date can be shared by many passengers (each still its own row) — there is no separate normalized "Flight" entity; the table is intentionally flat/per-passenger.

Columns actually used: `record_id` (PK), `event_id` (required), `passenger_id` (FK → `passengers`, nullable at the schema level but **always required for Portal-created rows**), `fullname`/`title`/`passport`/`dietary_requirements`/`region` (a **denormalized snapshot** of the passenger's identity, confirmed byte-identical to the linked `passengers` row for every existing linked record), `flight` (code), `date_time` (the leg's date), `departuretime`/`arrivaltime` (**text**, `"HH:MM:SS"`), `depart_time`/`arrive_time` (proper `time` columns, kept in sync with the text pair in 100% of real historical data), `stops`, `notes`, `flight_type` (free text, historically `arrival`/`Arrival`/`departure`/`Departure`/`inbound` — Portal writes only lowercase `arrival`/`departure`), `marked` (boolean, an operational "confirmed" flag consumed by the live `flights_cards_v`/`flights_feed_v` read views' passenger counts), `source_table` (provenance tag — Portal writes `'portal_manual'`), `created_at`.

**Write-target finding (resolved without a stop)**: the live read-model views (`flights_cards_v`, `flights_feed_v`) parse flight times exclusively from the **text** `departuretime`/`arrivaltime` columns, never the typed `depart_time`/`arrive_time` columns. 503 of 511 live rows populate both pairs identically; the only rows relying solely on the typed columns are an 8-row, unlinked, disposable `source_table='test_org_seed'` batch (not connected to any active `event_planner_links` row — confirmed orphaned test data, not a real write pattern to follow). Portal writes **both** pairs, identically, matching the real historical pattern.

**Field classification**: USER-MANAGED — `flightType`, `flightCode`, `region`, `flightDate`, `departureTime`, `arrivalTime`, `stops`, `notes`, `marked`. SYSTEM-MANAGED — `createdAt`, the denormalized identity snapshot (set once from the passenger at creation, never independently edited). INTERNAL — `record_id`, `source_table`, the legacy `id` column (untouched, always left null for Portal-created rows).

### Hotels — `hotel_bookings`
A genuine base table, no triggers. **Multiple bookings per passenger are supported** (confirmed live — several passengers already have 2 rows) — there is no one-booking-per-passenger constraint. `accommodation_required` is a real tri-state-like signal, confirmed via data: `false` rows have `hotel_name`/`room_number` always null (an explicit "does not need accommodation" marker, not an incomplete booking); `true` rows may still have a null `hotel_name` (accommodation needed, hotel not yet assigned/pending).

Hotel itself is **free text** (`hotel_name`) — no separate Hotels master table exists or is needed. `rooming_label` is a free-text/numeric planning label, independent of `room_number` — the live roommate-matching view (`hotel_bookings_with_roommates`) actually pairs roommates by matching `room_number`, not `rooming_label`. `nights_count` is **not** database-derived (no trigger computes it) and is not always consistent with `check_out_date - check_in_date` in live data — it is a plain user-entered integer; Portal's create/edit form pre-fills it as a convenience default computed from the dates, but the operator can override it.

**Field classification**: USER-MANAGED — `country`, `hotelName`, `roomNumber`, `roomingLabel`, `accommodationRequired`, `checkInDate`, `checkOutDate`, `nightsCount`, `specialStayPattern`, `notes`. SYSTEM-MANAGED — `createdAt`/`updatedAt` (Portal stamps `updatedAt` itself — no trigger does it). INTERNAL — `booking_id`.

## Participant Relationship (Feature 011 reuse — not a new participant system)

Both Flights and Hotels reference `passenger_id` directly. Portal requires the target passenger to be a linked participant of the **resolved current event** (verified via Feature 011's own `getParticipant`/`event_passengers` check) before allowing a flight or hotel record to be created against them — this is enforced at the route layer, not assumed. The participant picker in both create forms is sourced from the existing `GET /api/events/[eventId]/planner-people` endpoint — no second participant list, no second passenger-creation path. If the desired traveler isn't yet a participant, the UI directs the operator to the People tab rather than silently creating an unrelated `passengers` row from within Logistics.

`passenger_id` is set once at creation and is **not reassignable** on edit — consistent with every prior module's "core identity fixed at creation" pattern (Vendors/Checklist/Tasks). A wrong assignment is corrected by delete-and-recreate.

## Authorization (locked product decision)

`can_view_logistics` is a real, Feature-008-administered per-assignment flag (unlike People, where no flag existed at all) — View honors it directly. No `can_manage_logistics` flag exists, and Planner's own native RLS is unusually permissive here (Flights: any active assignment can write; Hotels: `USING (true)` — any authenticated user at all, no assignment required). Portal does **not** mirror that permissiveness. Locked model:

- **View**: Portal workspace access + (`can_view_logistics=true` on an active `event_user_assignments` row, **or** `canAdministerPlannerPermissions`, **or** Planner platform-admin).
- **Manage** (create/edit/delete, both Flights and Hotels): `canAdministerPlannerPermissions` (Portal org-admin/platform-admin) **or** Planner platform-admin only. An ordinary staff member with `can_view_logistics=true` can see travel/accommodation data but cannot mutate it — the most conservative option, given this data includes passport numbers and personal travel details, and consistent with Feature 011's own precedent for "no manage flag exists."

## Feature 001 Compatibility

Feature 012 writes directly to the same canonical `all_flights_combined_table`/`hotel_bookings` Feature 001's pull already reads. Feature 001's manual pull (Both events only) will simply see Feature 012's updates on its next run — no bidirectional sync, no automatic trigger of the pull, no change to Feature 001's own route or behavior.

## Verified Business Rules

1. Arrival and departure are separate Flight rows, not one row with a direction toggle.
2. One passenger may have multiple Flight legs and multiple Hotel bookings; one flight code/date may be shared by many passengers (each their own row).
3. A passenger must already be a participant of the current event (Feature 011) before a Flight or Hotel record can reference them.
4. `passenger_id` is immutable after creation on both Flights and Hotels.
5. `accommodation_required=false` is a genuine "no accommodation needed" state, not an incomplete booking — hotel/room fields stay empty for such rows.
6. `nightsCount` is never silently recomputed by the server on edit — it is user-entered, defaulted client-side as a convenience only.

## Authorization / Security Requirements

- Every request resolves Portal `eventId` → workspace access → active `event_planner_links` → Planner `event_id`; the browser never supplies an authoritative Planner event ID.
- Every mutation independently re-verifies capability and independently re-verifies the target record belongs to the resolved event (cross-event record IDs return 404, never leaking existence).
- Every create independently re-verifies the target passenger is a linked participant of the resolved event.
- Works identically for Planner-only and Both events; absent for Bendie-only events.

## Acceptance Criteria

1. A Manage-capable caller can list, create, edit, and delete both Flights and Hotels; all changes are visible immediately in the canonical tables.
2. A View-only (`can_view_logistics=true`, non-admin) caller can see both sections but has no mutation controls; the server independently rejects any mutation attempt.
3. A caller with neither `can_view_logistics` nor admin authority is denied both sections entirely.
4. Creating a Flight or Hotel record against a passenger not linked to the current event is rejected.
5. Cross-event record IDs cannot be mutated through the wrong event's route.
6. The module works fully for a Planner-only event with no dependency on the Bendie product.
7. Tasks, Vendors, Checklist, People, and Feature 008 are unaffected.

## Exclusions

- Ground Transport (Feature 013 — canonical schema unresolved).
- Any new `event_user_assignments` permission flag.
- Any Portal-side duplicate storage of Flights/Hotels data.
- Reassigning a Flight/Hotel record's passenger after creation.
- Server-side recomputation/enforcement of `nightsCount` against the check-in/check-out dates.
- Roommate-pairing UI beyond exposing `roomNumber`/`roomingLabel` as plain editable fields (the live `hotel_bookings_with_roommates` view already does the pairing for read purposes; Feature 012 does not build a dedicated roommate-assignment workflow).
