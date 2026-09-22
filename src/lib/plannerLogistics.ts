import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import { getParticipant, listParticipants } from '@/lib/plannerPeople';

/**
 * Feature 012 — narrow, server-only Bendie Planner Flights/Hotels
 * (Travel Logistics) data-access module. One file for both domains — they
 * share authorization and are presented as one workspace module ("Logistics"
 * with Flights/Hotels sub-tabs), matching the product's intended navigation
 * shape rather than forcing a split that would only exist for code
 * organization's sake.
 *
 * Operates directly against the canonical `all_flights_combined_table` and
 * `hotel_bookings` tables — no Portal-side copy, no sync layer. This is
 * explicitly NOT Feature 001's narrow, Both-only, Bendie-side travel pull;
 * Feature 001 never writes back to these tables, and this module never reads
 * or writes Feature 001's own `attendee_travel_details` table.
 *
 * Feature 013 (Ground Transport) is appended below rather than split into a
 * new module — it shares this file's `resolveLogisticsCapability`/
 * `resolveCallerPlannerIdentity` verbatim (same permission domain, per the
 * coverage audit's §4.4 resolution), and duplicating those would only
 * re-create the exact authorization Feature 012 already established.
 */

export type LogisticsCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };
export type ResolvedLogisticsCapability = Extract<LogisticsCapability, { hasPlannerIdentity: true }>;

export class PlannerLogisticsValidationError extends Error {
  code: 'invalid_request';
  constructor(message: string) {
    super(message);
    this.code = 'invalid_request';
  }
}

export class PlannerLogisticsNotFoundError extends Error {}

/** Reads the caller's Planner identity from Portal's own `profiles.planner_profile_id` (Feature 001 bridge). A small, deliberately self-contained duplicate of every prior module's identical function. */
export async function resolveCallerPlannerIdentity(portalAuthClient: SupabaseClient, portalUserId: string): Promise<string | null> {
  const { data, error } = await portalAuthClient.from('profiles').select('planner_profile_id').eq('id', portalUserId).maybeSingle();
  if (error) {
    console.error('resolveCallerPlannerIdentity (logistics): profiles lookup failed', error);
    return null;
  }
  return data?.planner_profile_id ?? null;
}

/**
 * Unlike Feature 011's People (which had no view flag at all), a real,
 * Feature-008-administered `can_view_logistics` flag exists — `canView`
 * honors it directly. `canManage` is always `false` from this function: no
 * `can_manage_logistics` flag exists, and per the locked product decision
 * (spec.md), manage authority only ever comes from the Portal-layer
 * `canAdministerPlannerPermissions` check, applied by the route before this
 * function is even called.
 */
export async function resolveLogisticsCapability(plannerEventId: number, plannerProfileId: string): Promise<ResolvedLogisticsCapability> {
  const planner = getPlannerAdminClient();

  const { data: profile, error: profileError } = await planner.from('profiles').select('is_platform_admin, role').eq('id', plannerProfileId).maybeSingle();
  if (profileError) throw profileError;

  const role = (profile?.role ?? '').trim().toLowerCase();
  const isPlatformAdmin = profile?.is_platform_admin === true || ['admin', 'super_admin', 'superadmin'].includes(role);
  if (isPlatformAdmin) {
    return { hasPlannerIdentity: true, canView: true, canManage: true };
  }

  const { data: assignment, error: assignmentError } = await planner
    .from('event_user_assignments')
    .select('can_view_logistics')
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .eq('is_active', true)
    .maybeSingle();
  if (assignmentError) throw assignmentError;

  return { hasPlannerIdentity: true, canView: assignment?.can_view_logistics === true, canManage: false };
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// ============================================================================
// Flights — all_flights_combined_table
// ============================================================================

export type FlightLeg = {
  id: number;
  passengerId: number;
  passengerName: string;
  flightType: string | null;
  flightCode: string | null;
  region: string | null;
  flightDate: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  stops: string | null;
  notes: string | null;
  marked: boolean;
  createdAt: string;
};

export type FlightLegCreateInput = {
  passengerId: number;
  flightType: 'arrival' | 'departure';
  flightDate: string;
  flightCode?: string | null;
  region?: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  stops?: string | null;
  notes?: string | null;
};

export type FlightLegPatch = Partial<{
  flightType: 'arrival' | 'departure';
  flightCode: string | null;
  region: string | null;
  flightDate: string;
  departureTime: string | null;
  arrivalTime: string | null;
  stops: string | null;
  notes: string | null;
  marked: boolean;
}>;

const FLIGHT_SELECT_COLUMNS =
  'record_id, event_id, passenger_id, fullname, flight, flight_type, region, date_time, departuretime, arrivaltime, stops, notes, marked, created_at';

type RawFlightRow = {
  record_id: number;
  event_id: number;
  passenger_id: number | null;
  fullname: string | null;
  flight: string | null;
  flight_type: string | null;
  region: string | null;
  date_time: string | null;
  departuretime: string | null;
  arrivaltime: string | null;
  stops: string | null;
  notes: string | null;
  marked: boolean | null;
  created_at: string | null;
};

function shapeFlightLeg(row: RawFlightRow): FlightLeg {
  return {
    id: row.record_id,
    passengerId: row.passenger_id ?? 0,
    passengerName: row.fullname ?? '',
    flightType: row.flight_type,
    flightCode: row.flight,
    region: row.region,
    flightDate: row.date_time ? row.date_time.slice(0, 10) : null,
    departureTime: row.departuretime,
    arrivalTime: row.arrivaltime,
    stops: row.stops,
    notes: row.notes,
    marked: row.marked === true,
    createdAt: row.created_at ?? '',
  };
}

/** Formats a `time` value ("HH:MM" or "HH:MM:SS") to the `"HH:MM:SS"` shape used by 100% of real historical rows. `null`/empty passes through unchanged. */
function normalizeTimeText(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) return null;
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

export async function listFlights(plannerEventId: number): Promise<FlightLeg[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('all_flights_combined_table').select(FLIGHT_SELECT_COLUMNS).eq('event_id', plannerEventId);
  if (error) throw error;
  const legs = (data ?? []).map((row) => shapeFlightLeg(row as unknown as RawFlightRow));
  return legs.sort((a, b) => a.passengerName.localeCompare(b.passengerName) || (a.flightDate ?? '').localeCompare(b.flightDate ?? ''));
}

/** Returns `null` whenever the record doesn't exist OR doesn't belong to `plannerEventId` — the item-scope check every mutation below reuses. */
export async function getFlight(plannerEventId: number, recordId: number): Promise<FlightLeg | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('all_flights_combined_table').select(FLIGHT_SELECT_COLUMNS).eq('record_id', recordId).eq('event_id', plannerEventId).maybeSingle();
  if (error) throw error;
  return data ? shapeFlightLeg(data as unknown as RawFlightRow) : null;
}

