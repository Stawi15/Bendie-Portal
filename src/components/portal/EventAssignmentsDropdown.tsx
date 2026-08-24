'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';

type EventOption = { id: string; name: string };

type EventAssignmentsDropdownProps = {
  userId: string;
  organizationId: string;
  events: EventOption[];
  assignedEventIds: string[];
};

export function EventAssignmentsDropdown({ userId, organizationId, events, assignedEventIds }: EventAssignmentsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [assigned, setAssigned] = useState<string[]>(assignedEventIds);
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  const toggle = async (eventId: string) => {
    setPendingId(eventId);
    const isAssigned = assigned.includes(eventId);

    if (isAssigned) {
      const { error } = await supabase.from('event_members').delete().eq('event_id', eventId).eq('user_id', userId);
      if (error) toast.error(error.message);
      else setAssigned((prev) => prev.filter((id) => id !== eventId));
    } else {
      const { error } = await supabase
        .from('event_members')
        .insert({ event_id: eventId, user_id: userId, organization_id: organizationId, role: 'attendee' });
      if (error) toast.error(error.message);
      else setAssigned((prev) => [...prev, eventId]);
    }
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
              className="fixed w-64 bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-50 max-h-72 overflow-y-auto"
              style={{ top: position.top, left: position.left }}
            >
              <p className="px-4 py-1 text-xs text-on-surface-variant uppercase tracking-wider">Assign to events</p>
              {events.length === 0 ? (
                <p className="px-4 py-2 text-sm text-on-surface-variant">No events in this organisation yet.</p>
              ) : (
                events.map((event) => {
                  const isAssigned = assigned.includes(event.id);
                  return (
                    <label
                      key={event.id}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-container-low transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        disabled={pendingId === event.id}
                        onChange={() => toggle(event.id)}
                        className="w-4 h-4 accent-primary rounded flex-shrink-0"
                      />
                      <span className="truncate text-on-surface">{event.name}</span>
                    </label>
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
