'use client';

import { Avatar } from '@/components/portal/Avatar';
import { EventAssignmentsDropdown } from '@/components/portal/EventAssignmentsDropdown';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { ORG_ROLE_LABELS } from '@/lib/portalLabels';

export type OrgPersonRow = {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  orgRole: string;
  globalRole: string;
  lastSeenAt: string | null;
  phone: string | null;
  jobTitle: string | null;
  bio: string | null;
  assignedEventIds: string[];
};

type EventOption = { id: string; name: string };

type OrgPeoplePanelProps = {
  people: OrgPersonRow[];
  loading: boolean;
  onAddPerson: () => void;
  currentUserId?: string | null;
  onToggleAdmin?: (userId: string, newRole: 'admin' | 'attendee') => void;
  updatingAdminId?: string | null;
  organizationId?: string | null;
  events?: EventOption[];
  onEditPerson?: (person: OrgPersonRow) => void;
  onRemovePerson?: (person: OrgPersonRow) => void;
  removingId?: string | null;
};

export function OrgPeoplePanel({
  people,
  loading,
  onAddPerson,
  currentUserId,
  onToggleAdmin,
  updatingAdminId,
  organizationId,
  events = [],
  onEditPerson,
  onRemovePerson,
  removingId,
}: OrgPeoplePanelProps) {
  return (
    <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow">
      <div className="px-4 sm:px-lg py-6 border-b border-outline-variant flex justify-between items-center">
        <h4 className="font-headline-sm text-headline-sm">Organisation People</h4>
        <button
          onClick={onAddPerson}
          className="flex items-center gap-2 text-primary font-label-sm text-label-sm hover:opacity-80"
        >
          <span className="material-symbols-outlined text-[18px]">add</span> Add Person
        </button>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : people.length === 0 ? (
        <div className="text-center py-16 px-6">
          <p className="text-on-surface-variant text-sm">No one in this organisation yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low/50">
              <tr>
                <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant">Person</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">
                  Org Role
                </th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">
                  Events
                </th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">
                  Portal Access
                </th>
                <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant text-right">
                  Last Active
                </th>
                {onRemovePerson && <th className="px-4 py-4"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {people.map((person) => (
                <tr key={person.userId}>
                  <td className="px-4 sm:px-lg py-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={person.fullName} email={person.email} avatarUrl={person.avatarUrl} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="font-label-md text-label-md text-on-surface truncate">
                          {person.fullName ?? 'Unnamed'}
                        </p>
                        <p className="text-xs text-on-surface-variant truncate">{person.email}</p>
                      </div>
                      {onEditPerson && (
                        <button
                          onClick={() => onEditPerson(person)}
                          className="flex-shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
                          aria-label={`Edit ${person.fullName ?? 'person'}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 hidden sm:table-cell">
                    <span className="px-2.5 py-1 rounded-md bg-surface-container-low text-on-surface-variant text-xs font-semibold whitespace-nowrap">
                      {ORG_ROLE_LABELS[person.orgRole] ?? person.orgRole}
                    </span>
                  </td>
                  <td className="px-6 py-5 hidden md:table-cell">
                    {organizationId ? (
                      <EventAssignmentsDropdown
                        userId={person.userId}
                        userEmail={person.email}
                        userLabel={person.fullName ?? person.email ?? 'this person'}
                        organizationId={organizationId}
                        events={events}
                        assignedEventIds={person.assignedEventIds}
                      />
                    ) : (
                      <span className="text-xs text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    {onToggleAdmin &&
                      (person.userId === currentUserId ? (
                        <span className="text-xs text-on-surface-variant italic">(you)</span>
                      ) : (
                        <button
                          onClick={() =>
                            onToggleAdmin(person.userId, person.globalRole === 'admin' ? 'attendee' : 'admin')
                          }
                          disabled={updatingAdminId === person.userId}
                          className={`text-xs font-semibold px-2 py-1 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                            person.globalRole === 'admin'
                              ? 'text-red-700 hover:bg-red-50'
                              : 'text-primary hover:bg-primary/5'
                          }`}
                        >
                          {updatingAdminId === person.userId
                            ? 'Updating…'
                            : person.globalRole === 'admin'
                              ? 'Revoke Admin'
                              : 'Make Admin'}
                        </button>
                      ))}
                  </td>
                  <td className="px-4 sm:px-lg py-5 text-right text-body-sm font-body-sm text-on-surface-variant">
                    {formatRelativeTime(person.lastSeenAt)}
                  </td>
                  {onRemovePerson && (
                    <td className="px-4 py-5 text-right">
                      {person.userId !== currentUserId && (
                        <button
                          onClick={() => onRemovePerson(person)}
                          disabled={removingId === person.userId}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors disabled:opacity-50"
                          aria-label={`Remove ${person.fullName ?? 'person'} from organisation`}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {removingId === person.userId ? 'hourglass_empty' : 'person_remove'}
                          </span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
