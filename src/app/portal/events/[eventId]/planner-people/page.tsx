'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { hasActiveTravelJourney, completeTravelJourney } from '@/lib/travelReturnContext';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabaseClient';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PlannerPeopleList, type ParticipantLogisticsInfo } from '@/components/portal/PlannerPeopleList';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import {
  PlannerPeopleModal,
  type PlannerParticipantClient,
  type PlannerParticipantSearchResult,
  type PlannerParticipantFormValues,
} from '@/components/portal/PlannerPeopleModal';
import { AddParticipantMenu } from '@/components/portal/AddParticipantMenu';
import { AddParticipantFromPortalModal } from '@/components/portal/AddParticipantFromPortalModal';
import { matchOrCreateParticipant } from '@/lib/plannerParticipantMatching';
import { resolveEventProductContext } from '@/lib/eventTeamProvisioning';
import { useLatestRequest, isAbortError } from '@/lib/useLatestRequest';

type PersonCsvRow = { fullName: string; title: string; passport: string; dietaryRequirements: string; gender: string; email: string; phone: string };

const PEOPLE_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'fullName', label: 'Full Name', required: true },
  { key: 'title', label: 'Title' },
  { key: 'passport', label: 'Passport' },
  { key: 'dietaryRequirements', label: 'Dietary Requirements' },
  { key: 'gender', label: 'Gender' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
];

const PEOPLE_CSV_SAMPLES: Record<string, string>[] = [{ fullName: 'Jane Doe', title: 'Ms', passport: '', dietaryRequirements: 'Vegetarian', gender: '', email: 'jane@example.com', phone: '' }];

/**
 * Feature 011 — Bendie Planner People/Participants. Fetches
 * GET /api/events/[eventId]/planner-people (list + capability) and renders
 * exactly one of the states below. Identical state machine to
 * `planner-checklist/page.tsx`.
 */

type PeopleCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

type ConfigStatus = 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error';

type PageState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'configuring'; status: ConfigStatus }
  | { kind: 'loaded'; capability: Extract<PeopleCapability, { hasPlannerIdentity: true }>; participants: PlannerParticipantClient[] };

