'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  showFromAttendees: boolean;
  onFromAttendees: () => void;
  onFromOrganisation: () => void;
  onAddNew: () => void;
  onImportCsv: () => void;
};

/**
 * Feature 016 (Attendee/Participant Journey Clarification) — the primary
 * "+ Add Participant" entry point on the Planner Participants page.
 * "From Bendie Attendees" only appears when the event actually has the
 * Bendie product (per `showFromAttendees`) — a Planner-only event never
 * sees a source that doesn't architecturally exist for it.
 */
export function AddParticipantMenu({ showFromAttendees, onFromAttendees, onFromOrganisation, onAddNew, onImportCsv }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const item = (label: string, icon: string, onSelect: () => void) => (
    <button
      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left text-on-surface hover:bg-surface-container-low transition-colors"
      onClick={() => {
        setOpen(false);
        onSelect();
      }}
    >
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-primary flex-shrink-0">
        <span className="material-symbols-outlined text-[18px]">person_add</span> Add Participant
        <span className="material-symbols-outlined text-[18px]">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl panel-shadow border border-outline-variant py-1.5 z-30">
          {showFromAttendees && item('From Bendie Attendees', 'confirmation_number', onFromAttendees)}
          {item('From organisation', 'group', onFromOrganisation)}
          {item('Add new participant', 'person_add', onAddNew)}
          {item('Import CSV', 'upload_file', onImportCsv)}
        </div>
      )}
    </div>
  );
}
