'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PlannerFlightList } from '@/components/portal/PlannerFlightList';
import { PlannerFlightModal, type PlannerFlightClient, type ParticipantOption, type PlannerFlightFormValues } from '@/components/portal/PlannerFlightModal';
import { PlannerHotelList } from '@/components/portal/PlannerHotelList';
import { PlannerHotelModal, type PlannerHotelBookingClient, type PlannerHotelFormValues } from '@/components/portal/PlannerHotelModal';
import { PlannerGroundTransportList, type PlannerGroundTransportMovement, type PlannerGroundTransportVehicle, type PlannerAssignmentClient } from '@/components/portal/PlannerGroundTransportList';
import { PlannerMovementModal, type PlannerMovementFormValues } from '@/components/portal/PlannerMovementModal';
import { PlannerVehicleModal, type PlannerVehicleFormValues } from '@/components/portal/PlannerVehicleModal';
import { PlannerAssignPassengerModal, type VehicleOption } from '@/components/portal/PlannerAssignPassengerModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { useLatestRequest, isAbortError } from '@/lib/useLatestRequest';

/** Shared by Flights and Hotels CSV import: email (preferred) or exact full-name match against the already-loaded event roster. Zero or 2+ matches is never guessed. */
function resolveParticipantForCsv(roster: ParticipantOption[], identifier: string): { status: 'matched'; participant: ParticipantOption } | { status: 'not_found' } | { status: 'ambiguous' } {
  const trimmed = identifier.trim();
  if (!trimmed) return { status: 'not_found' };
  const isEmailLike = trimmed.includes('@');
  const matches = isEmailLike
    ? roster.filter((p) => p.email?.trim().toLowerCase() === trimmed.toLowerCase())
    : roster.filter((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (matches.length === 1) return { status: 'matched', participant: matches[0] };
  if (matches.length > 1) return { status: 'ambiguous' };
  return { status: 'not_found' };
}

type FlightCsvRow = {
  passengerId: number;
  flightType: string;
  flightDate: string;
  flightCode: string;
  region: string;
  departureTime: string;
  arrivalTime: string;
  stops: string;
  notes: string;
};

const FLIGHT_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'participant', label: 'Participant (email preferred, or exact full name)', required: true },
  { key: 'flightType', label: 'Leg (arrival/departure)', required: true },
  { key: 'flightDate', label: 'Flight Date (YYYY-MM-DD)', required: true },
  { key: 'flightCode', label: 'Flight Code' },
  { key: 'region', label: 'Region' },
  { key: 'departureTime', label: 'Departure Time (HH:MM)' },
  { key: 'arrivalTime', label: 'Arrival Time (HH:MM)' },
  { key: 'stops', label: 'Stops' },
  { key: 'notes', label: 'Notes' },
];

const FLIGHT_CSV_SAMPLES: Record<string, string>[] = [
  { participant: 'jane@example.com', flightType: 'arrival', flightDate: '2026-08-01', flightCode: 'BA123', region: '', departureTime: '10:00', arrivalTime: '14:30', stops: 'Direct', notes: '' },
  { participant: 'John Smith', flightType: 'departure', flightDate: '2026-08-05', flightCode: 'BA456', region: '', departureTime: '16:00', arrivalTime: '', stops: 'Direct', notes: '' },
];

type HotelCsvRow = {
  passengerId: number;
  accommodationRequired: string;
  country: string;
  hotelName: string;
  roomNumber: string;
  roomingLabel: string;
  checkInDate: string;
  checkOutDate: string;
  nightsCount: string;
  specialStayPattern: string;
  notes: string;
};

const HOTEL_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'participant', label: 'Participant (email preferred, or exact full name)', required: true },
  { key: 'accommodationRequired', label: 'Accommodation Required (true/false)' },
  { key: 'country', label: 'Country' },
  { key: 'hotelName', label: 'Hotel Name' },
  { key: 'roomNumber', label: 'Room Number' },
  { key: 'roomingLabel', label: 'Rooming Label' },
  { key: 'checkInDate', label: 'Check-in Date (YYYY-MM-DD)' },
  { key: 'checkOutDate', label: 'Check-out Date (YYYY-MM-DD)' },
  { key: 'nightsCount', label: 'Nights' },
  { key: 'specialStayPattern', label: 'Special Stay Pattern' },
  { key: 'notes', label: 'Notes' },
];

const HOTEL_CSV_SAMPLES: Record<string, string>[] = [
  {
    participant: 'jane@example.com',
    accommodationRequired: 'true',
    country: '',
    hotelName: 'Grand Hotel',
    roomNumber: '204',
    roomingLabel: '',
    checkInDate: '2026-08-01',
    checkOutDate: '2026-08-03',
    nightsCount: '2',
    specialStayPattern: '',
    notes: '',
  },
  {
    participant: 'John Smith',
    accommodationRequired: 'false',
    country: '',
    hotelName: '',
    roomNumber: '',
    roomingLabel: '',
    checkInDate: '',
    checkOutDate: '',
    nightsCount: '',
    specialStayPattern: '',
    notes: 'Arranging own accommodation',
  },
];

