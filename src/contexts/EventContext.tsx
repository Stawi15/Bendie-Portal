'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getAccessibleEvents } from '@/lib/portalAuth';
import { requireEventWorkspaceAccess } from '@/lib/eventAuth';
import { EVENTS_SELECT_COLUMNS, type EventRow } from '@/lib/eventColumns';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

type Event = EventRow;

export interface EventContextType {
  currentEventId: string | null;
  currentEvent: Event | null;
  events: Event[];
  loading: boolean;
  error: string | null;
  /**
   * Whether the current user may enter this event's WORKSPACE/CONTENT (not
   * merely whether the `events` row itself was fetchable). A successful
   * `events` SELECT never implies this — an organization owner/admin can see
   * event metadata via events_select_org_admin without holding the explicit
   * event_members row this flag requires. See src/lib/eventAuth.ts.
   */
  canAccessWorkspace: boolean;
  /** Distinguishes "not yet checked" from "checked and denied" so callers don't briefly render as if access were granted. */
  workspaceAccessChecked: boolean;
  setCurrentEvent: (eventId: string) => Promise<void>;
  /**
   * Ends "explicit event route" intent (Feature 003 corrective pass, R2-F3).
   * EventLayout calls this on unmount -- i.e. when the user navigates away
   * from an event-scoped route -- so loadEvents()'s auto-select fallback can
   * resume for non-event-scoped pages and future organization switches,
   * rather than staying permanently disabled for the rest of the session.
   */
  clearCurrentEvent: () => void;
  refreshEvent: () => Promise<void>;
}

export const EventContext = createContext<EventContextType | undefined>(undefined);

