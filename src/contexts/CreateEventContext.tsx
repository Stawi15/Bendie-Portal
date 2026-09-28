'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { isOrgAdmin } from '@/lib/portalAuth';
import { CreateEventModal } from '@/components/portal/CreateEventModal';
import type { EventRow } from '@/lib/eventColumns';
import type { ProductKey } from '@/lib/productNavigation';

type CreateEventContextValue = {
  /** Platform admin, or owner/admin of the CURRENT organisation. UX gate only — events_insert_creator RLS + the Feature 004 RPC stay authoritative. */
  canCreateEvent: boolean;
  /** Opens the one guided creation flow. `productHint` pre-selects a product only when the org has both (the user can still change it). */
  openCreateEvent: (productHint?: ProductKey | null) => void;
  /** Lets lists add the new row locally (no refetch). Returns an unsubscribe function. */
  subscribeEventCreated: (listener: (event: EventRow) => void) => () => void;
};

const CreateEventContext = createContext<CreateEventContextValue | undefined>(undefined);

/**
 * Feature 016 (create-path pass) — the single canonical event-creation entry.
 * Every "+ New Event" / "Create Event" control (global header, Events page,
 * empty states, Home quick actions) calls `openCreateEvent`; exactly one
 * `CreateEventModal` (the guided flow, unchanged Feature 004 provisioning) is
 * mounted here, always for the CURRENT organisation. Replaces three separate
 * modal mounts and three separate `isOrgAdmin` checks with one of each.
 */
export function CreateEventProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isGlobalAdmin } = useAuth();
  const { organizationId } = useOrganization();
  const [canCreateEvent, setCanCreateEvent] = useState(false);
  const [open, setOpen] = useState(false);
  const [productHint, setProductHint] = useState<ProductKey | undefined>(undefined);
  const listeners = useRef(new Set<(event: EventRow) => void>());

  // Same rule every entry point used before (Feature 003 / finding F3), now checked once per organisation.
  useEffect(() => {
    if (isGlobalAdmin) {
      setCanCreateEvent(true);
      return;
    }
    if (!organizationId) {
      setCanCreateEvent(false);
      return;
    }
    let cancelled = false;
    setCanCreateEvent(false);
    isOrgAdmin(organizationId).then((allowed) => {
      if (!cancelled) setCanCreateEvent(allowed);
    });
    return () => {
      cancelled = true;
    };
  }, [isGlobalAdmin, organizationId]);

  // Never leave the dialog open across an organisation switch — it must always create in the org shown.
  useEffect(() => {
    setOpen(false);
  }, [organizationId]);

  const openCreateEvent = useCallback((hint?: ProductKey | null) => {
    setProductHint(hint ?? undefined);
    setOpen(true);
  }, []);

  const subscribeEventCreated = useCallback((listener: (event: EventRow) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(() => ({ canCreateEvent, openCreateEvent, subscribeEventCreated }), [canCreateEvent, openCreateEvent, subscribeEventCreated]);

  return (
    <CreateEventContext.Provider value={value}>
      {children}
      {organizationId && canCreateEvent && (
        <CreateEventModal
          open={open}
          organizationId={organizationId}
          initialProduct={productHint}
          onClose={() => setOpen(false)}
          onCreated={(event) => {
            listeners.current.forEach((listener) => listener(event));
            setOpen(false);
            // Land in the new event's workspace (Planner-only events are redirected to Planner Overview by EventLayout).
            router.push(`/portal/events/${event.id}/dashboard`);
          }}
        />
      )}
    </CreateEventContext.Provider>
  );
}

export function useCreateEvent(): CreateEventContextValue {
  const ctx = useContext(CreateEventContext);
  if (!ctx) throw new Error('useCreateEvent must be used within CreateEventProvider');
  return ctx;
}
