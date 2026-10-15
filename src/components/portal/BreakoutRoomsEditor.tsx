'use client';

import { moveItem } from '@/lib/reorder';
import { useConfirm } from '@/contexts/ConfirmContext';
import {
  BREAKOUT_MODES,
  BREAKOUT_MODE_LABELS,
  newBlockForm,
  newRoomForm,
  type BreakoutBlockForm,
  type BreakoutRoomForm,
} from '@/lib/breakoutRooms';
import type { BreakoutMode } from '@/types/database';

type Facilitator = { id: string; full_name: string | null; email: string | null };

/**
 * Feature 021 — breakout rooms editor inside the agenda session form (moved out of the agenda
 * page's former BreakoutRoomsPanel). Edits local state only; the page saves it through
 * save_breakout_rooms after the session itself is saved.
 */
export function BreakoutRoomsEditor({
  rooms,
  onChange,
  facilitators,
  mode,
  onModeChange,
  headcounts,
  assignedTotal,
}: {
  rooms: BreakoutRoomForm[];
  onChange: (rooms: BreakoutRoomForm[]) => void;
  facilitators: Facilitator[];
  mode: BreakoutMode;
  onModeChange: (mode: BreakoutMode) => void;
  /** Current attendees per saved room id (shown next to capacity). */
  headcounts: Record<string, number>;
  /** All assignments per saved room id (used for the delete warning). */
  assignedTotal: Record<string, number>;
}) {
  const confirm = useConfirm();

  const updateRoom = (roomId: string, patch: Partial<BreakoutRoomForm>) =>
    onChange(rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)));

  const updateBlock = (roomId: string, blockId: string, patch: Partial<BreakoutBlockForm>) =>
    onChange(rooms.map((r) => (r.id === roomId ? { ...r, blocks: r.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) } : r)));

  const removeRoom = async (room: BreakoutRoomForm) => {
    const people = room.isNew ? 0 : assignedTotal[room.id] ?? 0;
    if (people > 0) {
      const ok = await confirm({
        title: 'Remove room',
        message: `${people} ${people === 1 ? 'person is' : 'people are'} in "${room.name || 'this room'}". Removing it unassigns them when you save.`,
        confirmLabel: 'Remove room',
        destructive: true,
      });
      if (!ok) return;
    }
    onChange(rooms.filter((r) => r.id !== room.id));
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide">Breakout Rooms</h3>
        <button type="button" onClick={() => onChange([...rooms, newRoomForm()])} className="btn-secondary text-xs py-1.5">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span> Add Room
        </button>
      </div>

      {rooms.length === 0 ? (
        <p className="text-sm text-on-surface-variant/70 italic">No breakout rooms — attendees will see this as a regular session.</p>
      ) : (
        <>
          <fieldset className="mb-4">
            <legend className="label">Who places attendees</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {BREAKOUT_MODES.map((m) => (
                <label
                  key={m}
                  className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition ${
                    mode === m ? 'border-primary/40 bg-primary/5' : 'border-outline-variant hover:border-primary/30'
                  }`}
                >
                  <input type="radio" name="breakout-mode" className="mt-1" checked={mode === m} onChange={() => onModeChange(m)} />
                  <span>
                    <span className="block text-sm font-medium text-on-surface">{BREAKOUT_MODE_LABELS[m].label}</span>
                    <span className="block text-xs text-on-surface-variant">{BREAKOUT_MODE_LABELS[m].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-4">
            {rooms.map((room, ri) => {
              const hc = room.isNew ? 0 : headcounts[room.id] ?? 0;
              const cap = room.capacity.trim() ? Number(room.capacity) : null;
              return (
                <div key={room.id} className="bg-surface-container-low rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label text-xs" htmlFor={`room-name-${room.id}`}>Room Name *</label>
                        <input id={`room-name-${room.id}`} className="input text-sm" value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} placeholder="Room A — Product Track" maxLength={200} />
                      </div>
                      <div>
                        <label className="label text-xs" htmlFor={`room-fac-${room.id}`}>Facilitator</label>
                        <select id={`room-fac-${room.id}`} className="input text-sm" value={room.facilitator_id} onChange={(e) => updateRoom(room.id, { facilitator_id: e.target.value })}>
                          <option value="">None</option>
                          {facilitators.map((f) => <option key={f.id} value={f.id}>{f.full_name ?? f.email ?? 'Unnamed speaker'}</option>)}
                        </select>
                        {!room.facilitator_id && room.legacyFacilitatorName && (
                          <p className="hint flex items-center gap-1">
                            Was: {room.legacyFacilitatorName}
                            <button type="button" className="text-primary hover:opacity-80 font-medium" onClick={() => updateRoom(room.id, { legacyFacilitatorName: '' })}>Remove</button>
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="label text-xs" htmlFor={`room-loc-${room.id}`}>Location</label>
                        <input id={`room-loc-${room.id}`} className="input text-sm" value={room.location} onChange={(e) => updateRoom(room.id, { location: e.target.value })} placeholder="Hall 2" maxLength={200} />
                      </div>
                      <div>
                        <label className="label text-xs" htmlFor={`room-cap-${room.id}`}>Capacity</label>
                        <input id={`room-cap-${room.id}`} type="number" min={1} step={1} inputMode="numeric" className="input text-sm" value={room.capacity} onChange={(e) => updateRoom(room.id, { capacity: e.target.value })} placeholder="No limit" />
                        {!room.isNew && (
                          <p className={`hint ${cap !== null && hc > cap ? 'text-error' : ''}`}>
                            {cap !== null ? `${hc} / ${cap} attendees` : `${hc} attendee${hc !== 1 ? 's' : ''} · no limit`}
                            {cap !== null && hc > cap ? ' — over capacity' : ''}
                          </p>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label text-xs" htmlFor={`room-desc-${room.id}`}>Description</label>
                        <input id={`room-desc-${room.id}`} className="input text-sm" value={room.description} onChange={(e) => updateRoom(room.id, { description: e.target.value })} placeholder="What happens in this room" maxLength={2000} />
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0 pt-6">
                      <button type="button" aria-label={`Move ${room.name || 'room'} up`} onClick={() => onChange(moveItem(rooms, ri, 'up'))} disabled={ri === 0} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_upward</span>
                      </button>
                      <button type="button" aria-label={`Move ${room.name || 'room'} down`} onClick={() => onChange(moveItem(rooms, ri, 'down'))} disabled={ri === rooms.length - 1} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_downward</span>
                      </button>
                      <button type="button" aria-label={`Remove ${room.name || 'room'}`} onClick={() => removeRoom(room)} className="p-1 rounded text-on-surface-variant hover:text-error">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-outline-variant/50 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Mini-Agenda</p>
                      <button type="button" onClick={() => updateRoom(room.id, { blocks: [...room.blocks, newBlockForm()] })} className="text-xs text-primary hover:opacity-80 font-medium">+ Add Time Block</button>
                    </div>
                    {room.blocks.length === 0 ? (
                      <p className="text-xs text-on-surface-variant/70 italic">No time blocks yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {room.blocks.map((item, ai) => (
                          <div key={item.id} className="bg-white border border-outline-variant rounded-lg p-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                              <input className="input text-xs" aria-label="Time block title" value={item.title} onChange={(e) => updateBlock(room.id, item.id, { title: e.target.value })} placeholder="Time block title" maxLength={300} />
                              <input className="input text-xs" aria-label="Time block location" value={item.location} onChange={(e) => updateBlock(room.id, item.id, { location: e.target.value })} placeholder="Location" maxLength={200} />
                              <input type="datetime-local" aria-label="Time block start" className="input text-xs" value={item.starts_at} onChange={(e) => updateBlock(room.id, item.id, { starts_at: e.target.value })} />
                              <input type="datetime-local" aria-label="Time block end" className="input text-xs" value={item.ends_at} min={item.starts_at || undefined} onChange={(e) => updateBlock(room.id, item.id, { ends_at: e.target.value })} />
                            </div>
                            <div className="flex items-start gap-2">
                              <input className="input text-xs flex-1" aria-label="Time block description" value={item.description} onChange={(e) => updateBlock(room.id, item.id, { description: e.target.value })} placeholder="Description" maxLength={2000} />
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button type="button" aria-label="Move time block up" onClick={() => updateRoom(room.id, { blocks: moveItem(room.blocks, ai, 'up') })} disabled={ai === 0} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_upward</span>
                                </button>
                                <button type="button" aria-label="Move time block down" onClick={() => updateRoom(room.id, { blocks: moveItem(room.blocks, ai, 'down') })} disabled={ai === room.blocks.length - 1} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_downward</span>
                                </button>
                                <button type="button" aria-label="Remove time block" onClick={() => updateRoom(room.id, { blocks: room.blocks.filter((b) => b.id !== item.id) })} className="p-1 rounded text-on-surface-variant hover:text-error">
                                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
