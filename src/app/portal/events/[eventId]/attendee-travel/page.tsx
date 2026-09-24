'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useEvent } from '@/contexts/EventContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import { isProductAvailableForEvent } from '@/lib/eventAuth';
import { markTravelJourneyStarted, consumeTravelJourneyReturnFlag } from '@/lib/travelReturnContext';
import toast from 'react-hot-toast';

type Member = {
  user_id: string;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
};

type TravelDetail = {
  id: string;
  type: string;
  title: string | null;
  boarding_time: string | null;
  route: string | null;
  origin: string | null;
  destination: string | null;
  travel_time: string | null;
  pickup_vehicle: string | null;
  pickup_location: string | null;
  date: string | null;
  source_planner_key: string | null;
};

type TravelForm = {
  type: string;
  title: string;
  date: string;
  boarding_time: string;
  route: string;
  origin: string;
  destination: string;
  travel_time: string;
  pickup_vehicle: string;
  pickup_location: string;
};

const TRAVEL_TYPES = ['flight', 'ground_transfer', 'other'] as const;
const TRAVEL_TYPE_LABELS: Record<string, string> = { flight: 'Flight', ground_transfer: 'Ground Transfer', other: 'Other' };
const TRAVEL_TYPE_ICONS: Record<string, string> = { flight: 'flight', ground_transfer: 'directions_car', other: 'luggage' };

const EMPTY_FORM: TravelForm = {
  type: 'flight', title: '', date: '', boarding_time: '', route: '', origin: '',
  destination: '', travel_time: '', pickup_vehicle: '', pickup_location: '',
};