export const EventProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { organizationId, loading: orgLoading } = useOrganization();
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canAccessWorkspace, setCanAccessWorkspace] = useState(false);
  const [workspaceAccessChecked, setWorkspaceAccessChecked] = useState(false);

  // --- Stale-response protection (Feature 003 third corrective pass, R3-F4)
  // ---
  //
  // The second corrective pass's `latestEventIdRef` (comparing a response's
  // target eventId against "the current eventId") has a real gap: it cannot
  // distinguish two DIFFERENT requests that happen to target the SAME event
  // (X request #1 -> Y -> X request #2), because by the time request #1
  // finally resolves, the ref is legitimately back to X again -- its
  // staleness check passes even though a newer X request has since
  // superseded it. The correct invariant is "the latest REQUEST wins," not
  // "the response's event ID matches the current event ID." A monotonically
  // increasing generation number, captured by each request before it starts
  // awaiting and compared after, distinguishes request identity regardless
  // of whether the target event ID repeats.
  //
  // TWO independent generation counters, not one shared across every writer:
  // a single shared counter was tried first and found to have its own bug --
  // checkWorkspaceAccess's effect reacts to currentEventId (or, via its own
  // organizationId dependency, to an organization switch while an explicit
  // event route stays mounted) and would either (a) mint a second bump that
  // immediately invalidates the very handleSetCurrentEvent/loadEvents commit
  // that produced the new currentEventId, or (b), if made to skip minting
  // its own bump, capture a now-stale generation on an org-switch-while-
  // explicit-route path (React fires this effect, declared earlier in the
  // component, before the later-declared organization-change effect gets to
  // bump the shared counter in the same render), causing its own result to
  // always be discarded as stale. Two independent counters, each owned by
  // the effect/writers that legitimately affect its piece of state, avoid
  // both failure modes: eventGenerationRef guards currentEvent/
  // currentEventId/events; workspaceGenerationRef guards canAccessWorkspace/
  // workspaceAccessChecked and is bumped unconditionally every time the
  // workspace-check effect itself runs, regardless of which dependency
  // triggered it.
  const eventGenerationRef = useRef(0);
  const nextEventGeneration = useCallback(() => {
    eventGenerationRef.current += 1;
    return eventGenerationRef.current;
  }, []);

  const workspaceGenerationRef = useRef(0);

  // Whether an event-scoped route (EventLayout) currently governs
  // currentEventId. While true, loadEvents()'s auto-select fallback must not
  // choose a different event -- the mounted route's own explicit selection
  // is authoritative for THAT. This is scoped to the navigation lifecycle,
  // not permanent (R2-F3): set by handleSetCurrentEvent (called only while
  // EventLayout is mounted), cleared by clearCurrentEvent() on unmount.
  const hasExplicitEventRef = useRef(false);

  const checkWorkspaceAccess = useCallback(
    async (eventId: string, generation: number) => {
      setWorkspaceAccessChecked(false);
      if (!user) {
        if (workspaceGenerationRef.current === generation) {
          setCanAccessWorkspace(false);
          setWorkspaceAccessChecked(true);
        }
        return;
      }
      const allowed = await requireEventWorkspaceAccess(eventId, user.id, organizationId);
      // Discard if a newer request has superseded this one -- regardless of
      // whether its target event ID happens to be the same one (R3-F4).
      if (workspaceGenerationRef.current !== generation) return;
      setCanAccessWorkspace(allowed);
      setWorkspaceAccessChecked(true);
    },
    [user, organizationId]
  );

  // Re-run the workspace-access check whenever the selected event, the
  // authenticated user, or the selected organization changes -- this is
  // deliberately independent of whether the `events` row fetch below
  // succeeded, since events_select_org_admin (Feature 003) lets an org
  // admin fetch a row they still may not hold workspace access to. Bumps its
  // own dedicated generation unconditionally every time it runs, regardless
  // of which dependency (event or organization) triggered it, so an older
  // in-flight check for a now-superseded (eventId, organizationId) pair can
  // never win against a newer one.
  useEffect(() => {
    workspaceGenerationRef.current += 1;
    const generation = workspaceGenerationRef.current;

    if (!currentEventId) {
      setCanAccessWorkspace(false);
      setWorkspaceAccessChecked(false);
      return;
    }
    checkWorkspaceAccess(currentEventId, generation);
  }, [currentEventId, checkWorkspaceAccess]);

  // Load accessible events once the selected organization has resolved
  // (Feature 003: results must be scoped to the selected organization, so
  // this can no longer run unconditionally on mount before that is known),
  // and again whenever the selected organization changes.
  //
  // R3-F6: refreshing the organization's `events` collection and
  // auto-selecting a default event are two separate concerns. An explicit
  // event route active elsewhere must suppress auto-selection, but must
  // NOT suppress keeping `events` current for the newly selected
  // organization -- otherwise `events` silently keeps representing the
  // previous organization for as long as an event route stays mounted.
  useEffect(() => {
    if (orgLoading) return;

    const generation = nextEventGeneration();

    // An organization switch must not leave the PREVIOUS organization's
    // event displayed as if it belonged to the new one. Fail closed
    // immediately for the auto-select case; an active explicit-event route
    // (a real URL naming a specific event) is a deliberate exception --
    // that event's own workspace/product authorization is independently
    // re-evaluated against the new organizationId by the effect above, and
    // will correctly deny it if it doesn't belong to the newly selected
    // organization (F1's selected-organization invariant), rather than this
    // effect needing to guess.
    if (!hasExplicitEventRef.current) {
      setCurrentEventId(null);
      setCurrentEvent(null);
    }
    // Stale `events` from the previous organization must not be presented
    // as the new organization's data while the fresh fetch is in flight.
    setEvents([]);

    const loadEvents = async () => {
      try {
        setLoading(true);
        setError(null);
        const accessibleEvents = await getAccessibleEvents(organizationId);

        // A newer request (another organization switch, or an explicit
        // event selection) has since superseded this one. Do NOT force
        // setLoading(false) here -- that newer generation may still be
        // in flight, and unconditionally clearing loading would prematurely
        // signal "done" for its own commit (found during the R3-F4 async
        // writer audit: loading is itself organization/event-dependent
        // state and must be generation-protected like everything else).
        // The current generation's own `finally` block below is the only
        // place allowed to clear loading, and it is already gated.
        if (eventGenerationRef.current !== generation) {
          return;
        }

        if (accessibleEvents.length === 0) {
          setEvents([]);
          setError('No accessible events found');
          setLoading(false);
          return;
        }

        const fullEvents: Event[] = accessibleEvents.map(
          (e) =>
            ({
              id: e.id,
              name: e.name,
              status: e.status as 'draft' | 'published' | 'active' | 'completed' | 'archived',
              starts_at: e.starts_at,
            }) as Event
        );

        // Refresh the organization's event collection for the current
        // generation regardless of whether an explicit event route is
        // active -- this is the R3-F6 fix: an active explicit route
        // suppresses auto-SELECTION below, never this refresh.
        setEvents(fullEvents);

        if (hasExplicitEventRef.current) {
          // An explicit event route already owns currentEventId/currentEvent
          // for this generation -- do not auto-select a different one.
          setLoading(false);
          return;
        }

        const targetId = accessibleEvents[0].id;
        setCurrentEventId(targetId);

        const { data: fullEventData, error: fetchError } = await supabase
          .from('events')
          .select(EVENTS_SELECT_COLUMNS)
          .eq('id', targetId)
          .single();

        if (eventGenerationRef.current !== generation) {
          // Superseded while this fetch was in flight -- leave loading to
          // the newer, authoritative generation (see the earlier staleness
          // branch in this same function for why forcing it false here
          // would be wrong).
          return;
        }
        if (hasExplicitEventRef.current) {
          // An explicit route claimed the target while this fetch was in
          // flight. Still the current generation, so its own loading state
          // is ours to clear.
          setLoading(false);
          return;
        }

        if (fetchError) {
          setError('Failed to load event details');
          console.error(fetchError);
        } else {
          setCurrentEvent(fullEventData);
        }
      } catch (err) {
        if (eventGenerationRef.current === generation) {
          setError('Error loading events');
          console.error(err);
        }
      } finally {
        if (eventGenerationRef.current === generation) {
          setLoading(false);
        }
      }
    };

    loadEvents();
  }, [organizationId, orgLoading, nextEventGeneration]);

  const handleSetCurrentEvent = useCallback(
    async (eventId: string) => {
      hasExplicitEventRef.current = true;
      const generation = nextEventGeneration();
      try {
        setLoading(true);
        setError(null);
        setCurrentEventId(eventId);

        const { data: fullEventData, error: fetchError } = await supabase
          .from('events')
          .select(EVENTS_SELECT_COLUMNS)
          .eq('id', eventId)
          .single();

        // A newer request (another navigation) has since superseded this
        // one -- discard even if it happens to target the same eventId
        // (R3-F4's X->Y->X case).
        if (eventGenerationRef.current !== generation) return;

        if (fetchError) {
          setError('Failed to load event details');
          console.error(fetchError);
        } else {
          setCurrentEvent(fullEventData);
        }
      } catch (err) {
        if (eventGenerationRef.current === generation) {
          setError('Error switching events');
          console.error(err);
        }
      } finally {
        if (eventGenerationRef.current === generation) {
          setLoading(false);
        }
      }
    },
    [nextEventGeneration]
  );

  // Ends explicit-event-route intent (R2-F3). Called by EventLayout on
  // unmount so a later organization switch or unrelated navigation can
  // resume normal auto-select behavior instead of staying disabled for the
  // rest of the session.
  const handleClearCurrentEvent = useCallback(() => {
    hasExplicitEventRef.current = false;
  }, []);

  const refreshEvent = useCallback(async () => {
    if (!currentEventId) return;
    const targetId = currentEventId;
    const generation = nextEventGeneration();

    try {
      setLoading(true);
      const { data: fullEventData, error: fetchError } = await supabase
        .from('events')
        .select(EVENTS_SELECT_COLUMNS)
        .eq('id', targetId)
        .single();

      if (eventGenerationRef.current !== generation) return;

      if (fetchError) {
        setError('Failed to refresh event');
        console.error(fetchError);
      } else {
        setCurrentEvent(fullEventData);
      }
    } catch (err) {
      if (eventGenerationRef.current === generation) {
        setError('Error refreshing event');
        console.error(err);
      }
    } finally {
      if (eventGenerationRef.current === generation) {
        setLoading(false);
      }
    }
  }, [currentEventId, nextEventGeneration]);

  return (
    <EventContext.Provider
      value={{
        currentEventId,
        currentEvent,
        events,
        loading,
        error,
        canAccessWorkspace,
        workspaceAccessChecked,
        setCurrentEvent: handleSetCurrentEvent,
        clearCurrentEvent: handleClearCurrentEvent,
        refreshEvent,
      }}
    >
      {children}
    </EventContext.Provider>
  );
};

export const useEvent = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvent must be used within EventProvider');
  }
  return context;
};
