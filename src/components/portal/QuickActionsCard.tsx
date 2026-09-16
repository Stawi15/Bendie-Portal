'use client';

import Link from 'next/link';

type QuickActionsCardProps = {
  /** Omit (or pass undefined) when the caller isn't permitted to create an event -- hides the action. */
  onCreateEvent?: () => void;
  onAddPerson: () => void;
};

export function QuickActionsCard({ onCreateEvent, onAddPerson }: QuickActionsCardProps) {
  return (
    <div className="bg-white p-6 rounded-[20px] border border-[#E4EAF0] panel-shadow">
      <h4 className="font-label-md text-label-md text-on-surface mb-4">Quick Actions</h4>
      <div className="grid grid-cols-1 gap-2">
        {onCreateEvent && (
          <button
            onClick={onCreateEvent}
            className="flex items-center gap-3 px-4 py-3 border border-outline-variant rounded-xl hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">
              add_circle
            </span>
            <span className="font-label-sm text-label-sm text-on-surface">Create Event</span>
          </button>
        )}
        <button
          onClick={onAddPerson}
          className="flex items-center gap-3 px-4 py-3 border border-outline-variant rounded-xl hover:border-primary hover:bg-primary/5 transition-all group"
        >
          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">
            person_add
          </span>
          <span className="font-label-sm text-label-sm text-on-surface">Add Person</span>
        </button>
        <Link
          href="/portal/people"
          className="flex items-center gap-3 px-4 py-3 border border-outline-variant rounded-xl hover:border-primary hover:bg-primary/5 transition-all group"
        >
          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">
            assignment_ind
          </span>
          <span className="font-label-sm text-label-sm text-on-surface">Assign People</span>
        </Link>
      </div>
    </div>
  );
}