/**
 * Manager-only (enforced by the route). Snapshots the passenger's identity
 * fields at creation time — matching the byte-identical pattern already
 * present in 100% of live linked rows — and writes both the text
 * (`departuretime`/`arrivaltime`) and typed (`depart_time`/`arrive_time`)
 * time-column pairs identically, matching the real historical write pattern
 * (plan.md's write-target finding). `source_table` is stamped
 * `'portal_manual'` so Portal-authored rows remain distinguishable from the
 * legacy migration batches.
 */
export async function createFlight(plannerEventId: number, passenger: { fullName: string; title: string | null; passport: string | null; dietaryRequirements: string | null }, input: FlightLegCreateInput): Promise<FlightLeg> {
  if (!input.flightDate) throw new PlannerLogisticsValidationError('Flight date is required.');
  if (input.flightType !== 'arrival' && input.flightType !== 'departure') {
    throw new PlannerLogisticsValidationError('flightType must be "arrival" or "departure".');
  }

  const departureTime = normalizeTimeText(input.departureTime);
  const arrivalTime = normalizeTimeText(input.arrivalTime);
  const referenceTime = departureTime ?? arrivalTime ?? '00:00:00';

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('all_flights_combined_table')
    .insert({
      event_id: plannerEventId,
      passenger_id: input.passengerId,
      fullname: passenger.fullName,
      title: passenger.title,
      passport: passenger.passport,
      dietary_requirements: passenger.dietaryRequirements,
      region: normalizeOptionalString(input.region),
      flight: normalizeOptionalString(input.flightCode),
      flight_type: input.flightType,
      date_time: `${input.flightDate} ${referenceTime}`,
      departuretime: departureTime,
      arrivaltime: arrivalTime,
      depart_time: departureTime,
      arrive_time: arrivalTime,
      stops: normalizeOptionalString(input.stops),
      notes: normalizeOptionalString(input.notes),
      marked: false,
      source_table: 'portal_manual',
    })
    .select(FLIGHT_SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return shapeFlightLeg(data as unknown as RawFlightRow);
}

/** Never accepts `passengerId` (immutable after creation, spec.md). Keeps the text/typed time-column pairs in sync on any time edit. */
export async function updateFlight(plannerEventId: number, recordId: number, patch: FlightLegPatch): Promise<FlightLeg> {
  const existing = await getFlight(plannerEventId, recordId);
  if (!existing) throw new PlannerLogisticsNotFoundError('Flight not found.');

  const updates: Record<string, unknown> = {};
  if ('flightType' in patch) {
    if (patch.flightType !== 'arrival' && patch.flightType !== 'departure') {
      throw new PlannerLogisticsValidationError('flightType must be "arrival" or "departure".');
    }
    updates.flight_type = patch.flightType;
  }
  if ('flightCode' in patch) updates.flight = normalizeOptionalString(patch.flightCode);
  if ('region' in patch) updates.region = normalizeOptionalString(patch.region);
  if ('stops' in patch) updates.stops = normalizeOptionalString(patch.stops);
  if ('notes' in patch) updates.notes = normalizeOptionalString(patch.notes);
  if (typeof patch.marked === 'boolean') updates.marked = patch.marked;

  const departureTime = 'departureTime' in patch ? normalizeTimeText(patch.departureTime) : undefined;
  const arrivalTime = 'arrivalTime' in patch ? normalizeTimeText(patch.arrivalTime) : undefined;
  if (departureTime !== undefined) {
    updates.departuretime = departureTime;
    updates.depart_time = departureTime;
  }
  if (arrivalTime !== undefined) {
    updates.arrivaltime = arrivalTime;
    updates.arrive_time = arrivalTime;
  }

  if ('flightDate' in patch && patch.flightDate) {
    const effectiveDeparture = departureTime !== undefined ? departureTime : existing.departureTime;
    const effectiveArrival = arrivalTime !== undefined ? arrivalTime : existing.arrivalTime;
    updates.date_time = `${patch.flightDate} ${effectiveDeparture ?? effectiveArrival ?? '00:00:00'}`;
  }

  if (Object.keys(updates).length === 0) {
    throw new PlannerLogisticsValidationError('At least one field is required.');
  }

  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('all_flights_combined_table').update(updates).eq('record_id', recordId).eq('event_id', plannerEventId).select(FLIGHT_SELECT_COLUMNS).maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerLogisticsNotFoundError('Flight not found.');
  return shapeFlightLeg(data as unknown as RawFlightRow);
}

export async function deleteFlight(plannerEventId: number, recordId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('all_flights_combined_table').delete().eq('record_id', recordId).eq('event_id', plannerEventId).select('record_id').maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerLogisticsNotFoundError('Flight not found.');
}

// ============================================================================
// Hotels — hotel_bookings
// ============================================================================

export type HotelBooking = {
  id: number;
  passengerId: number;
  passengerName: string;
  country: string | null;
  hotelName: string | null;
  roomNumber: number | null;
  roomingLabel: string | null;
  accommodationRequired: boolean;
  checkInDate: string | null;
  checkOutDate: string | null;
  nightsCount: number | null;
  specialStayPattern: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HotelBookingCreateInput = {
  passengerId: number;
  country?: string | null;
  hotelName?: string | null;
  roomNumber?: number | null;
  roomingLabel?: string | null;
  accommodationRequired?: boolean;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  nightsCount?: number | null;
  specialStayPattern?: string | null;
  notes?: string | null;
};

export type HotelBookingPatch = Partial<{
  country: string | null;
  hotelName: string | null;
  roomNumber: number | null;
  roomingLabel: string | null;
  accommodationRequired: boolean;
  checkInDate: string | null;
  checkOutDate: string | null;
  nightsCount: number | null;
  specialStayPattern: string | null;
  notes: string | null;
}>;

const HOTEL_SELECT_COLUMNS =
  'booking_id, event_id, passenger_id, country, hotel_name, room_number, rooming_label, accommodation_required, check_in_date, check_out_date, nights_count, special_stay_pattern, notes, created_at, updated_at, ' +
  'passenger:passengers(full_name)';

type ProfileNameEmbed = { full_name: string | null } | { full_name: string | null }[] | null;

type RawHotelRow = {
  booking_id: number;
  event_id: number;
  passenger_id: number;
  country: string | null;
  hotel_name: string | null;
  room_number: number | null;
  rooming_label: string | null;
  accommodation_required: boolean;
  check_in_date: string | null;
  check_out_date: string | null;
  nights_count: number | null;
  special_stay_pattern: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  passenger?: ProfileNameEmbed;
};

function embedFullName(embed: ProfileNameEmbed | undefined): string {
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.full_name?.trim() || '';
}

function shapeHotelBooking(row: RawHotelRow): HotelBooking {
  return {
    id: row.booking_id,
    passengerId: row.passenger_id,
    passengerName: embedFullName(row.passenger),
    country: row.country,
    hotelName: row.hotel_name,
    roomNumber: row.room_number,
    roomingLabel: row.rooming_label,
    accommodationRequired: row.accommodation_required,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    nightsCount: row.nights_count,
    specialStayPattern: row.special_stay_pattern,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listHotelBookings(plannerEventId: number): Promise<HotelBooking[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('hotel_bookings').select(HOTEL_SELECT_COLUMNS).eq('event_id', plannerEventId);
  if (error) throw error;
  const bookings = (data ?? []).map((row) => shapeHotelBooking(row as unknown as RawHotelRow));
  return bookings.sort((a, b) => a.passengerName.localeCompare(b.passengerName));
}

export async function getHotelBooking(plannerEventId: number, bookingId: number): Promise<HotelBooking | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('hotel_bookings').select(HOTEL_SELECT_COLUMNS).eq('booking_id', bookingId).eq('event_id', plannerEventId).maybeSingle();
  if (error) throw error;
  return data ? shapeHotelBooking(data as unknown as RawHotelRow) : null;
}

/** `accommodationRequired` defaults `true`. If `false` (explicitly or by omission-then-override), hotel/room fields are forced to `null` server-side regardless of what was submitted — matching the verified live invariant (spec.md Verified Business Rule 5). */
export async function createHotelBooking(plannerEventId: number, input: HotelBookingCreateInput): Promise<HotelBooking> {
  const accommodationRequired = input.accommodationRequired !== false;

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('hotel_bookings')
    .insert({
      event_id: plannerEventId,
      passenger_id: input.passengerId,
      country: normalizeOptionalString(input.country),
      hotel_name: accommodationRequired ? normalizeOptionalString(input.hotelName) : null,
      room_number: accommodationRequired ? (input.roomNumber ?? null) : null,
      rooming_label: accommodationRequired ? normalizeOptionalString(input.roomingLabel) : null,
      accommodation_required: accommodationRequired,
      check_in_date: input.checkInDate || null,
      check_out_date: input.checkOutDate || null,
      nights_count: input.nightsCount ?? null,
      special_stay_pattern: normalizeOptionalString(input.specialStayPattern),
      notes: normalizeOptionalString(input.notes),
    })
    .select(HOTEL_SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return shapeHotelBooking(data as unknown as RawHotelRow);
}

export async function updateHotelBooking(plannerEventId: number, bookingId: number, patch: HotelBookingPatch): Promise<HotelBooking> {
  const existing = await getHotelBooking(plannerEventId, bookingId);
  if (!existing) throw new PlannerLogisticsNotFoundError('Hotel booking not found.');

  const updates: Record<string, unknown> = {};
  if ('country' in patch) updates.country = normalizeOptionalString(patch.country);
  if ('hotelName' in patch) updates.hotel_name = normalizeOptionalString(patch.hotelName);
  if ('roomNumber' in patch) updates.room_number = patch.roomNumber ?? null;
  if ('roomingLabel' in patch) updates.rooming_label = normalizeOptionalString(patch.roomingLabel);
  if ('checkInDate' in patch) updates.check_in_date = patch.checkInDate || null;
  if ('checkOutDate' in patch) updates.check_out_date = patch.checkOutDate || null;
  if ('nightsCount' in patch) updates.nights_count = patch.nightsCount ?? null;
  if ('specialStayPattern' in patch) updates.special_stay_pattern = normalizeOptionalString(patch.specialStayPattern);
  if ('notes' in patch) updates.notes = normalizeOptionalString(patch.notes);
  if (typeof patch.accommodationRequired === 'boolean') {
    updates.accommodation_required = patch.accommodationRequired;
    if (!patch.accommodationRequired) {
      updates.hotel_name = null;
      updates.room_number = null;
      updates.rooming_label = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new PlannerLogisticsValidationError('At least one field is required.');
  }
  updates.updated_at = new Date().toISOString();

  const planner = getPlannerAdminClient();
  const { error } = await planner.from('hotel_bookings').update(updates).eq('booking_id', bookingId).eq('event_id', plannerEventId);
  if (error) throw error;

  const booking = await getHotelBooking(plannerEventId, bookingId);
  if (!booking) throw new PlannerLogisticsNotFoundError('Hotel booking not found.');
  return booking;
}

export async function deleteHotelBooking(plannerEventId: number, bookingId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('hotel_bookings').delete().eq('booking_id', bookingId).eq('event_id', plannerEventId).select('booking_id').maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerLogisticsNotFoundError('Hotel booking not found.');
}

// ============================================================================
// Ground Transport — transport_movements + vehicles + passenger_vehicle_assignments
// ============================================================================
//
// Canonical model locked by discovery (coverage audit §4.4): a Movement
// (route/date/time grouping) has Vehicle(s) (per-event vehicle instances, not
// a fleet master); each Vehicle has Passenger Assignment(s), mutated
// EXCLUSIVELY via Planner's own RPCs (`assign_or_board_passenger`,
// `move_passenger_to_vehicle`, `unassign_passenger_from_vehicle`) — never a
// hand-written INSERT/UPDATE against `passenger_vehicle_assignments`.
// `vehicle_boardings`/`vehicle_passengers`/`transport_logistics` are legacy
// and are never read or written here; `shuttles` is out of scope entirely.
// There is no driver model anywhere in this canonical schema — none is
// implemented. `current_pax`/`num_pax`/`names` on `vehicles` are unmaintained
// under this model and are never selected; occupancy is always a live count
// of `is_active=true` assignments.

export type TransportAssignment = {
  id: number;
  passengerId: number;
  passengerName: string;
  vehicleId: number;
  movementId: number;
  boarded: boolean;
  assignedAt: string;
  boardedAt: string | null;
  movedFromVehicleId: number | null;
  notes: string | null;
  flightRecordId: number | null;
};

export type TransportVehicle = {
  id: number;
  movementId: number;
  date: string;
  route: string;
  pickupTime: string | null;
  endTime: string | null;
  vehicleType: string;
  vehicleNo: number;
  maxCapacity: number;
  status: string | null;
  notes: string | null;
  occupancy: number;
  assignments: TransportAssignment[];
};

export type TransportMovement = {
  id: number;
  movementName: string;
  route: string;
  movementDate: string;
  pickupTime: string | null;
  notes: string | null;
  createdAt: string;
  vehicles: TransportVehicle[];
};

export type MovementCreateInput = { movementName: string; route: string; movementDate: string; pickupTime?: string | null; notes?: string | null };
export type MovementPatch = Partial<{ movementName: string; route: string; movementDate: string; pickupTime: string | null; notes: string | null }>;

export type VehicleCreateInput = {
  vehicleType: string;
  vehicleNo: number;
  maxCapacity: number;
  date: string;
  route: string;
  pickupTime?: string | null;
  endTime?: string | null;
  status?: string | null;
  notes?: string | null;
};
export type VehiclePatch = Partial<{
  vehicleType: string;
  vehicleNo: number;
  maxCapacity: number;
  date: string;
  route: string;
  pickupTime: string | null;
  endTime: string | null;
  status: string | null;
  notes: string | null;
}>;

const MOVEMENT_SELECT_COLUMNS =
  'movement_id, event_id, movement_name, route, movement_date, pickup_time, notes, created_at, ' +
  'vehicles(vehicle_id, movement_id, date, route, pickup_time, end_time, vehicle_type, vehicle_no, max_capacity, status, notes, ' +
  'passenger_vehicle_assignments!passenger_vehicle_assignments_vehicle_id_fkey(assignment_id, passenger_id, vehicle_id, movement_id, is_active, boarded, assigned_at, boarded_at, moved_from_vehicle_id, notes, passenger_record_id))';

type RawAssignmentRow = {
  assignment_id: number;
  passenger_id: number | null;
  vehicle_id: number;
  movement_id: number;
  is_active: boolean;
  boarded: boolean;
  assigned_at: string;
  boarded_at: string | null;
  moved_from_vehicle_id: number | null;
  notes: string | null;
  passenger_record_id: number | null;
};

type RawVehicleRow = {
  vehicle_id: number;
  movement_id: number;
  date: string;
  route: string;
  pickup_time: string | null;
  end_time: string | null;
  vehicle_type: string;
  vehicle_no: number;
  max_capacity: number;
  status: string | null;
  notes: string | null;
  passenger_vehicle_assignments: RawAssignmentRow[] | null;
};

type RawMovementRow = {
  movement_id: number;
  event_id: number;
  movement_name: string;
  route: string;
  movement_date: string;
  pickup_time: string | null;
  notes: string | null;
  created_at: string;
  vehicles: RawVehicleRow[] | null;
};

function shapeMovement(row: RawMovementRow, passengerNames: Map<number, string>): TransportMovement {
  return {
    id: row.movement_id,
    movementName: row.movement_name,
    route: row.route,
    movementDate: row.movement_date,
    pickupTime: row.pickup_time,
    notes: row.notes,
    createdAt: row.created_at,
    vehicles: (row.vehicles ?? []).map((v) => shapeVehicle(v, passengerNames)),
  };
}

function shapeVehicle(row: RawVehicleRow, passengerNames: Map<number, string>): TransportVehicle {
  const activeAssignments = (row.passenger_vehicle_assignments ?? []).filter((a) => a.is_active);
  return {
    id: row.vehicle_id,
    movementId: row.movement_id,
    date: row.date,
    route: row.route,
    pickupTime: row.pickup_time,
    endTime: row.end_time,
    vehicleType: row.vehicle_type,
    vehicleNo: row.vehicle_no,
    maxCapacity: row.max_capacity,
    status: row.status,
    notes: row.notes,
    occupancy: activeAssignments.length,
    assignments: activeAssignments.map((a) => shapeAssignment(a, passengerNames)),
  };
}

function shapeAssignment(row: RawAssignmentRow, passengerNames: Map<number, string>): TransportAssignment {
  return {
    id: row.assignment_id,
    passengerId: row.passenger_id ?? 0,
    passengerName: (row.passenger_id !== null ? passengerNames.get(row.passenger_id) : undefined) ?? 'Unknown participant',
    vehicleId: row.vehicle_id,
    movementId: row.movement_id,
    boarded: row.boarded,
    assignedAt: row.assigned_at,
    boardedAt: row.boarded_at,
    movedFromVehicleId: row.moved_from_vehicle_id,
    notes: row.notes,
    flightRecordId: row.passenger_record_id,
  };
}

/** No FK exists on `passenger_vehicle_assignments.passenger_id` (a live schema inconsistency, coverage audit §4.4) — PostgREST cannot embed the passenger name, so it's merged here from Feature 011's own roster. */
export async function listMovements(plannerEventId: number): Promise<TransportMovement[]> {
  const planner = getPlannerAdminClient();
  const [movementsResult, participants] = await Promise.all([
    planner.from('transport_movements').select(MOVEMENT_SELECT_COLUMNS).eq('event_id', plannerEventId),
    listParticipants(plannerEventId),
  ]);
  if (movementsResult.error) throw movementsResult.error;

  const passengerNames = new Map(participants.map((p) => [p.id, p.fullName]));
  const movements = (movementsResult.data ?? []).map((row) => shapeMovement(row as unknown as RawMovementRow, passengerNames));
  return movements.sort((a, b) => a.movementDate.localeCompare(b.movementDate) || a.movementName.localeCompare(b.movementName));
}

export async function getMovement(plannerEventId: number, movementId: number): Promise<TransportMovement | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('transport_movements').select(MOVEMENT_SELECT_COLUMNS).eq('movement_id', movementId).eq('event_id', plannerEventId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const participants = await listParticipants(plannerEventId);
  const passengerNames = new Map(participants.map((p) => [p.id, p.fullName]));
  return shapeMovement(data as unknown as RawMovementRow, passengerNames);
}

export async function createMovement(plannerEventId: number, input: MovementCreateInput): Promise<TransportMovement> {
  const movementName = input.movementName?.trim();
  const route = input.route?.trim();
  if (!movementName) throw new PlannerLogisticsValidationError('Movement name is required.');
  if (!route) throw new PlannerLogisticsValidationError('Route is required.');
  if (!input.movementDate) throw new PlannerLogisticsValidationError('Movement date is required.');

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('transport_movements')
    .insert({
      event_id: plannerEventId,
      movement_name: movementName,
      route,
      movement_date: input.movementDate,
      pickup_time: normalizeOptionalString(input.pickupTime),
      notes: normalizeOptionalString(input.notes),
    })
    .select('movement_id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new PlannerLogisticsValidationError('A movement with this route, date, and pickup time already exists.');
    }
    throw error;
  }

  const movement = await getMovement(plannerEventId, data.movement_id as number);
  if (!movement) throw new Error('plannerLogistics: movement vanished immediately after creation');
  return movement;
}

export async function updateMovement(plannerEventId: number, movementId: number, patch: MovementPatch): Promise<TransportMovement> {
  const existing = await getMovement(plannerEventId, movementId);
  if (!existing) throw new PlannerLogisticsNotFoundError('Movement not found.');

  const updates: Record<string, unknown> = {};
  if ('movementName' in patch) {
    const movementName = patch.movementName?.trim();
    if (!movementName) throw new PlannerLogisticsValidationError('Movement name is required.');
    updates.movement_name = movementName;
  }
  if ('route' in patch) {
    const route = patch.route?.trim();
    if (!route) throw new PlannerLogisticsValidationError('Route is required.');
    updates.route = route;
  }
  if ('movementDate' in patch) updates.movement_date = patch.movementDate;
  if ('pickupTime' in patch) updates.pickup_time = normalizeOptionalString(patch.pickupTime);
  if ('notes' in patch) updates.notes = normalizeOptionalString(patch.notes);

  if (Object.keys(updates).length === 0) {
    throw new PlannerLogisticsValidationError('At least one field is required.');
  }

  const planner = getPlannerAdminClient();
  const { error } = await planner.from('transport_movements').update(updates).eq('movement_id', movementId).eq('event_id', plannerEventId);
  if (error) throw error;

  const movement = await getMovement(plannerEventId, movementId);
  if (!movement) throw new PlannerLogisticsNotFoundError('Movement not found.');
  return movement;
}

/** `vehicles.movement_id` is a required (`NOT NULL`) FK — a raw delete while vehicles exist fails at the database level. This pre-check turns that into a clean operator-readable message instead of a raw Postgres error. */
export async function deleteMovement(plannerEventId: number, movementId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { count, error: countError } = await planner.from('vehicles').select('vehicle_id', { count: 'exact', head: true }).eq('movement_id', movementId);
  if (countError) throw countError;
  if (count && count > 0) {
    throw new PlannerLogisticsValidationError('Remove all vehicles from this movement first.');
  }

  const { data, error } = await planner.from('transport_movements').delete().eq('movement_id', movementId).eq('event_id', plannerEventId).select('movement_id').maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerLogisticsNotFoundError('Movement not found.');
}

const VEHICLE_SELECT_COLUMNS =
  'vehicle_id, movement_id, date, route, pickup_time, end_time, vehicle_type, vehicle_no, max_capacity, status, notes, ' +
  'passenger_vehicle_assignments!passenger_vehicle_assignments_vehicle_id_fkey(assignment_id, passenger_id, vehicle_id, movement_id, is_active, boarded, assigned_at, boarded_at, moved_from_vehicle_id, notes, passenger_record_id)';

export async function getVehicle(plannerEventId: number, vehicleId: number): Promise<TransportVehicle | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('vehicles').select(VEHICLE_SELECT_COLUMNS).eq('vehicle_id', vehicleId).eq('event_id', plannerEventId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const participants = await listParticipants(plannerEventId);
  const passengerNames = new Map(participants.map((p) => [p.id, p.fullName]));
  return shapeVehicle(data as unknown as RawVehicleRow, passengerNames);
}

/** Verifies the movement belongs to the resolved event before creating the vehicle under it — a `movementId` for a different event is rejected as not-found, never silently accepted. */
export async function createVehicle(plannerEventId: number, movementId: number, input: VehicleCreateInput): Promise<TransportVehicle> {
  const movement = await getMovement(plannerEventId, movementId);
  if (!movement) throw new PlannerLogisticsNotFoundError('Movement not found.');

  const vehicleType = input.vehicleType?.trim();
  const route = input.route?.trim();
  if (!vehicleType) throw new PlannerLogisticsValidationError('Vehicle type is required.');
  if (!route) throw new PlannerLogisticsValidationError('Route is required.');
  if (!input.date) throw new PlannerLogisticsValidationError('Date is required.');
  if (!Number.isInteger(input.vehicleNo)) throw new PlannerLogisticsValidationError('Vehicle number is required.');
  if (!Number.isInteger(input.maxCapacity) || input.maxCapacity <= 0) throw new PlannerLogisticsValidationError('Max capacity must be a positive number.');

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('vehicles')
    .insert({
      event_id: plannerEventId,
      movement_id: movementId,
      date: input.date,
      route,
      pickup_time: normalizeOptionalString(input.pickupTime),
      end_time: normalizeOptionalString(input.endTime),
      vehicle_type: vehicleType,
      vehicle_no: input.vehicleNo,
      max_capacity: input.maxCapacity,
      status: normalizeOptionalString(input.status),
      notes: normalizeOptionalString(input.notes),
    })
    .select('vehicle_id')
    .single();
  if (error) throw error;

  const vehicle = await getVehicle(plannerEventId, data.vehicle_id as number);
  if (!vehicle) throw new Error('plannerLogistics: vehicle vanished immediately after creation');
  return vehicle;
}

/** Never accepts `movementId`/`eventId` (immutable after creation, spec.md). */
export async function updateVehicle(plannerEventId: number, vehicleId: number, patch: VehiclePatch): Promise<TransportVehicle> {
  const existing = await getVehicle(plannerEventId, vehicleId);
  if (!existing) throw new PlannerLogisticsNotFoundError('Vehicle not found.');

  const updates: Record<string, unknown> = {};
  if ('vehicleType' in patch) {
    const vehicleType = patch.vehicleType?.trim();
    if (!vehicleType) throw new PlannerLogisticsValidationError('Vehicle type is required.');
    updates.vehicle_type = vehicleType;
  }
  if ('route' in patch) {
    const route = patch.route?.trim();
    if (!route) throw new PlannerLogisticsValidationError('Route is required.');
    updates.route = route;
  }
  if ('vehicleNo' in patch) {
    if (!Number.isInteger(patch.vehicleNo)) throw new PlannerLogisticsValidationError('Vehicle number must be a number.');
    updates.vehicle_no = patch.vehicleNo;
  }
  if ('maxCapacity' in patch) {
    if (!Number.isInteger(patch.maxCapacity) || (patch.maxCapacity as number) <= 0) throw new PlannerLogisticsValidationError('Max capacity must be a positive number.');
    updates.max_capacity = patch.maxCapacity;
  }
  if ('date' in patch) updates.date = patch.date;
  if ('pickupTime' in patch) updates.pickup_time = normalizeOptionalString(patch.pickupTime);
  if ('endTime' in patch) updates.end_time = normalizeOptionalString(patch.endTime);
  if ('status' in patch) updates.status = normalizeOptionalString(patch.status);
  if ('notes' in patch) updates.notes = normalizeOptionalString(patch.notes);

  if (Object.keys(updates).length === 0) {
    throw new PlannerLogisticsValidationError('At least one field is required.');
  }

  const planner = getPlannerAdminClient();
  const { error } = await planner.from('vehicles').update(updates).eq('vehicle_id', vehicleId).eq('event_id', plannerEventId);
  if (error) throw error;

  const vehicle = await getVehicle(plannerEventId, vehicleId);
  if (!vehicle) throw new PlannerLogisticsNotFoundError('Vehicle not found.');
  return vehicle;
}

/** `passenger_vehicle_assignments.vehicle_id` has `NO ACTION` on delete — any referencing row (active or historical) blocks a raw delete at the database level. This pre-check preserves assignment history and gives a clean message instead of a raw error. */
export async function deleteVehicle(plannerEventId: number, vehicleId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { count, error: countError } = await planner.from('passenger_vehicle_assignments').select('assignment_id', { count: 'exact', head: true }).eq('vehicle_id', vehicleId);
  if (countError) throw countError;
  if (count && count > 0) {
    throw new PlannerLogisticsValidationError('Unassign all passengers from this vehicle first.');
  }

  const { data, error } = await planner.from('vehicles').delete().eq('vehicle_id', vehicleId).eq('event_id', plannerEventId).select('vehicle_id').maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerLogisticsNotFoundError('Vehicle not found.');
}

export async function getAssignment(plannerEventId: number, assignmentId: number): Promise<{ vehicleId: number; passengerId: number } | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('passenger_vehicle_assignments')
    .select('assignment_id, vehicle_id, passenger_id')
    .eq('assignment_id', assignmentId)
    .eq('event_id', plannerEventId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.passenger_id === null) return null;
  return { vehicleId: data.vehicle_id as number, passengerId: data.passenger_id as number };
}

type RpcResult = { ok: boolean; error?: string; action?: string; [key: string]: unknown };

async function callAssignmentRpc(planner: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await planner.rpc(fn, args);
  if (error) throw error;
  return data as RpcResult;
}

/** Verifies vehicle+passenger event-scope BEFORE invoking the RPC — the RPC/trigger independently re-verify too, but Portal's own check is the actual authorization boundary (plan.md). */
async function verifyVehicleAndPassengerInEvent(plannerEventId: number, vehicleId: number, passengerId: number): Promise<void> {
  const [vehicle, participant] = await Promise.all([getVehicle(plannerEventId, vehicleId), getParticipant(plannerEventId, passengerId)]);
  if (!vehicle) throw new PlannerLogisticsNotFoundError('Vehicle not found.');
  if (!participant) throw new PlannerLogisticsValidationError('This participant is not part of the current event.');
}

/**
 * Calls Planner's own `assign_or_board_passenger` RPC — never a hand-written
 * insert. If the RPC reports `needs_move` (the passenger already holds an
 * active assignment on a different vehicle within the same movement), this
 * follows up with `move_passenger_to_vehicle` to the requested vehicle —
 * still exclusively RPC-driven, matching the exact two-call sequence
 * Planner's own semantics already define.
 */
export async function assignPassenger(plannerEventId: number, vehicleId: number, passengerId: number, boarded = true): Promise<void> {
  await verifyVehicleAndPassengerInEvent(plannerEventId, vehicleId, passengerId);
  const planner = getPlannerAdminClient();

  const result = await callAssignmentRpc(planner, 'assign_or_board_passenger', { p_event_id: plannerEventId, p_vehicle_id: vehicleId, p_passenger_id: passengerId, p_boarded: boarded });
  if (result.ok) return;

  if (result.action === 'needs_move') {
    const moveResult = await callAssignmentRpc(planner, 'move_passenger_to_vehicle', { p_event_id: plannerEventId, p_new_vehicle_id: vehicleId, p_passenger_id: passengerId, p_boarded: boarded });
    if (!moveResult.ok) throw new PlannerLogisticsValidationError(`Could not assign this participant (${moveResult.action ?? moveResult.error ?? 'unknown error'}).`);
    return;
  }

  throw new PlannerLogisticsValidationError(`Could not assign this participant (${result.error ?? 'unknown error'}).`);
}

/** Calls Planner's own `move_passenger_to_vehicle` RPC. Move is scoped to the same movement (the RPC resolves the current assignment by the destination vehicle's own `movement_id`) — moving to a vehicle in a different movement will report `not_currently_assigned`. */
export async function movePassenger(plannerEventId: number, toVehicleId: number, passengerId: number, boarded = true): Promise<void> {
  await verifyVehicleAndPassengerInEvent(plannerEventId, toVehicleId, passengerId);
  const planner = getPlannerAdminClient();

  const result = await callAssignmentRpc(planner, 'move_passenger_to_vehicle', { p_event_id: plannerEventId, p_new_vehicle_id: toVehicleId, p_passenger_id: passengerId, p_boarded: boarded });
  if (!result.ok) {
    throw new PlannerLogisticsValidationError(`Could not move this participant (${result.action ?? result.error ?? 'unknown error'}).`);
  }
}

/** Calls Planner's own `unassign_passenger_from_vehicle` RPC. Never touches `event_passengers` or `passengers` — only the Ground Transport assignment is removed. */
export async function unassignPassenger(plannerEventId: number, vehicleId: number, passengerId: number): Promise<void> {
  const vehicle = await getVehicle(plannerEventId, vehicleId);
  if (!vehicle) throw new PlannerLogisticsNotFoundError('Vehicle not found.');

  const planner = getPlannerAdminClient();
  const result = await callAssignmentRpc(planner, 'unassign_passenger_from_vehicle', { p_event_id: plannerEventId, p_vehicle_id: vehicleId, p_passenger_id: passengerId });
  if (!result.ok) {
    throw new PlannerLogisticsValidationError(`Could not unassign this participant (${result.action ?? result.error ?? 'unknown error'}).`);
  }
}

export function normalizePlannerLogisticsError(err: unknown): { category: string; message: string } {
  if (err instanceof PlannerLogisticsValidationError) {
    return { category: err.code, message: err.message };
  }
  if (err instanceof PlannerLogisticsNotFoundError) {
    return { category: 'logistics_record_not_found', message: err.message };
  }
  console.error('plannerLogistics: unexpected error', err);
  return { category: 'planner_write_failed', message: 'Could not save — try again.' };
}
