'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  onFromOrganisation: () => void;
  onFromTeam: () => void;
  onInviteNew: () => void;
  onImportCsv: () => void;
  onAddAll: () => void;
  canCreateAccounts: boolean;
};

/**
 * The single primary "+ Add Attendees" entry point for the Attendees &
 * Access page, replacing the previously scattered Add Member / Add All
 * Organisation Members / Import CSV / Assign Team controls. "Add all
 * organisation people" is deliberately listed last/secondary within this
 * menu rather than sitting beside it as an equally prominent button.
 * (User-facing label only — the underlying source/action names below
 * correctly describe what each option does, per the locked terminology.)
 */
export function AddPeopleMenu({ onFromOrganisation, onFromTeam, onInviteNew, onImportCsv, onAddAll, canCreateAccounts }: Props) {
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
        <span className="material-symbols-outlined text-[18px]">person_add</span> Add Attendees
        <span className="material-symbols-outlined text-[18px]">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl panel-shadow border border-outline-variant py-1.5 z-30">
          {item('From organisation', 'group', onFromOrganisation)}
          {item('From team', 'diversity_3', onFromTeam)}
          {canCreateAccounts && item('Invite new attendee', 'person_add', onInviteNew)}
          {canCreateAccounts && item('Import CSV', 'upload_file', onImportCsv)}
          <div className="my-1 border-t border-outline-variant" />
          {item('Add all organisation people', 'group_add', onAddAll)}
        </div>
      )}
    </div>
  );
}