/**
 * Feature 012/013 — Bendie Planner Logistics (Flights + Hotels + Ground
 * Transport). One page, three internal sub-tabs (local state, not separate
 * `EVENT_SECTIONS` entries — plan.md's "one workspace module" decision).
 * State machine identical to `planner-people/page.tsx`. The participant
 * roster is fetched once (from Feature 011's own `GET .../planner-people`,
 * never duplicated) and shared by every create modal. Ground Transport
 * reuses the same capability already resolved from the Flights response —
 * no second capability fetch (Feature 013 plan.md).
 */

type LogisticsCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };
type ConfigStatus = 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error';
type SubTab = 'flights' | 'hotels' | 'groundTransport';

/** Portal UX continuation (016) — sub-tab lives in `?view=` so a refresh/deep-link lands where the user actually was, instead of always resetting to Flights. Invalid/missing values safely default to Flights. */
const VIEW_TO_SUBTAB: Record<string, SubTab> = { flights: 'flights', hotels: 'hotels', 'ground-transport': 'groundTransport' };
const SUBTAB_TO_VIEW: Record<SubTab, string> = { flights: 'flights', hotels: 'hotels', groundTransport: 'ground-transport' };

type PageState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'configuring'; status: ConfigStatus }
  | {
      kind: 'loaded';
      capability: Extract<LogisticsCapability, { hasPlannerIdentity: true }>;
      flights: PlannerFlightClient[];
      bookings: PlannerHotelBookingClient[];
      movements: PlannerGroundTransportMovement[];
      participants: ParticipantOption[];
    };

/** Ephemeral "who is this modal acting on" context for the assign/move flow — not persisted state. */
type AssignTarget = { kind: 'assign'; vehicle: PlannerGroundTransportVehicle };
type MoveTarget = { kind: 'move'; assignment: PlannerAssignmentClient; movement: PlannerGroundTransportMovement };

