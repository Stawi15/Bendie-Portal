'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { EVENT_MEMBER_ROLES, addPersonToEvent, type EventMemberRole } from '@/lib/eventTeamProvisioning';
import { EVENT_MEMBER_ROLE_LABELS } from '@/lib/portalLabels';
import toast from 'react-hot-toast';

type EventOption = { id: string; name: string };

type EventAssignmentsDropdownProps = {
  userId: string;
  userEmail: string | null;
  userLabel: string;
  organizationId: string;
  events: EventOption[];
  assignedEventIds: string[];
};

/**
 * Feature 016 (Event Team Foundation Fix) — "adding" a person to an event
 * from here now routes through the same shared `addPersonToEvent` service
 * the Event Team page's Add People flow uses (Event Role picker + Bendie
 * access), replacing the previous instant hardcoded-`attendee` insert with
 * no role choice. Planner access configuration is intentionally NOT offered
 * in this compact per-row surface (it stays a full-page concern on the
 * Event Team page) — a deliberate, disclosed scope reduction, not an
 * oversight. Removal (unchecking) is unchanged: a direct delete plus the
 * existing best-effort Planner deactivation side effect.
 */
export function EventAssignmentsDropdown({ userId, userEmail, userLabel, organizationId, events, assignedEventIds }: EventAssignmentsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [assigned, setAssigned] = useState<string[]>(assignedEventIds);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [addingEventId, setAddingEventId] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<EventMemberRole>('attendee');
  const [addBendie, setAddBendie] = useState(true);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Rendered via a portal into <body> — this table's ancestor has
  // overflow-x-auto for horizontal scrolling on mobile, which per CSS rules
  // forces overflow-y to auto too, clipping any absolutely-positioned
  // dropdown to the table's box instead of floating over the page. A
  // fixed-position portal anchored to the button's own coordinates sidesteps
  // that entirely.
  const openDropdown = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 8, left: rect.left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleOutsideScroll = (e: Event) => {
      if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', handleOutsideScroll, true);
    window.addEventListener('resize', handleOutsideScroll);
    return () => {
      window.removeEventListener('scroll', handleOutsideScroll, true);
      window.removeEventListener('resize', handleOutsideScroll);
    };
  }, [open]);

  const remove = async (eventId: string) => {
    setPendingId(eventId);
    const { error } = await supabase.from('event_members').delete().eq('event_id', eventId).eq('user_id', userId);
    if (error) toast.error(error.message);
    else {
      setAssigned((prev) => prev.filter((id) => id !== eventId));
      // Feature 008 (research.md R10) — best-effort, fire-and-forget Planner
      // deactivation side effect. Never awaited: a Planner-side failure must
      // never block or reverse this Portal removal (FR-041), and resolving
      // the Planner identity/event here does not depend on the just-deleted
      // event_members row surviving.
      fetch(`/api/events/${eventId}/members/${userId}/planner-permissions/deactivate-on-removal`, { method: 'POST' }).catch((err) =>
        console.error('Planner access deactivation on removal failed', err)
      );
    }
    setPendingId(null);
  };

  const startAdd = (eventId: string) => {
    setAddingEventId(eventId);
    setAddRole('attendee');
    setAddBendie(true);
  };

  const confirmAdd = async (event: EventOption) => {
    setPendingId(event.id);
    const outcome = await addPersonToEvent(
      event.id,
      event.name,
      organizationId,
      { userId, email: userEmail, label: userLabel },
      { eventRole: addRole, grantBendie: addBendie, plannerAccess: 'none' }
    );
    if (outcome.eventMembership === 'failed') {
      toast.error(outcome.eventMembershipError ?? 'Failed to add to event');
    } else {
      setAssigned((prev) => [...prev, event.id]);
      if (outcome.bendieAccess === 'failed') toast.error('Added to event, but the Bendie access code could not be sent');
      else toast.success(`Added to ${event.name}`);
    }
    setAddingEventId(null);
    setPendingId(null);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="px-2.5 py-1 rounded-md bg-surface-container-low text-on-surface-variant text-xs font-semibold whitespace-nowrap hover:bg-surface-container-high transition-colors flex items-center gap-1"
      >
        {assigned.length === 0 ? 'No events' : `${assigned.length} event${assigned.length !== 1 ? 's' : ''}`}
        <span className="material-symbols-outlined text-sm">expand_more</span>
      </button>
      {open &&
        position &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              ref={panelRef}
              className="fixed w-72 bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-50 max-h-96 overflow-y-auto"
              style={{ top: position.top, left: position.left }}
            >
              <p className="px-4 py-1 text-xs text-on-surface-variant uppercase tracking-wider">Assign to events</p>
              {events.length === 0 ? (
                <p className="px-4 py-2 text-sm text-on-surface-variant">No events in this organisation yet.</p>
              ) : (
                events.map((event) => {
                  const isAssigned = assigned.includes(event.id);
                  const isAdding = addingEventId === event.id;
                  return (
                    <div key={event.id} className="px-4 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-on-surface">{event.name}</span>
                        {isAssigned ? (
                          <button
                            type="button"
                            onClick={() => remove(event.id)}
                            disabled={pendingId === event.id}
                            className="text-xs text-error font-medium px-2 py-0.5 rounded-md hover:bg-error/5 flex-shrink-0 disabled:opacity-50"
                          >
                            {pendingId === event.id ? '…' : 'Remove'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => (isAdding ? setAddingEventId(null) : startAdd(event.id))}
                            className="text-xs text-primary font-medium px-2 py-0.5 rounded-md hover:bg-primary/5 flex-shrink-0"
                          >
                            {isAdding ? 'Cancel' : 'Add'}
                          </button>
                        )}
                      </div>
                      {isAdding && (
                        <div className="mt-1.5 mb-1 pl-1 space-y-1.5 border-l-2 border-primary/20">
                          <select
                            value={addRole}
                            onChange={(e) => setAddRole(e.target.value as EventMemberRole)}
                            className="text-xs border border-outline-variant rounded-lg px-1.5 py-1 bg-white w-full ml-2"
                            style={{ width: 'calc(100% - 0.5rem)' }}
                          >
                            {EVENT_MEMBER_ROLES.map((r) => (
                              <option key={r} value={r}>{EVENT_MEMBER_ROLE_LABELS[r] ?? r}</option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1.5 text-xs text-on-surface-variant ml-2">
                            <input type="checkbox" className="w-3.5 h-3.5 accent-primary rounded" checked={addBendie} onChange={(e) => setAddBendie(e.target.checked)} />
                            Send Bendie access code
                          </label>
                          <button
                            type="button"
                            onClick={() => confirmAdd(event)}
                            disabled={pendingId === event.id}
                            className="text-xs bg-primary text-white font-medium px-2.5 py-1 rounded-md ml-2 disabled:opacity-50"
                          >
                            {pendingId === event.id ? 'Adding…' : 'Confirm'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