export default function AttendeeTravelPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const { currentEvent } = useEvent();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);
  const [details, setDetails] = useState<TravelDetail[]>([]);

  const [editing, setEditing] = useState<TravelDetail | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TravelForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Part B — Both-Product Travel Journey guidance (Feature 016). `isBothProduct`
  // starts `null` (unknown) so the banner never flashes incorrectly before the
  // check resolves; this page is only ever reachable on an event that already
  // has Bendie active (attendee-travel is classified `product: 'bendie'` in
  // EVENT_SECTIONS), so only Planner's own availability needs checking here.
  const [isBothProduct, setIsBothProduct] = useState<boolean | null>(null);
  const [justReturnedFromPlanner, setJustReturnedFromPlanner] = useState(false);
  const [pullingTravel, setPullingTravel] = useState(false);

  useEffect(() => {
    if (!eventId || !currentEvent?.organization_id) return;
    let cancelled = false;
    isProductAvailableForEvent(eventId, currentEvent.organization_id, 'planner')
      .then((available) => { if (!cancelled) setIsBothProduct(available); })
      .catch((err) => { console.error('AttendeeTravelPage: planner availability check failed', err); if (!cancelled) setIsBothProduct(false); });
    return () => { cancelled = true; };
  }, [eventId, currentEvent?.organization_id]);

  useEffect(() => {
    if (!eventId) return;
    setJustReturnedFromPlanner(consumeTravelJourneyReturnFlag(eventId));
  }, [eventId]);

  const handleSetUpInPlanner = () => {
    markTravelJourneyStarted(eventId);
    router.push(`/portal/events/${eventId}/planner-logistics?product=planner&view=flights`);
  };

  const handlePullTravel = async () => {
    setPullingTravel(true);
    try {
      const res = await fetch('/api/admin/planner-pull-travel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error ?? 'Failed to pull travel data'); return; }
      if ((body.unmatched ?? 0) > 0) toast(`Pulled ${body.pulled}, ${body.unmatched} traveler(s) unmatched`, { icon: '⚠️' });
      else toast.success(`Pulled ${body.pulled} travel record${body.pulled === 1 ? '' : 's'} from Bendie Planner`);
      setJustReturnedFromPlanner(false);
      if (selected) fetchDetails(selected.user_id);
    } catch (err) {
      toast.error('Failed to pull travel data');
      console.error(err);
    } finally {
      setPullingTravel(false);
    }
  };

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from('event_members')
      .select('user_id,profiles!event_members_user_id_fkey(full_name,email,avatar_url)')
      .eq('event_id', eventId);
    if (error) { toast.error('Failed to load attendees'); setLoading(false); return; }
    const rows = (data as unknown as Member[]) ?? [];
    rows.sort((a, b) => (a.profiles?.full_name ?? '').localeCompare(b.profiles?.full_name ?? ''));
    setMembers(rows);
    setLoading(false);
  };

  const fetchDetails = async (userId: string) => {
    const { data, error } = await supabase
      .from('attendee_travel_details')
      .select('id,type,title,boarding_time,route,origin,destination,travel_time,pickup_vehicle,pickup_location,date,source_planner_key')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .order('created_at');
    if (error) toast.error('Failed to load travel details');
    else setDetails(data ?? []);
  };

  useEffect(() => { if (eventId) fetchMembers(); }, [eventId]);
  useEffect(() => { if (selected) fetchDetails(selected.user_id); else setDetails([]); }, [selected]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (d: TravelDetail) => {
    setEditing(d);
    setForm({
      type: d.type, title: d.title ?? '', date: d.date ?? '', boarding_time: d.boarding_time ?? '',
      route: d.route ?? '', origin: d.origin ?? '', destination: d.destination ?? '',
      travel_time: d.travel_time ?? '', pickup_vehicle: d.pickup_vehicle ?? '', pickup_location: d.pickup_location ?? '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);

    const payload = {
      type: form.type,
      title: form.title.trim() || null,
      date: form.date.trim() || null,
      boarding_time: form.boarding_time.trim() || null,
      route: form.route.trim() || null,
      origin: form.origin.trim() || null,
      destination: form.destination.trim() || null,
      travel_time: form.travel_time.trim() || null,
      pickup_vehicle: form.pickup_vehicle.trim() || null,
      pickup_location: form.pickup_location.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from('attendee_travel_details').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message);
      else { toast.success('Updated'); setShowForm(false); fetchDetails(selected.user_id); }
    } else {
      const { error } = await supabase.from('attendee_travel_details').insert({
        ...payload, user_id: selected.user_id, event_id: eventId,
      });
      if (error) toast.error(error.message);
      else { toast.success('Added'); setShowForm(false); fetchDetails(selected.user_id); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!selected) return;
    if (!(await confirm({ message: 'Delete this travel entry?', confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('attendee_travel_details').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchDetails(selected.user_id); }
  };

  const filteredMembers = members.filter(m => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (m.profiles?.full_name ?? '').toLowerCase().includes(q) || (m.profiles?.email ?? '').toLowerCase().includes(q);
  });

  const routeSummary = (d: TravelDetail) => d.route || (d.origin || d.destination ? `${d.origin ?? '?'} → ${d.destination ?? '?'}` : null);

  return (
    <div>
      <div className="mb-6">
        <SectionHeader sectionKey="attendee-travel" desc="Flight and ground-transfer details, organiser-entered per attendee" />
      </div>

      {/* Part B — Both-Product Travel Journey guidance (Feature 016). Never
          rendered for a Bendie-only or Planner-only event — `isBothProduct`
          only ever resolves `true` once this event's own `event_products`
          confirms an active Planner entitlement too. Inline, non-blocking:
          the ordinary manual travel workflow below remains fully usable
          either way, this is guidance, not a gate. */}
      {isBothProduct && (
        <div className="mb-6 bg-primary/5 border border-primary/20 rounded-[20px] p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary mt-0.5">sync_alt</span>
          <div className="flex-1 min-w-0">
            {justReturnedFromPlanner ? (
              <>
                <p className="text-sm font-medium text-on-surface">Travel setup in Planner complete?</p>
                <p className="text-sm text-on-surface-variant mt-0.5">Pull the latest travel details into Bendie so you don&apos;t have to enter them twice.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-on-surface">Using Bendie Planner for this event?</p>
                <p className="text-sm text-on-surface-variant mt-0.5">
                  Set up participant travel in Planner first, then pull the travel details into Bendie so you don&apos;t have to enter them twice.
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {justReturnedFromPlanner ? (
                <>
                  <button onClick={handlePullTravel} disabled={pullingTravel} className="btn-primary text-xs py-1.5">
                    {pullingTravel ? 'Pulling…' : 'Pull from Bendie Planner'}
                  </button>
                  <button onClick={handleSetUpInPlanner} className="text-xs text-primary hover:opacity-80 font-medium px-2 py-1.5">
                    Continue in Planner
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleSetUpInPlanner} className="btn-primary text-xs py-1.5">
                    Set up in Bendie Planner
                  </button>
                  <button onClick={handlePullTravel} disabled={pullingTravel} className="btn-secondary text-xs py-1.5">
                    {pullingTravel ? 'Pulling…' : 'Pull from Bendie Planner'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendee picker */}
        <div className="lg:col-span-1">
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Attendees</h3>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full mb-3"
          />
          {loading ? (
            <div className="animate-pulse space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-surface-container-low rounded-xl" />)}</div>
          ) : filteredMembers.length === 0 ? (
            <p className="text-sm text-on-surface-variant/70 italic">No attendees match.</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
              {filteredMembers.map(m => (
                <div
                  key={m.user_id}
                  onClick={() => setSelected(m)}
                  className={`cursor-pointer rounded-[20px] p-3 border transition flex items-center gap-3 ${selected?.user_id === m.user_id ? 'border-primary bg-primary/5' : 'border-[#E4EAF0] bg-white panel-shadow hover:border-primary/30'}`}
                >
                  <Avatar name={m.profiles?.full_name} email={m.profiles?.email} avatarUrl={m.profiles?.avatar_url} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-on-surface truncate">{m.profiles?.full_name ?? 'Unnamed'}</p>
                    <p className="text-xs text-on-surface-variant/70 truncate">{m.profiles?.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Travel details for selected attendee */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="flex items-center justify-center h-64 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow text-on-surface-variant text-sm">Select an attendee to manage their travel details</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  {selected.profiles?.full_name ?? 'Attendee'} — {details.length} entr{details.length !== 1 ? 'ies' : 'y'}
                </h3>
                <button onClick={openAdd} className="btn-primary text-xs py-1.5">
                  <span className="material-symbols-outlined text-[16px]">add</span> Add Entry
                </button>
              </div>

              {details.length === 0 ? (
                <p className="text-sm text-on-surface-variant/70 italic">No travel details for this attendee yet.</p>
              ) : (
                <div className="space-y-2">
                  {details.map(d => (
                    <div key={d.id} className="flex items-start gap-3 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-primary text-[20px]">{TRAVEL_TYPE_ICONS[d.type] ?? 'luggage'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{TRAVEL_TYPE_LABELS[d.type] ?? d.type}</span>
                          {d.source_planner_key && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container"
                              title="Synced from Bendie Planner — read-only here"
                            >
                              <span className="material-symbols-outlined text-[12px]">sync_alt</span> From Planner
                            </span>
                          )}
                          {d.title && <p className="font-medium text-sm text-on-surface">{d.title}</p>}
                        </div>
                        <div className="text-xs text-on-surface-variant mt-1 space-y-0.5">
                          {routeSummary(d) && <p>{routeSummary(d)}</p>}
                          {(d.date || d.boarding_time) && <p>{[d.date, d.boarding_time].filter(Boolean).join(' · ')}</p>}
                          {d.travel_time && <p>Duration: {d.travel_time}</p>}
                          {(d.pickup_vehicle || d.pickup_location) && <p>{[d.pickup_vehicle, d.pickup_location].filter(Boolean).join(' · ')}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {!d.source_planner_key && (
                          <button onClick={() => openEdit(d)} className="text-xs text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5">Edit</button>
                        )}
                        <button onClick={() => handleDelete(d.id)} className="text-xs text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Travel Entry' : 'New Travel Entry'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {TRAVEL_TYPES.map(t => <option key={t} value={t}>{TRAVEL_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Flight KQ102 or Airport Shuttle" />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} placeholder="e.g. 12 Sep 2026" />
          </div>
          <div>
            <label className="label">Boarding Time</label>
            <input className="input" value={form.boarding_time} onChange={e => setForm(p => ({ ...p, boarding_time: e.target.value }))} placeholder="e.g. 14:30" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Route</label>
            <input className="input" value={form.route} onChange={e => setForm(p => ({ ...p, route: e.target.value }))} placeholder="NBO → JFK" />
            <p className="hint">Leave blank to build the route from Origin/Destination below instead</p>
          </div>
          <div>
            <label className="label">Origin</label>
            <input className="input" value={form.origin} onChange={e => setForm(p => ({ ...p, origin: e.target.value }))} placeholder="Nairobi (NBO)" />
          </div>
          <div>
            <label className="label">Destination</label>
            <input className="input" value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))} placeholder="New York (JFK)" />
          </div>
          <div>
            <label className="label">Travel Time</label>
            <input className="input" value={form.travel_time} onChange={e => setForm(p => ({ ...p, travel_time: e.target.value }))} placeholder="e.g. 8h 20m" />
          </div>
          <div />
          <div>
            <label className="label">Pickup Vehicle</label>
            <input className="input" value={form.pickup_vehicle} onChange={e => setForm(p => ({ ...p, pickup_vehicle: e.target.value }))} placeholder="For ground transfers" />
          </div>
          <div>
            <label className="label">Pickup Location</label>
            <input className="input" value={form.pickup_location} onChange={e => setForm(p => ({ ...p, pickup_location: e.target.value }))} placeholder="For ground transfers" />
          </div>
        </div>
        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add Entry'}</button>
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
        </div>
      </FormModal>
    </div>
  );
}