export default function PlannerPeoplePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  // Part B — Both-Product Travel Journey guidance (Feature 016). See
  // src/lib/travelReturnContext.ts for why this is sessionStorage-backed
  // rather than a query param.
  const [hasReturnContext, setHasReturnContext] = useState(false);
  useEffect(() => { setHasReturnContext(hasActiveTravelJourney(eventId)); }, [eventId]);
  const handleReturnToAttendeeTravel = () => {
    completeTravelJourney(eventId);
    router.push(`/portal/events/${eventId}/attendee-travel`);
  };
  const confirm = useConfirm();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerParticipantClient | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalResetKey, setModalResetKey] = useState(0);
  const [modalError, setModalError] = useState<{ category: string; message: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [logisticsById, setLogisticsById] = useState<Map<number, ParticipantLogisticsInfo> | null>(null);
  const [addFromAttendeesOpen, setAddFromAttendeesOpen] = useState(false);
  const [addFromOrgOpen, setAddFromOrgOpen] = useState(false);
  // Feature 016 (Attendee/Participant Journey Clarification) — which "Add
  // Participant" sources are architecturally valid for this event. "From
  // Bendie Attendees" only ever appears when the event actually has the
  // Bendie product; a Planner-only event never sees it.
  const [productContext, setProductContext] = useState<{ organizationId: string; bendieAvailable: boolean } | null>(null);
  // Cross-status indicator (Part K) — which participants also have a Bendie
  // event_members row, matched by exact lowercased email only (never by
  // name). Built once from already-loaded data, never inferred/guessed.
  const [bendieAttendeeEmails, setBendieAttendeeEmails] = useState<Set<string> | null>(null);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Rapid-navigation performance pass — aborts the actual in-flight
  // request (not just its eventual state write) when a newer load
  // supersedes it or the page unmounts, so switching away mid-fetch stops
  // consuming network/Supabase capacity instead of letting it run to
  // completion unused.
  const startRequest = useLatestRequest();

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const signal = startRequest();
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/events/${eventId}/planner-people`, { signal });
      if (requestIdRef.current !== requestId) return;
      if (!res.ok) {
        setState({ kind: 'denied' });
        return;
      }
      const data = await res.json();
      if (requestIdRef.current !== requestId) return;
      if (data.status) {
        setState({ kind: 'configuring', status: data.status });
        return;
      }
      setState({ kind: 'loaded', capability: data.capability, participants: data.participants ?? [] });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      // Superseded by a newer navigation/load — never a user-visible error.
      if (isAbortError(err)) return;
      console.error('Failed to load Planner People', err);
      setState({ kind: 'configuring', status: 'backend_error' });
    }
  }, [eventId, startRequest]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  // Portal UX continuation (016) — one aggregate fetch each for Flights,
  // Hotels, and Ground Transport movements (identical endpoints/shapes the
  // Dashboard's Planner Readiness cards already use), correlated by
  // `passengerId` client-side. Never a per-participant request. A denied/
  // failed fetch here degrades this optional hub view to "not shown" for
  // that column — it never blocks the People list itself from rendering.
  useEffect(() => {
    if (state.kind !== 'loaded') return;
    let cancelled = false;
    const base = `/api/events/${eventId}`;
    Promise.allSettled([
      fetch(`${base}/planner-logistics/flights`).then((r) => r.json()),
      fetch(`${base}/planner-logistics/hotels`).then((r) => r.json()),
      fetch(`${base}/planner-logistics/ground-transport/movements`).then((r) => r.json()),
    ]).then(([flightsR, hotelsR, movementsR]) => {
      if (cancelled) return;
      const flights: { passengerId: number; flightType: string | null }[] =
        flightsR.status === 'fulfilled' && Array.isArray(flightsR.value?.flights) ? flightsR.value.flights : [];
      const hotels: { passengerId: number; hotelName: string | null; accommodationRequired: boolean }[] =
        hotelsR.status === 'fulfilled' && Array.isArray(hotelsR.value?.bookings) ? hotelsR.value.bookings : [];
      const movements: { vehicles?: { vehicleType: string | null; vehicleNo: number | null; assignments?: { passengerId: number }[] }[] }[] =
        movementsR.status === 'fulfilled' && Array.isArray(movementsR.value?.movements) ? movementsR.value.movements : [];

      const map = new Map<number, ParticipantLogisticsInfo>();
      const ensure = (id: number) => {
        if (!map.has(id)) map.set(id, { flightsLabel: 'Missing', hotelLabel: null, transportLabel: null });
        return map.get(id)!;
      };

      const flightsByPassenger = new Map<number, Set<string>>();
      for (const f of flights) {
        if (!flightsByPassenger.has(f.passengerId)) flightsByPassenger.set(f.passengerId, new Set());
        flightsByPassenger.get(f.passengerId)!.add((f.flightType ?? '').toLowerCase());
      }
      for (const [passengerId, legs] of flightsByPassenger) {
        const hasArrival = legs.has('arrival');
        const hasDeparture = legs.has('departure');
        ensure(passengerId).flightsLabel = hasArrival && hasDeparture ? 'Arrival + Departure' : hasArrival ? 'Arrival only' : hasDeparture ? 'Departure only' : 'On file';
      }

      for (const h of hotels) {
        if (h.accommodationRequired === false) continue; // explicitly not needed — not a gap
        ensure(h.passengerId).hotelLabel = h.hotelName || 'Booked';
      }

      for (const m of movements) {
        for (const v of m.vehicles ?? []) {
          for (const a of v.assignments ?? []) {
            ensure(a.passengerId).transportLabel = [v.vehicleType, v.vehicleNo != null ? `#${v.vehicleNo}` : null].filter(Boolean).join(' ') || 'Assigned';
          }
        }
      }

      setLogisticsById(map);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, state.kind]);

  // Feature 016 — product context (for gating "From Bendie Attendees") and
  // the cross-product status indicator. The event's Bendie attendee emails
  // are read once directly (RLS-gated by is_event_member, same access the
  // caller already has to reach this Planner page) — never a second
  // per-participant lookup.
  useEffect(() => {
    if (state.kind !== 'loaded') return;
    let cancelled = false;
    resolveEventProductContext(eventId)
      .then((ctx) => {
        if (!cancelled) setProductContext(ctx);
      })
      .catch((err) => {
        console.error('Planner Participants: product context fetch failed', err);
        // Fails closed to "no Bendie source" rather than leaving the Add
        // Participant menu stuck with no sources resolved at all — never
        // blocks the rest of the page.
        if (!cancelled) setProductContext((prev) => prev ?? null);
      });
    (async () => {
      try {
        const { data, error } = await supabase.from('event_members').select('profiles!event_members_user_id_fkey(email)').eq('event_id', eventId);
        if (cancelled) return;
        if (error) {
          console.error('Planner Participants: attendee-email fetch failed', error);
          return; // badge simply never appears — never blocks the list itself.
        }
        const emails = new Set<string>();
        for (const row of (data as unknown as { profiles: { email: string | null } | null }[]) ?? []) {
          if (row.profiles?.email) emails.add(row.profiles.email.trim().toLowerCase());
        }
        setBendieAttendeeEmails(emails);
      } catch (err) {
        if (!cancelled) console.error('Planner Participants: attendee-email fetch failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, state.kind]);

  const openCreate = () => {
    setEditing(null);
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (participant: PlannerParticipantClient) => {
    setEditing(participant);
    setModalError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setModalError(null);
  };

  const handleSearch = useCallback(
    async (query: string): Promise<PlannerParticipantSearchResult[]> => {
      try {
        const res = await fetch(`/api/events/${eventId}/planner-people/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.results ?? [];
      } catch (err) {
        console.error('Planner People: search failed', err);
        return [];
      }
    },
    [eventId]
  );

  // Current event roster, only available once loaded — used for the synchronous "already in this event" check.
  const rosterForCsv: PlannerParticipantClient[] = state.kind === 'loaded' ? state.participants : [];

  const parsePersonCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<PersonCsvRow> => {
    const errors: string[] = [];
    const fullName = getField(raw, 'fullName');
    if (!fullName) errors.push('fullName is required');

    const email = getField(raw, 'email');
    if (email && rosterForCsv.some((p) => p.email?.trim().toLowerCase() === email.toLowerCase())) {
      errors.push('This participant is already part of this event');
    }

    const data: PersonCsvRow = {
      fullName,
      title: getField(raw, 'title'),
      passport: getField(raw, 'passport'),
      dietaryRequirements: getField(raw, 'dietaryRequirements'),
      gender: getField(raw, 'gender'),
      email,
      phone: getField(raw, 'phone'),
    };
    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  /**
   * Feature 015, refactored under Feature 016 to call the now-shared
   * `matchOrCreateParticipant` helper (identical behavior: exact-email
   * match-then-link, else create-new — never creates a Planner Auth user,
   * `event_user_assignments` row, or Portal `event_members` row). Passport/
   * dietary/gender fields aren't part of the shared matcher's minimal input
   * (name/email/title/phone, matching what "From Bendie Attendees"/"From
   * Organisation" can ever know about a person) — CSV rows with those
   * extra fields still need them, so a direct create call is used only when
   * they're present; the common case (no passport/dietary data in this CSV
   * row) goes through the shared helper like every other add path.
   */
  const importPersonRow = async (row: PersonCsvRow) => {
    if (!row.passport && !row.dietaryRequirements && !row.gender) {
      const existingEmails = new Set(rosterForCsv.map((p) => p.email?.trim().toLowerCase()).filter((e): e is string => !!e));
      const outcome = await matchOrCreateParticipant(eventId, { fullName: row.fullName, email: row.email || null, title: row.title || null, phone: row.phone || null }, existingEmails);
      return outcome.status === 'failed' ? { error: outcome.error } : {};
    }

    if (row.email) {
      const searchRes = await fetch(`/api/events/${eventId}/planner-people/search?q=${encodeURIComponent(row.email)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const exactMatch = (searchData.results ?? []).find((r: PlannerParticipantSearchResult) => r.email?.trim().toLowerCase() === row.email.toLowerCase());
        if (exactMatch) {
          const linkRes = await fetch(`/api/events/${eventId}/planner-people/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passengerId: exactMatch.passengerId }),
          });
          if (linkRes.ok) return {};
          const linkData = await linkRes.json().catch(() => ({}));
          return { error: linkData.message ?? 'Could not link this participant.' };
        }
      }
    }

    const res = await fetch(`/api/events/${eventId}/planner-people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: row.fullName,
        title: row.title || null,
        passport: row.passport || null,
        dietaryRequirements: row.dietaryRequirements || null,
        gender: row.gender || null,
        email: row.email || null,
        phone: row.phone || null,
      }),
    });
    if (res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return { error: data.message ?? 'Could not save this row.' };
  };

  const handleCreateNew = async (values: PlannerParticipantFormValues, keepOpen: boolean) => {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: values.fullName,
          title: values.title || null,
          passport: values.passport || null,
          dietaryRequirements: values.dietaryRequirements || null,
          gender: values.gender || null,
          email: values.email || null,
          phone: values.phone || null,
        }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      toast.success('Participant added');
      if (keepOpen) {
        setModalResetKey((k) => k + 1);
      } else {
        setModalOpen(false);
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner People: create failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleLinkExisting = async (passengerId: number) => {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-people/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passengerId }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not add participant.' });
        return;
      }
      toast.success('Participant added');
      setModalOpen(false);
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner People: link failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not add participant.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleSaveEdit = async (values: PlannerParticipantFormValues) => {
    if (!editing) return;
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-people/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: values.fullName,
          title: values.title || null,
          passport: values.passport || null,
          dietaryRequirements: values.dietaryRequirements || null,
          gender: values.gender || null,
          email: values.email || null,
          phone: values.phone || null,
        }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        if (res.status === 404) {
          toast('This participant no longer exists.');
          setModalOpen(false);
          await load();
          return;
        }
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save changes.' });
        return;
      }
      toast.success('Participant updated');
      setModalOpen(false);
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner People: edit failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save changes.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleRemove = async (participant: PlannerParticipantClient) => {
    const ok = await confirm({ message: `Remove "${participant.fullName}" from this event? Their record is kept for other events.`, confirmLabel: 'Remove', destructive: true });
    if (!ok) return;

    setBusyId(participant.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-people/${participant.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        if (res.status === 404) {
          toast('Participant no longer exists.');
          await load();
          return;
        }
        toast.error(data.message ?? 'Could not remove participant.');
        return;
      }
      toast.success('Participant removed');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner People: remove failed', err);
      toast.error('Could not remove participant.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div>
        <SectionHeader sectionKey="planner-people" />
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
        <SectionHeader sectionKey="planner-people" />
        <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t load Participants</h2>
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
      backend_error: { icon: 'cloud_off', message: 'Couldn’t load Participants right now — try again in a moment.' },
    };
    const { icon, message, warn } = copy[state.status];
    return (
      <div>
        <SectionHeader sectionKey="planner-people" />
        <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${warn ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low'}`}>
          <span className={`material-symbols-outlined ${warn ? 'text-amber-600' : 'text-on-surface-variant'}`}>{icon}</span>
          <p className={`text-sm ${warn ? 'text-amber-800' : 'text-on-surface-variant'}`}>{message}</p>
        </div>
      </div>
    );
  }

  const { capability, participants } = state;

  // Corrective fix (Feature 016 continuation, Part 13) — one add-menu
  // element, reused by both the header (once participants exist) and the
  // empty state (before any do) rather than rendering two independent sets
  // of add actions at once.
  const addMenu = (
    <AddParticipantMenu
      showFromAttendees={!!productContext?.bendieAvailable}
      onFromAttendees={() => setAddFromAttendeesOpen(true)}
      onFromOrganisation={() => setAddFromOrgOpen(true)}
      onAddNew={openCreate}
      onImportCsv={() => setCsvModalOpen(true)}
    />
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader sectionKey="planner-people" />
        {capability.canManage && participants.length > 0 && addMenu}
      </div>

      {/* Corrective fix (Feature 016 continuation, Part 17) — this used to
          repeat the SectionHeader's own description in a second paragraph.
          One concise description now lives once, in eventSectionMeta.ts;
          this is just a subtle contextual link to where Planner access is
          actually configured, not another explanatory sentence. */}
      <Link href={`/portal/events/${eventId}/members`} className="text-xs text-on-surface-variant hover:text-primary inline-flex items-center gap-1 mt-2">
        Need someone to work inside Planner? Manage them under Team &amp; Access
        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      </Link>

      {/* Part B — Both-Product Travel Journey guidance (Feature 016). Only
          rendered when the user actually arrived via the guided flow from
          Bendie Attendee Travel — never on an ordinary visit to this page. */}
      {hasReturnContext && (
        <div className="mt-4 bg-primary/5 border border-primary/20 rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-on-surface">You&apos;re setting up travel before continuing in Bendie.</p>
          <button onClick={handleReturnToAttendeeTravel} className="btn-primary text-xs py-1.5 flex-shrink-0">
            Return to Attendee Travel
          </button>
        </div>
      )}

      <div className="mt-6">
        <PlannerPeopleList
          eventId={eventId}
          participants={participants}
          canManage={capability.canManage}
          busyId={busyId}
          onEdit={openEdit}
          onRemove={handleRemove}
          addMenu={participants.length === 0 ? addMenu : undefined}
          logisticsById={logisticsById ?? undefined}
          bendieAttendeeEmails={bendieAttendeeEmails ?? undefined}
        />
      </div>

      <PlannerPeopleModal
        key={modalResetKey}
        open={modalOpen}
        editing={editing}
        submitting={submitting}
        serverError={modalError}
        onClose={closeModal}
        onCreateNew={handleCreateNew}
        onLinkExisting={handleLinkExisting}
        onSaveEdit={handleSaveEdit}
        onSearch={handleSearch}
      />
      <CsvImportModal<PersonCsvRow>
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onImported={load}
        title="Import Participants"
        templateFilename="people-template.csv"
        columns={PEOPLE_CSV_COLUMNS}
        sampleRows={PEOPLE_CSV_SAMPLES}
        parseRow={parsePersonCsvRow}
        importRow={importPersonRow}
      />
      {productContext && (
        <>
          <AddParticipantFromPortalModal
            open={addFromAttendeesOpen}
            source="attendees"
            eventId={eventId}
            organizationId={productContext.organizationId}
            existingParticipantEmails={new Set(rosterForCsv.map((p) => p.email?.trim().toLowerCase()).filter((e): e is string => !!e))}
            onClose={() => setAddFromAttendeesOpen(false)}
            onDone={load}
          />
          <AddParticipantFromPortalModal
            open={addFromOrgOpen}
            source="organisation"
            eventId={eventId}
            organizationId={productContext.organizationId}
            existingParticipantEmails={new Set(rosterForCsv.map((p) => p.email?.trim().toLowerCase()).filter((e): e is string => !!e))}
            onClose={() => setAddFromOrgOpen(false)}
            onDone={load}
          />
        </>
      )}
    </div>
  );
}
