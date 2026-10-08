'use client';

import Link from 'next/link';
import type { PlannerParticipantClient } from '@/components/portal/PlannerPeopleModal';

/** Portal UX continuation (016) — one flight/hotel/ground-transport indicator per participant, built from one aggregate fetch each (never per-row). */
export type ParticipantLogisticsInfo = { flightsLabel: string; hotelLabel: string | null; transportLabel: string | null };

type PlannerPeopleListProps = {
  eventId: string;
  participants: PlannerParticipantClient[];
  canManage: boolean;
  busyId: number | null;
  onEdit: (participant: PlannerParticipantClient) => void;
  onRemove: (participant: PlannerParticipantClient) => void;
  /** Corrective fix (Feature 016 continuation, Part 13) — the SAME "+ Add Participant" menu element the header renders, passed down as a node so the empty state reuses it rather than duplicating a second, simpler set of actions. The parent hides its own header copy while the list is empty (see planner-people/page.tsx), so exactly one set of add actions is ever visible at a time. */
  addMenu?: React.ReactNode;
  /** Portal UX continuation (016) — one aggregate fetch's worth of Flights/Hotel/Ground-Transport status per participant, keyed by passengerId. `undefined` (not yet loaded) renders nothing extra; a participant simply absent from the map means "no record found," never a fabricated status. */
  logisticsById?: Map<number, ParticipantLogisticsInfo>;
  /** Feature 016 (Attendee/Participant Journey Clarification, Part K) — lowercased Bendie event_members emails for this event, used only for an exact-email cross-status badge. `undefined` (not yet loaded) renders no badge at all — never a guessed one. */
  bendieAttendeeEmails?: Set<string>;
};

/**
 * Presentational participant roster table, mirroring `PlannerChecklistList`'s
 * established shape. No lifecycle/status columns (spec.md Verified Business
 * Rule 6 — this module has no stage concept at all). "Remove" always means
 * remove-from-event (delete the `event_passengers` link) — there is no
 * control anywhere that deletes the global `passengers` record (spec.md
 * Exclusions).
 */
export function PlannerPeopleList({ eventId, participants, canManage, busyId, onEdit, onRemove, addMenu, logisticsById, bendieAttendeeEmails }: PlannerPeopleListProps) {
  if (participants.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow text-center py-10 px-6">
        <p className="text-on-surface-variant text-sm">No participants yet</p>
        {canManage && addMenu && (
          <>
            <p className="text-on-surface-variant/70 text-xs mt-1">Add people you need to track for flights, hotels and ground transport.</p>
            <div className="flex items-center justify-center mt-4">{addMenu}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-surface-container-low/50">
          <tr>
            <th className="px-4 sm:px-lg py-2.5 font-label-md text-label-md text-on-surface-variant">Name</th>
            <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">Contact</th>
            <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant">Logistics</th>
            <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Passport</th>
            <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant hidden lg:table-cell">Dietary Requirements</th>
            {canManage && <th className="px-4 sm:px-lg py-2.5 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {participants.map((p) => {
            const isBusy = busyId === p.id;
            const logistics = logisticsById?.get(p.id);
            return (
              <tr key={p.id} className="hover:bg-surface-container-low/20 transition-colors align-top">
                <td className="px-4 sm:px-lg py-2.5">
                  <p className="font-label-md text-label-md text-on-surface">
                    {p.title ? `${p.title} ` : ''}
                    {p.fullName}
                  </p>
                  {p.gender && <p className="text-xs text-on-surface-variant mt-0.5">{p.gender}</p>}
                  {bendieAttendeeEmails && p.email && bendieAttendeeEmails.has(p.email.trim().toLowerCase()) && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Bendie Attendee</span>
                  )}
                </td>
                <td className="px-4 py-2.5 hidden sm:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {[p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {logisticsById === undefined ? (
                    <span className="text-on-surface-variant/50">Loading…</span>
                  ) : (
                    <div>
                      {/* Feature 016 density pass — three status chips on one line (was three stacked lines). */}
                      <div className="flex flex-wrap gap-1">
                        {[
                          { key: 'Flights', value: logistics?.flightsLabel && logistics.flightsLabel !== 'Missing' ? logistics.flightsLabel : null, missing: 'Missing' },
                          { key: 'Hotel', value: logistics?.hotelLabel ?? null, missing: 'Missing' },
                          { key: 'Transport', value: logistics?.transportLabel ?? null, missing: 'Unassigned' },
                        ].map((chip) => (
                          <span
                            key={chip.key}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${chip.value ? 'bg-green-50 text-green-800' : 'bg-surface-container-low text-on-surface-variant'}`}
                          >
                            <span className="font-semibold">{chip.key}</span> {chip.value ?? chip.missing}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1 pt-1 -ml-2">
                        <Link
                          href={`/portal/events/${eventId}/planner-logistics?product=planner&view=flights&participant=${p.id}`}
                          className="row-action !min-h-[28px] text-[11px]"
                        >
                          Add Flight
                        </Link>
                        <Link
                          href={`/portal/events/${eventId}/planner-logistics?product=planner&view=hotels&participant=${p.id}`}
                          className="row-action !min-h-[28px] text-[11px]"
                        >
                          Add Hotel
                        </Link>
                        <Link
                          href={`/portal/events/${eventId}/planner-logistics?product=planner&view=ground-transport`}
                          className="row-action !min-h-[28px] text-[11px]"
                        >
                          Transport
                        </Link>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">{p.passport || '—'}</td>
                <td className="px-4 py-2.5 hidden lg:table-cell text-body-sm font-body-sm text-on-surface-variant">{p.dietaryRequirements || '—'}</td>
                {canManage && (
                  <td className="px-4 sm:px-lg py-2.5 text-right space-x-2 whitespace-nowrap">
                    <button className="row-action" onClick={() => onEdit(p)} disabled={isBusy}>
                      Edit
                    </button>
                    <button className="row-action-danger" onClick={() => onRemove(p)} disabled={isBusy}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
