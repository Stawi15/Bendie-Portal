'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabaseClient';
import { FormModal } from '@/components/portal/FormModal';
import { friendlyError } from '@/lib/userFacingError';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { buildCsvTemplate } from '@/lib/csvImport';
import {
  BREAKOUT_MODE_LABELS,
  PEOPLE_LIST_COLUMNS,
  PEOPLE_LIST_SAMPLES,
  buildPeopleListRows,
  normalizeName,
  parsePeopleListRow,
  peopleListCapacityWarnings,
  refinePeopleList,
  type PeopleListRow,
} from '@/lib/breakoutRooms';
import type { BreakoutAssignmentSource, BreakoutMode } from '@/types/database';

type Room = { id: string; name: string; location: string | null; capacity: number | null; display_order: number };
type Assignment = { user_id: string; room_id: string; source: BreakoutAssignmentSource; assigned_at: string };
type Member = { user_id: string; role: string; name: string; email: string };

const SOURCE_LABELS: Record<BreakoutAssignmentSource, string> = {
  attendee: 'Picked in app',
  organizer: 'Organiser',
  csv: 'CSV upload',
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Feature 021 (US2) — who is in which breakout room. Organisers see headcounts against capacity,
 * each room's attendees, attendees with no room, and anyone whose role is no longer attendee; they
 * can assign, move and unassign. Writes go straight to agenda_breakout_assignments (row-level
 * security allows organisers only); headcounts count current attendees only.
 */
export function BreakoutAssignmentsModal({
  open,
  onClose,
  onChanged,
  eventId,
  session,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  eventId: string;
  session: { id: string; title: string; breakout_mode: BreakoutMode } | null;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [listUploadOpen, setListUploadOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);
    const [roomRes, assignRes, memberRes] = await Promise.all([
      supabase.from('agenda_breakout_rooms').select('id,name,location,capacity,display_order').eq('session_id', session.id).order('display_order'),
      supabase.from('agenda_breakout_assignments').select('user_id,room_id,source,assigned_at').eq('session_id', session.id),
      supabase.from('event_members').select('user_id,role,profiles!event_members_user_id_fkey(full_name,email)').eq('event_id', eventId),
    ]);
    const error = roomRes.error ?? assignRes.error ?? memberRes.error;
    if (error) {
      setLoadError(friendlyError(error, 'We couldn’t load the breakout rooms. Try again.'));
      setLoading(false);
      return;
    }
    setRooms(roomRes.data ?? []);
    setAssignments((assignRes.data ?? []) as Assignment[]);
    setMembers(
      (memberRes.data ?? []).map((m) => {
        const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name: string | null; email: string | null } | null;
        return { user_id: m.user_id, role: m.role, name: p?.full_name || p?.email || 'Unnamed attendee', email: p?.email ?? '' };
      })
    );
    setLoading(false);
  }, [eventId, session]);

  useEffect(() => {
    if (open && session) {
      setSearch('');
      load();
    }
  }, [open, session, load]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const attendees = useMemo(() => members.filter((m) => m.role === 'attendee').sort((a, b) => a.name.localeCompare(b.name)), [members]);
  const assignmentByUser = useMemo(() => new Map(assignments.map((a) => [a.user_id, a])), [assignments]);

  const q = search.trim().toLowerCase();
  const matches = (m: Member | undefined) => !q || (!!m && (m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)));

  const headcount = (roomId: string) =>
    assignments.filter((a) => a.room_id === roomId && memberById.get(a.user_id)?.role === 'attendee').length;
  const unassigned = attendees.filter((m) => !assignmentByUser.has(m.user_id));
  const formerAttendees = assignments.filter((a) => memberById.get(a.user_id)?.role !== 'attendee');

  const assign = async (userId: string, roomId: string) => {
    if (!session) return;
    const previous = assignments;
    setBusyUser(userId);
    if (!roomId) {
      setAssignments((prev) => prev.filter((a) => a.user_id !== userId));
      const { error } = await supabase.from('agenda_breakout_assignments').delete().eq('session_id', session.id).eq('user_id', userId);
      if (error) {
        setAssignments(previous);
        toast.error(friendlyError(error, 'We couldn’t unassign this person. Try again.'));
      } else onChanged();
      setBusyUser(null);
      return;
    }
    const room = rooms.find((r) => r.id === roomId);
    setAssignments((prev) => [
      ...prev.filter((a) => a.user_id !== userId),
      { user_id: userId, room_id: roomId, source: 'organizer', assigned_at: new Date().toISOString() },
    ]);
    const { data, error } = await supabase
      .from('agenda_breakout_assignments')
      .upsert({ session_id: session.id, user_id: userId, room_id: roomId, source: 'organizer' }, { onConflict: 'session_id,user_id' })
      .select('user_id,room_id,source,assigned_at')
      .single();
    if (error) {
      setAssignments(previous);
      toast.error(friendlyError(error, 'We couldn’t place this person in that room. Try again.'));
    } else {
      setAssignments((prev) => [...prev.filter((a) => a.user_id !== userId), data as Assignment]);
      if (room?.capacity != null && headcountAfter(roomId, userId) > room.capacity) {
        toast(`${room.name} is now over capacity.`, { icon: '⚠️' });
      }
      onChanged();
    }
    setBusyUser(null);
  };

  // Headcount of a room once `userId` is in it (used for the over-capacity notice).
  const headcountAfter = (roomId: string, userId: string) =>
    assignments.filter((a) => a.room_id === roomId && a.user_id !== userId && memberById.get(a.user_id)?.role === 'attendee').length + 1;

  const roomSelect = (userId: string, currentRoomId: string, label: string) => (
    <select
      className="input text-xs py-1 w-auto max-w-[11rem]"
      aria-label={label}
      value={currentRoomId}
      disabled={busyUser === userId}
      onChange={(e) => assign(userId, e.target.value)}
    >
      <option value="">{currentRoomId ? 'Unassign' : 'Assign to…'}</option>
      {rooms.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  );

  const personRow = (userId: string, a: Assignment | undefined) => {
    const m = memberById.get(userId);
    return (
      <li key={userId} className="flex items-center gap-2 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-on-surface truncate">{m?.name ?? 'Unknown person'}</p>
          <p className="text-[11px] text-on-surface-variant truncate">
            {m?.email}
            {a && <> · {SOURCE_LABELS[a.source]} · {formatWhen(a.assigned_at)}</>}
          </p>
        </div>
        {roomSelect(userId, a?.room_id ?? '', `Room for ${m?.name ?? 'this person'}`)}
      </li>
    );
  };

  const mode = session ? BREAKOUT_MODE_LABELS[session.breakout_mode] : null;

  // People list: download, fill rooms in a spreadsheet, upload back (Feature 021, simplified US3).
  const attendeeIds = useMemo(() => new Set(attendees.map((m) => m.user_id)), [attendees]);
  const attendeesByEmail = useMemo(
    () => new Map(attendees.filter((m) => m.email).map((m) => [normalizeName(m.email), { user_id: m.user_id, email: m.email, name: m.name }])),
    [attendees]
  );

  const downloadList = () => {
    if (!session) return;
    const rows = buildPeopleListRows(
      attendees.map((m) => ({ user_id: m.user_id, email: m.email, name: m.name })),
      assignments,
      rooms
    );
    const url = URL.createObjectURL(buildCsvTemplate(PEOPLE_LIST_COLUMNS, rows));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${session.title.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase()}-people.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importListRow = async (row: PeopleListRow) => {
    if (!session) return { error: 'No session selected.' };
    // Nothing to change: blank room for someone who isn't in a room (T038 — keeps big lists fast).
    if (!row.roomId && !assignmentByUser.has(row.userId)) return {};
    if (!row.roomId) {
      const { error } = await supabase.from('agenda_breakout_assignments').delete().eq('session_id', session.id).eq('user_id', row.userId);
      return { error: error ? friendlyError(error, 'This person couldn’t be taken out of their room.') : undefined };
    }
    const { error } = await supabase
      .from('agenda_breakout_assignments')
      .upsert({ session_id: session.id, user_id: row.userId, room_id: row.roomId, source: 'csv' }, { onConflict: 'session_id,user_id' });
    return { error: error ? friendlyError(error, 'This person couldn’t be placed in that room.') : undefined };
  };

  return (
    <>
    <FormModal open={open} onClose={onClose} title={session ? `Manage people — ${session.title}` : 'Manage people'} confirmDiscard={false} maxWidthClassName="max-w-5xl">
      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-9 bg-surface-container-low rounded-lg w-72" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-surface-container-low rounded-xl" />)}</div>
        </div>
      ) : loadError ? (
        <div className="text-center py-10">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2" aria-hidden="true">error</p>
          <p className="text-on-surface-variant mb-4">{loadError}</p>
          <button type="button" className="btn-secondary" onClick={load}>Try again</button>
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-10">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2" aria-hidden="true">meeting_room</p>
          <p className="font-medium text-on-surface">This session has no breakout rooms</p>
          <p className="text-sm text-on-surface-variant mt-1">Edit the session and choose “Breakout session” to add rooms.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            {mode && (
              <p className="text-sm text-on-surface-variant">
                <span className="font-medium text-on-surface">{mode.label}.</span> {mode.hint}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                className="input sm:w-64"
                placeholder="Search name or email…"
                aria-label="Search people"
                data-ignore-dirty
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="button" className="btn-secondary text-sm py-1.5" onClick={downloadList} disabled={attendees.length === 0}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span> Download list
              </button>
              <button type="button" className="btn-secondary text-sm py-1.5" onClick={() => setListUploadOpen(true)} disabled={attendees.length === 0}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span> Upload list
              </button>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant -mt-2">
            To place many people at once: download the list, type a room next to each name in Excel, then upload it back.
          </p>

          {attendees.length === 0 && (
            <p className="text-sm text-on-surface-variant bg-surface-container-low rounded-xl p-3">
              This event has no attendees yet. Add them on the Attendees tab, then place them in rooms here.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rooms.map((r) => {
              const hc = headcount(r.id);
              const over = r.capacity != null && hc > r.capacity;
              const people = assignments.filter((a) => a.room_id === r.id && memberById.get(a.user_id)?.role === 'attendee' && matches(memberById.get(a.user_id)));
              return (
                <section key={r.id} className="border border-outline-variant rounded-xl p-3" aria-label={r.name}>
                  <header className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-on-surface truncate">{r.name}</h3>
                      {r.location && <p className="text-[11px] text-on-surface-variant truncate">{r.location}</p>}
                    </div>
                    <span
                      className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${
                        over ? 'bg-error/10 text-error' : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      {r.capacity != null ? `${hc} / ${r.capacity}` : `${hc} · no limit`}
                      {over ? ' · over capacity' : ''}
                    </span>
                  </header>
                  {people.length === 0 ? (
                    <p className="text-xs text-on-surface-variant/70 italic py-2">{q ? 'No matches in this room.' : 'Nobody in this room yet.'}</p>
                  ) : (
                    <ul className="divide-y divide-outline-variant/40 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                      {people.map((a) => personRow(a.user_id, a))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          <section className="border border-outline-variant rounded-xl p-3" aria-label="Not in a room">
            <h3 className="text-sm font-semibold text-on-surface mb-1">
              Not in a room <span className="text-on-surface-variant font-normal">({unassigned.length})</span>
            </h3>
            {unassigned.length === 0 ? (
              <p className="text-xs text-on-surface-variant/70 italic py-2">{attendees.length === 0 ? 'No attendees yet.' : 'Everyone is in a room.'}</p>
            ) : (
              <ul className="divide-y divide-outline-variant/40 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {unassigned.filter(matches).map((m) => personRow(m.user_id, undefined))}
              </ul>
            )}
          </section>

          {formerAttendees.length > 0 && (
            <section className="border border-outline-variant rounded-xl p-3" aria-label="No longer attendees">
              <h3 className="text-sm font-semibold text-on-surface">No longer attendees ({formerAttendees.length})</h3>
              <p className="text-xs text-on-surface-variant mb-1">Their role on this event changed after they were placed. They don’t count toward headcounts.</p>
              <ul className="divide-y divide-outline-variant/40">
                {formerAttendees.map((a) => {
                  const m = memberById.get(a.user_id);
                  const room = rooms.find((r) => r.id === a.room_id);
                  return (
                    <li key={a.user_id} className="flex items-center gap-2 py-1.5">
                      <p className="text-sm text-on-surface flex-1 min-w-0 truncate">
                        {m?.name ?? 'Unknown person'} <span className="text-xs text-on-surface-variant">· {room?.name}</span>
                      </p>
                      <button type="button" className="btn-secondary text-xs py-1" disabled={busyUser === a.user_id} onClick={() => assign(a.user_id, '')}>
                        Unassign
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </FormModal>

    <CsvImportModal<PeopleListRow>
      open={listUploadOpen}
      onClose={() => setListUploadOpen(false)}
      onImported={() => {
        load();
        onChanged();
      }}
      title={session ? `Upload people list — ${session.title}` : 'Upload people list'}
      templateFilename="people-list-template.csv"
      columns={PEOPLE_LIST_COLUMNS}
      sampleRows={PEOPLE_LIST_SAMPLES}
      parseRow={(raw, i) => parsePeopleListRow(raw, i, { rooms, attendeesByEmail })}
      refineResults={refinePeopleList}
      previewWarnings={(rows) => peopleListCapacityWarnings(rows, assignments, rooms, attendeeIds)}
      importRow={importListRow}
    />
    </>
  );
}