export default function PlannerLogisticsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [subTab, setSubTabState] = useState<SubTab>(() => VIEW_TO_SUBTAB[searchParams.get('view') ?? ''] ?? 'flights');

  const setSubTab = useCallback(
    (next: SubTab) => {
      setSubTabState(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', SUBTAB_TO_VIEW[next]);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  // Deep links (e.g. from People's contextual actions, or the Dashboard's
  // readiness cards) may navigate here with a different `?view=` while the
  // page is already mounted — sync `subTab` to match. `setSubTab` above
  // already keeps the URL in lockstep with in-page tab clicks, so this never
  // fights with that: after a click, `searchParams` already agrees with
  // `subTab`, and this effect no-ops.
  useEffect(() => {
    const mapped = VIEW_TO_SUBTAB[searchParams.get('view') ?? ''];
    if (mapped && mapped !== subTab) setSubTabState(mapped);
  }, [searchParams, subTab]);

  // Portal UX continuation (016) — a deep link from People's contextual
  // actions (`?participant=<id>`) opens the matching create modal
  // preselected to that participant, then clears the param so a refresh
  // doesn't reopen it. Only fires once the roster has actually loaded (so
  // the participant select has options to preselect against) and only for
  // the flights/hotels sub-tabs — Ground Transport has no per-participant
  // create modal to preselect, so `?view=ground-transport` alone already
  // does the useful part of the deep link.
  const consumedParticipantParamRef = useRef(false);
  useEffect(() => {
    if (state.kind !== 'loaded') return;
    const participantParam = searchParams.get('participant');
    if (!participantParam || consumedParticipantParamRef.current) return;
    consumedParticipantParamRef.current = true;
    const exists = state.participants.some((p) => String(p.id) === participantParam);
    if (exists) {
      const view = VIEW_TO_SUBTAB[searchParams.get('view') ?? ''] ?? 'flights';
      if (view === 'hotels') {
        setEditingBooking(null);
        setLastHotelParticipantId(participantParam);
        setHotelModalOpen(true);
      } else if (view === 'flights') {
        setEditingFlight(null);
        setLastFlightParticipantId(participantParam);
        setFlightModalOpen(true);
      }
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('participant');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [state, searchParams, pathname, router]);

  const [flightModalOpen, setFlightModalOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<PlannerFlightClient | null>(null);
  const [flightModalResetKey, setFlightModalResetKey] = useState(0);
  const [lastFlightParticipantId, setLastFlightParticipantId] = useState<string | undefined>(undefined);
  const [hotelModalOpen, setHotelModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<PlannerHotelBookingClient | null>(null);
  const [hotelModalResetKey, setHotelModalResetKey] = useState(0);
  const [lastHotelParticipantId, setLastHotelParticipantId] = useState<string | undefined>(undefined);

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<PlannerGroundTransportMovement | null>(null);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<PlannerGroundTransportVehicle | null>(null);
  const [vehicleModalMovementId, setVehicleModalMovementId] = useState<number | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | MoveTarget | null>(null);
  const [assignPartialFailures, setAssignPartialFailures] = useState<string[] | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<{ category: string; message: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Rapid-navigation performance pass — see src/lib/useLatestRequest.ts.
  const startRequest = useLatestRequest();

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const signal = startRequest();
    setState({ kind: 'loading' });
    try {
      const [flightsRes, hotelsRes, movementsRes, peopleRes] = await Promise.all([
        fetch(`/api/events/${eventId}/planner-logistics/flights`, { signal }),
        fetch(`/api/events/${eventId}/planner-logistics/hotels`, { signal }),
        fetch(`/api/events/${eventId}/planner-logistics/ground-transport/movements`, { signal }),
        fetch(`/api/events/${eventId}/planner-people`, { signal }),
      ]);
      if (requestIdRef.current !== requestId) return;

      if (!flightsRes.ok || !hotelsRes.ok || !movementsRes.ok) {
        setState({ kind: 'denied' });
        return;
      }
      const flightsData = await flightsRes.json();
      const hotelsData = await hotelsRes.json();
      const movementsData = await movementsRes.json();
      if (requestIdRef.current !== requestId) return;

      if (flightsData.status) {
        setState({ kind: 'configuring', status: flightsData.status });
        return;
      }

      const peopleData = peopleRes.ok ? await peopleRes.json() : null;
      const participants: ParticipantOption[] = (peopleData?.participants ?? []).map((p: { id: number; fullName: string; email: string | null }) => ({
        id: p.id,
        name: p.fullName,
        email: p.email,
      }));

      setState({
        kind: 'loaded',
        capability: flightsData.capability,
        flights: flightsData.flights ?? [],
        bookings: hotelsData.bookings ?? [],
        movements: movementsData.movements ?? [],
        participants,
      });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      if (isAbortError(err)) return;
      console.error('Failed to load Planner Logistics', err);
      setState({ kind: 'configuring', status: 'backend_error' });
    }
  }, [eventId, startRequest]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const openCreateFlight = () => {
    setEditingFlight(null);
    setLastFlightParticipantId(undefined);
    setModalError(null);
    setFlightModalOpen(true);
  };
  const openEditFlight = (flight: PlannerFlightClient) => {
    setEditingFlight(flight);
    setModalError(null);
    setFlightModalOpen(true);
  };
  const closeFlightModal = () => {
    if (submitting) return;
    setFlightModalOpen(false);
    setModalError(null);
  };

  const openCreateHotel = () => {
    setEditingBooking(null);
    setLastHotelParticipantId(undefined);
    setModalError(null);
    setHotelModalOpen(true);
  };
  const openEditHotel = (booking: PlannerHotelBookingClient) => {
    setEditingBooking(booking);
    setModalError(null);
    setHotelModalOpen(true);
  };
  const closeHotelModal = () => {
    if (submitting) return;
    setHotelModalOpen(false);
    setModalError(null);
  };

  const handleFlightSubmit = async (values: PlannerFlightFormValues, keepOpen: boolean) => {
    setSubmitting(true);
    setModalError(null);
    const body = {
      ...(editingFlight ? {} : { passengerId: Number(values.passengerId) }),
      flightType: values.flightType,
      flightCode: values.flightCode || null,
      region: values.region || null,
      flightDate: values.flightDate,
      departureTime: values.departureTime || null,
      arrivalTime: values.arrivalTime || null,
      stops: values.stops || null,
      notes: values.notes || null,
    };
    try {
      const res = editingFlight
        ? await fetch(`/api/events/${eventId}/planner-logistics/flights/${editingFlight.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/events/${eventId}/planner-logistics/flights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      toast.success(editingFlight ? 'Flight updated' : 'Flight added');
      if (!editingFlight && keepOpen) {
        setFlightModalResetKey((k) => k + 1);
        setLastFlightParticipantId(values.passengerId);
      } else {
        setFlightModalOpen(false);
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: flight save failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  // Current event roster + existing flights, only available once loaded — used for synchronous participant resolution and duplicate-leg detection.
  const rosterForCsv: ParticipantOption[] = state.kind === 'loaded' ? state.participants : [];
  const flightsForCsv: PlannerFlightClient[] = state.kind === 'loaded' ? state.flights : [];
  const bookingsForCsv: PlannerHotelBookingClient[] = state.kind === 'loaded' ? state.bookings : [];

  const parseFlightCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<FlightCsvRow> => {
    const errors: string[] = [];
    const participantId = getField(raw, 'participant');
    const match = resolveParticipantForCsv(rosterForCsv, participantId);
    if (match.status === 'not_found') errors.push('No participant matching this identifier exists in this event');
    if (match.status === 'ambiguous') errors.push('Multiple participants match this identifier — ambiguous');

    const flightType = getField(raw, 'flightType').toLowerCase();
    if (flightType !== 'arrival' && flightType !== 'departure') errors.push('flightType must be "arrival" or "departure"');
    const flightDate = getField(raw, 'flightDate');
    if (!flightDate) errors.push('flightDate is required');

    if (match.status === 'matched' && flightType && flightDate) {
      const flightCode = getField(raw, 'flightCode') || null;
      const isDuplicate = flightsForCsv.some(
        (f) => f.passengerId === match.participant.id && f.flightType === flightType && f.flightDate === flightDate && (f.flightCode ?? null) === flightCode
      );
      if (isDuplicate) errors.push('An identical flight leg already exists for this participant');
    }

    const data: FlightCsvRow = {
      passengerId: match.status === 'matched' ? match.participant.id : 0,
      flightType,
      flightDate,
      flightCode: getField(raw, 'flightCode'),
      region: getField(raw, 'region'),
      departureTime: getField(raw, 'departureTime'),
      arrivalTime: getField(raw, 'arrivalTime'),
      stops: getField(raw, 'stops'),
      notes: getField(raw, 'notes'),
    };
    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  const importFlightRow = async (row: FlightCsvRow) => {
    const res = await fetch(`/api/events/${eventId}/planner-logistics/flights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passengerId: row.passengerId,
        flightType: row.flightType,
        flightDate: row.flightDate,
        flightCode: row.flightCode || null,
        region: row.region || null,
        departureTime: row.departureTime || null,
        arrivalTime: row.arrivalTime || null,
        stops: row.stops || null,
        notes: row.notes || null,
      }),
    });
    if (res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return { error: data.message ?? 'Could not save this row.' };
  };

  const parseHotelCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<HotelCsvRow> => {
    const errors: string[] = [];
    const participantId = getField(raw, 'participant');
    const match = resolveParticipantForCsv(rosterForCsv, participantId);
    if (match.status === 'not_found') errors.push('No participant matching this identifier exists in this event');
    if (match.status === 'ambiguous') errors.push('Multiple participants match this identifier — ambiguous');

    const roomNumber = getField(raw, 'roomNumber');
    if (roomNumber && Number.isNaN(Number(roomNumber))) errors.push('roomNumber must be a number');
    const nightsCount = getField(raw, 'nightsCount');
    if (nightsCount && Number.isNaN(Number(nightsCount))) errors.push('nightsCount must be a number');

    const checkInDate = getField(raw, 'checkInDate') || null;
    const checkOutDate = getField(raw, 'checkOutDate') || null;
    const hotelName = getField(raw, 'hotelName') || null;
    if (match.status === 'matched') {
      const isDuplicate = bookingsForCsv.some(
        (b) => b.passengerId === match.participant.id && (b.hotelName ?? null) === hotelName && (b.checkInDate ?? null) === checkInDate && (b.checkOutDate ?? null) === checkOutDate
      );
      if (isDuplicate) errors.push('An identical hotel booking already exists for this participant');
    }

    const data: HotelCsvRow = {
      passengerId: match.status === 'matched' ? match.participant.id : 0,
      accommodationRequired: getField(raw, 'accommodationRequired'),
      country: getField(raw, 'country'),
      hotelName: getField(raw, 'hotelName'),
      roomNumber,
      roomingLabel: getField(raw, 'roomingLabel'),
      checkInDate: getField(raw, 'checkInDate'),
      checkOutDate: getField(raw, 'checkOutDate'),
      nightsCount,
      specialStayPattern: getField(raw, 'specialStayPattern'),
      notes: getField(raw, 'notes'),
    };
    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  const importHotelRow = async (row: HotelCsvRow) => {
    const accommodationRequired = row.accommodationRequired.trim() === '' ? true : ['true', 'yes', '1'].includes(row.accommodationRequired.trim().toLowerCase());
    const res = await fetch(`/api/events/${eventId}/planner-logistics/hotels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passengerId: row.passengerId,
        country: row.country || null,
        hotelName: row.hotelName || null,
        roomNumber: row.roomNumber ? Number(row.roomNumber) : null,
        roomingLabel: row.roomingLabel || null,
        accommodationRequired,
        checkInDate: row.checkInDate || null,
        checkOutDate: row.checkOutDate || null,
        nightsCount: row.nightsCount ? Number(row.nightsCount) : null,
        specialStayPattern: row.specialStayPattern || null,
        notes: row.notes || null,
      }),
    });
    if (res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return { error: data.message ?? 'Could not save this row.' };
  };

  const handleToggleMarked = async (flight: PlannerFlightClient, next: boolean) => {
    setBusyId(flight.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-logistics/flights/${flight.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marked: next }),
      });
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error('Could not update.');
        return;
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: marked toggle failed', err);
      toast.error('Could not update.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  const handleDeleteFlight = async (flight: PlannerFlightClient) => {
    const ok = await confirm({ message: `Delete this flight for ${flight.passengerName}?`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(flight.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-logistics/flights/${flight.id}`, { method: 'DELETE' });
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error('Could not delete flight.');
        return;
      }
      toast.success('Flight deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: flight delete failed', err);
      toast.error('Could not delete flight.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  const handleHotelSubmit = async (values: PlannerHotelFormValues, keepOpen: boolean) => {
    setSubmitting(true);
    setModalError(null);
    const body = {
      ...(editingBooking ? {} : { passengerId: Number(values.passengerId) }),
      country: values.country || null,
      hotelName: values.hotelName || null,
      roomNumber: values.roomNumber ? Number(values.roomNumber) : null,
      roomingLabel: values.roomingLabel || null,
      accommodationRequired: values.accommodationRequired,
      checkInDate: values.checkInDate || null,
      checkOutDate: values.checkOutDate || null,
      nightsCount: values.nightsCount ? Number(values.nightsCount) : null,
      specialStayPattern: values.specialStayPattern || null,
      notes: values.notes || null,
    };
    try {
      const res = editingBooking
        ? await fetch(`/api/events/${eventId}/planner-logistics/hotels/${editingBooking.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/events/${eventId}/planner-logistics/hotels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      toast.success(editingBooking ? 'Hotel booking updated' : 'Hotel booking added');
      if (!editingBooking && keepOpen) {
        setHotelModalResetKey((k) => k + 1);
        setLastHotelParticipantId(values.passengerId);
      } else {
        setHotelModalOpen(false);
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: hotel save failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleDeleteHotel = async (booking: PlannerHotelBookingClient) => {
    const ok = await confirm({ message: `Delete this hotel booking for ${booking.passengerName}?`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(booking.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-logistics/hotels/${booking.id}`, { method: 'DELETE' });
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error('Could not delete booking.');
        return;
      }
      toast.success('Hotel booking deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: hotel delete failed', err);
      toast.error('Could not delete booking.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  // ---- Ground Transport (Feature 013) ----

  const openCreateMovement = () => {
    setEditingMovement(null);
    setModalError(null);
    setMovementModalOpen(true);
  };
  const openEditMovement = (movement: PlannerGroundTransportMovement) => {
    setEditingMovement(movement);
    setModalError(null);
    setMovementModalOpen(true);
  };
  const closeMovementModal = () => {
    if (submitting) return;
    setMovementModalOpen(false);
    setModalError(null);
  };

  const handleMovementSubmit = async (values: PlannerMovementFormValues) => {
    setSubmitting(true);
    setModalError(null);
    const body = { movementName: values.movementName, route: values.route, movementDate: values.movementDate, pickupTime: values.pickupTime || null, notes: values.notes || null };
    try {
      const res = editingMovement
        ? await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/movements/${editingMovement.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/movements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      setMovementModalOpen(false);
      if (!editingMovement && data.movement?.id) {
        // Portal UX continuation (016) — workflow continuity: a brand-new
        // movement has no vehicles yet, so the obvious next step is adding
        // one. Editing an existing movement never chains into anything.
        toast.success('Movement created — add a vehicle');
        setEditingVehicle(null);
        setVehicleModalMovementId(data.movement.id);
        setModalError(null);
        setVehicleModalOpen(true);
      } else {
        toast.success('Movement updated');
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: movement save failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleDeleteMovement = async (movement: PlannerGroundTransportMovement) => {
    const ok = await confirm({ message: `Delete "${movement.movementName}"? This cannot be undone.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(movement.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/movements/${movement.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error(data.message ?? 'Could not delete movement.');
        return;
      }
      toast.success('Movement deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: movement delete failed', err);
      toast.error('Could not delete movement.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  const openCreateVehicle = (movement: PlannerGroundTransportMovement) => {
    setEditingVehicle(null);
    setVehicleModalMovementId(movement.id);
    setModalError(null);
    setVehicleModalOpen(true);
  };
  const openEditVehicle = (vehicle: PlannerGroundTransportVehicle) => {
    setEditingVehicle(vehicle);
    setVehicleModalMovementId(vehicle.movementId);
    setModalError(null);
    setVehicleModalOpen(true);
  };
  const closeVehicleModal = () => {
    if (submitting) return;
    setVehicleModalOpen(false);
    setModalError(null);
  };

  const handleVehicleSubmit = async (values: PlannerVehicleFormValues) => {
    if (!vehicleModalMovementId) return;
    setSubmitting(true);
    setModalError(null);
    const body = {
      ...(editingVehicle ? {} : { movementId: vehicleModalMovementId }),
      vehicleType: values.vehicleType,
      vehicleNo: Number(values.vehicleNo),
      maxCapacity: Number(values.maxCapacity),
      date: values.date,
      route: values.route,
      pickupTime: values.pickupTime || null,
      endTime: values.endTime || null,
      status: values.status || null,
      notes: values.notes || null,
    };
    try {
      const res = editingVehicle
        ? await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/vehicles/${editingVehicle.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/vehicles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      setVehicleModalOpen(false);
      if (!editingVehicle && data.vehicle) {
        // Portal UX continuation (016) — a brand-new vehicle has zero
        // assignments, so the obvious next step is assigning passengers to
        // it. `data.vehicle` is fresh from the create response — genuinely
        // `assignments: []`/`occupancy: 0`, so it's safe to use directly
        // without a refetch.
        toast.success('Vehicle added — assign passengers');
        setModalError(null);
        setAssignPartialFailures(undefined);
        setAssignTarget({ kind: 'assign', vehicle: data.vehicle });
      } else {
        toast.success('Vehicle updated');
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: vehicle save failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleDeleteVehicle = async (vehicle: PlannerGroundTransportVehicle) => {
    const ok = await confirm({ message: `Delete this vehicle (${vehicle.vehicleType} #${vehicle.vehicleNo})?`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(vehicle.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/vehicles/${vehicle.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error(data.message ?? 'Could not delete vehicle.');
        return;
      }
      toast.success('Vehicle deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: vehicle delete failed', err);
      toast.error('Could not delete vehicle.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  const openAssign = (vehicle: PlannerGroundTransportVehicle) => {
    setModalError(null);
    setAssignPartialFailures(undefined);
    setAssignTarget({ kind: 'assign', vehicle });
  };
  const openMove = (assignment: PlannerAssignmentClient, movement: PlannerGroundTransportMovement) => {
    setModalError(null);
    setAssignPartialFailures(undefined);
    setAssignTarget({ kind: 'move', assignment, movement });
  };
  const closeAssignModal = () => {
    if (submitting) return;
    setAssignTarget(null);
    setAssignPartialFailures(undefined);
  };

  // Portal UX continuation (016) — multi-passenger assign UI (section 6 of
  // the brief). The canonical `assign_or_board_passenger` RPC is still
  // called exactly once per passenger via the existing single-assignment
  // endpoint — never a bulk RPC, never bypassed. Partial failure is reported
  // honestly (no claim of transactional atomicity): successes are kept,
  // failures are named and left selectable to retry. "Move" is unaffected —
  // always a single passenger to a single destination vehicle.
  const handleAssignSubmit = async (input: number | number[]) => {
    if (!assignTarget) return;
    setSubmitting(true);
    setModalError(null);
    setAssignPartialFailures(undefined);
    const rosterForNames = state.kind === 'loaded' ? state.participants : [];
    try {
      if (assignTarget.kind === 'assign') {
        const passengerIds = Array.isArray(input) ? input : [input];
        const outcomes = await Promise.allSettled(
          passengerIds.map(async (passengerId) => {
            const res = await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/assignments/assign`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vehicleId: assignTarget.vehicle.id, passengerId }),
            });
            if (!res.ok) throw new Error(String(passengerId));
          })
        );
        if (!mountedRef.current) return;
        const failedIds = new Set<number>();
        outcomes.forEach((o, i) => {
          if (o.status === 'rejected') failedIds.add(passengerIds[i]);
        });
        const succeededCount = passengerIds.length - failedIds.size;
        if (failedIds.size === 0) {
          toast.success(succeededCount > 1 ? `${succeededCount} participants assigned` : 'Participant assigned');
          setAssignTarget(null);
        } else if (succeededCount === 0) {
          setModalError({ category: 'planner_write_failed', message: 'Could not assign — try again.' });
        } else {
          const failedNames = Array.from(failedIds).map((id) => rosterForNames.find((p) => p.id === id)?.name ?? `#${id}`);
          toast.error(`${succeededCount} assigned, ${failedIds.size} failed`);
          setAssignPartialFailures(failedNames);
        }
        await load();
      } else {
        const toVehicleId = input as number;
        const res = await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/assignments/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toVehicleId, passengerId: assignTarget.assignment.passengerId }),
        });
        const data = await res.json();
        if (!mountedRef.current) return;
        if (!res.ok) {
          setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
          return;
        }
        toast.success('Participant moved');
        setAssignTarget(null);
        await load();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: assignment save failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleUnassign = async (assignment: PlannerAssignmentClient) => {
    const ok = await confirm({ message: `Unassign ${assignment.passengerName} from this vehicle?`, confirmLabel: 'Unassign', destructive: true });
    if (!ok) return;
    setBusyId(assignment.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-logistics/ground-transport/assignments/${assignment.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error(data.message ?? 'Could not unassign.');
        return;
      }
      toast.success('Participant unassigned');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Logistics: unassign failed', err);
      toast.error('Could not unassign.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div>
        <SectionHeader sectionKey="planner-logistics" />
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-[20px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === 'denied') {
    return (
      <div>
        <SectionHeader sectionKey="planner-logistics" />
        <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t load Logistics</h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">You may not have access to this, or you may need to sign in again.</p>
        </div>
      </div>
    );
  }

  if (state.kind === 'configuring') {
    const copy: Record<ConfigStatus, { icon: string; message: string; warn?: boolean }> = {
      pending: { icon: 'hourglass_top', message: 'Setting up Bendie Planner for this event…' },
      stale: { icon: 'support_agent', message: 'Bendie Planner setup is taking longer than expected. Please contact your administrator or support for assistance.', warn: true },
      failed: { icon: 'error', message: 'Bendie Planner setup didn’t complete. Please contact your administrator or support for assistance.', warn: true },
      unavailable: { icon: 'link_off', message: 'Bendie Planner hasn’t been fully set up for this event yet.' },
      backend_error: { icon: 'cloud_off', message: 'Couldn’t load Logistics right now — try again in a moment.' },
    };
    const { icon, message, warn } = copy[state.status];
    return (
      <div>
        <SectionHeader sectionKey="planner-logistics" />
        <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${warn ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low'}`}>
          <span className={`material-symbols-outlined ${warn ? 'text-amber-600' : 'text-on-surface-variant'}`}>{icon}</span>
          <p className={`text-sm ${warn ? 'text-amber-800' : 'text-on-surface-variant'}`}>{message}</p>
        </div>
      </div>
    );
  }

  const { capability, flights, bookings, movements, participants } = state;

  const addButtonHandler = subTab === 'flights' ? openCreateFlight : subTab === 'hotels' ? openCreateHotel : openCreateMovement;
  const addButtonLabel = subTab === 'flights' ? 'Add Flight' : subTab === 'hotels' ? 'Add Hotel Booking' : 'Add Movement';

  // Portal UX continuation (016) — a truthful summary computed from the same
  // data this page already fetched for its three sub-tabs (no new requests).
  // Coverage is deliberately "participants with at least one record," not a
  // fabricated percentage — the denominator (participants.length) and the
  // definition of "configured" are both explicit and visible.
  const participantTotal = participants.length;
  const flightsCoveredCount = new Set(flights.map((f) => f.passengerId)).size;
  const hotelsCoveredCount = new Set(bookings.map((b) => b.passengerId)).size;
  const groundTransportAssignedCount = new Set(
    movements.flatMap((m) => m.vehicles.flatMap((v) => v.assignments.map((a) => a.passengerId)))
  ).size;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader sectionKey="planner-logistics" />
        {capability.canManage && (
          <div className="flex gap-2">
            {(subTab === 'flights' || subTab === 'hotels') && (
              <button className="btn-secondary" onClick={() => setCsvModalOpen(true)}>
                Import CSV
              </button>
            )}
            <button className="btn-primary" onClick={addButtonHandler}>
              {addButtonLabel}
            </button>
          </div>
        )}
      </div>

      {participantTotal > 0 && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button type="button" onClick={() => setSubTab('flights')} className="text-left bg-white border border-outline-variant/60 rounded-xl p-3 hover:border-primary/40 transition-colors">
            <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Participants</p>
            <p className="text-lg font-bold text-on-surface mt-0.5">{participantTotal}</p>
          </button>
          <button type="button" onClick={() => setSubTab('flights')} className="text-left bg-white border border-outline-variant/60 rounded-xl p-3 hover:border-primary/40 transition-colors">
            <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Flights</p>
            <p className="text-sm font-semibold text-on-surface mt-0.5">
              {flightsCoveredCount} configured{flightsCoveredCount < participantTotal && <span className="text-amber-600"> · {participantTotal - flightsCoveredCount} need attention</span>}
            </p>
          </button>
          <button type="button" onClick={() => setSubTab('hotels')} className="text-left bg-white border border-outline-variant/60 rounded-xl p-3 hover:border-primary/40 transition-colors">
            <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Accommodation</p>
            <p className="text-sm font-semibold text-on-surface mt-0.5">
              {hotelsCoveredCount} booked{hotelsCoveredCount < participantTotal && <span className="text-amber-600"> · {participantTotal - hotelsCoveredCount} need attention</span>}
            </p>
          </button>
          <button type="button" onClick={() => setSubTab('groundTransport')} className="text-left bg-white border border-outline-variant/60 rounded-xl p-3 hover:border-primary/40 transition-colors">
            <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Ground Transport</p>
            <p className="text-sm font-semibold text-on-surface mt-0.5">
              {groundTransportAssignedCount} assigned{groundTransportAssignedCount < participantTotal && <span className="text-amber-600"> · {participantTotal - groundTransportAssignedCount} unassigned</span>}
            </p>
          </button>
        </div>
      )}

      <div className="flex gap-2 mt-6 mb-4 border-b border-outline-variant/30">
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium ${subTab === 'flights' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}
          onClick={() => setSubTab('flights')}
        >
          Flights
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium ${subTab === 'hotels' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}
          onClick={() => setSubTab('hotels')}
        >
          Hotels
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium ${subTab === 'groundTransport' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}
          onClick={() => setSubTab('groundTransport')}
        >
          Ground Transport
        </button>
      </div>

      {subTab === 'flights' && (
        <PlannerFlightList
          flights={flights}
          canManage={capability.canManage}
          busyId={busyId}
          onEdit={openEditFlight}
          onDelete={handleDeleteFlight}
          onToggleMarked={handleToggleMarked}
          onAdd={openCreateFlight}
          onImportCsv={() => setCsvModalOpen(true)}
        />
      )}
      {subTab === 'hotels' && (
        <PlannerHotelList
          bookings={bookings}
          canManage={capability.canManage}
          busyId={busyId}
          onEdit={openEditHotel}
          onDelete={handleDeleteHotel}
          onAdd={openCreateHotel}
          onImportCsv={() => setCsvModalOpen(true)}
        />
      )}
      {subTab === 'groundTransport' && (
        <PlannerGroundTransportList
          movements={movements}
          canManage={capability.canManage}
          busyId={busyId}
          onEditMovement={openEditMovement}
          onDeleteMovement={handleDeleteMovement}
          onAddVehicle={openCreateVehicle}
          onEditVehicle={openEditVehicle}
          onDeleteVehicle={handleDeleteVehicle}
          onAssign={openAssign}
          onMove={(assignment) => {
            const movement = movements.find((m) => m.id === assignment.movementId);
            if (movement) openMove(assignment, movement);
          }}
          onUnassign={handleUnassign}
          onAddMovement={openCreateMovement}
        />
      )}

      <PlannerFlightModal
        key={flightModalResetKey}
        open={flightModalOpen}
        editing={editingFlight}
        participants={participants}
        submitting={submitting}
        serverError={modalError}
        onClose={closeFlightModal}
        onSubmit={handleFlightSubmit}
        presetParticipantId={lastFlightParticipantId}
      />
      <PlannerHotelModal
        key={hotelModalResetKey}
        open={hotelModalOpen}
        editing={editingBooking}
        participants={participants}
        submitting={submitting}
        serverError={modalError}
        onClose={closeHotelModal}
        onSubmit={handleHotelSubmit}
        presetParticipantId={lastHotelParticipantId}
      />
      <PlannerMovementModal open={movementModalOpen} editing={editingMovement} submitting={submitting} serverError={modalError} onClose={closeMovementModal} onSubmit={handleMovementSubmit} />
      <PlannerVehicleModal open={vehicleModalOpen} editing={editingVehicle} submitting={submitting} serverError={modalError} onClose={closeVehicleModal} onSubmit={handleVehicleSubmit} />
      {assignTarget?.kind === 'assign' && (
        <PlannerAssignPassengerModal
          open
          mode="assign"
          vehicleLabel={`${assignTarget.vehicle.vehicleType} #${assignTarget.vehicle.vehicleNo}`}
          participants={participants}
          submitting={submitting}
          serverError={modalError}
          partialFailures={assignPartialFailures}
          onClose={closeAssignModal}
          onSubmit={handleAssignSubmit}
        />
      )}
      {assignTarget?.kind === 'move' && (
        <PlannerAssignPassengerModal
          open
          mode="move"
          passengerName={assignTarget.assignment.passengerName}
          destinationVehicles={assignTarget.movement.vehicles
            .filter((v) => v.id !== assignTarget.assignment.vehicleId)
            .map((v): VehicleOption => ({ id: v.id, label: `${v.vehicleType} #${v.vehicleNo} (${v.occupancy}/${v.maxCapacity})` }))}
          submitting={submitting}
          serverError={modalError}
          onClose={closeAssignModal}
          onSubmit={handleAssignSubmit}
        />
      )}
      {subTab === 'flights' && (
        <CsvImportModal<FlightCsvRow>
          open={csvModalOpen}
          onClose={() => setCsvModalOpen(false)}
          onImported={load}
          title="Import Flights"
          templateFilename="flights-template.csv"
          columns={FLIGHT_CSV_COLUMNS}
          sampleRows={FLIGHT_CSV_SAMPLES}
          parseRow={parseFlightCsvRow}
          importRow={importFlightRow}
        />
      )}
      {subTab === 'hotels' && (
        <CsvImportModal<HotelCsvRow>
          open={csvModalOpen}
          onClose={() => setCsvModalOpen(false)}
          onImported={load}
          title="Import Hotel Bookings"
          templateFilename="hotels-template.csv"
          columns={HOTEL_CSV_COLUMNS}
          sampleRows={HOTEL_CSV_SAMPLES}
          parseRow={parseHotelCsvRow}
          importRow={importHotelRow}
        />
      )}
    </div>
  );
}
