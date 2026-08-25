'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import { useConfirm } from '@/contexts/ConfirmContext';
import { moveItem } from '@/lib/reorder';
import toast from 'react-hot-toast';

// ─── Welcome bullets (info_content) ────────────────────────────────────────

type InfoContentRow = { id: string; event_id: string | null; bullets: string[] };

function WelcomeBulletsCard({ eventId }: { eventId: string }) {
  const confirm = useConfirm();
  const [eventRow, setEventRow] = useState<InfoContentRow | null>(null);
  const [globalRow, setGlobalRow] = useState<InfoContentRow | null>(null);
  const [bullets, setBullets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('info_content')
      .select('id,event_id,bullets')
      .or(`event_id.eq.${eventId},event_id.is.null`);
    if (error) { toast.error('Failed to load welcome message'); setLoading(false); return; }

    const ev = (data ?? []).find(r => r.event_id === eventId) ?? null;
    const glob = (data ?? []).find(r => r.event_id === null) ?? null;
    setEventRow(ev);
    setGlobalRow(glob);
    setBullets((ev ?? glob)?.bullets ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOverride = Boolean(eventRow);
  const isInherited = !eventRow && Boolean(globalRow);

  const handleChangeBullet = (i: number, value: string) =>
    setBullets(prev => prev.map((b, idx) => (idx === i ? value : b)));
  const handleAddBullet = () => setBullets(prev => [...prev, '']);
  const handleRemoveBullet = (i: number) => setBullets(prev => prev.filter((_, idx) => idx !== i));
  const handleMoveBullet = (i: number, direction: 'up' | 'down') =>
    setBullets(prev => moveItem(prev, i, direction));

  const handleSave = async () => {
    const cleaned = bullets.map(b => b.trim()).filter(Boolean);
    if (cleaned.length === 0) { toast.error('Add at least one bullet'); return; }

    setSaving(true);
    if (eventRow) {
      const { error } = await supabase.from('info_content').update({ bullets: cleaned }).eq('id', eventRow.id);
      if (error) toast.error(error.message); else { toast.success('Welcome message updated'); fetchData(); }
    } else {
      const { error } = await supabase.from('info_content').insert({ event_id: eventId, bullets: cleaned });
      if (error) toast.error(error.message); else { toast.success('Event-specific welcome message saved'); fetchData(); }
    }
    setSaving(false);
  };

  const handleRevert = async () => {
    if (!eventRow) return;
    if (!(await confirm({ message: 'Revert to the global default welcome message? This event\'s custom version will be deleted.', confirmLabel: 'Revert', destructive: true }))) return;
    const { error } = await supabase.from('info_content').delete().eq('id', eventRow.id);
    if (error) toast.error(error.message); else { toast.success('Reverted to global default'); fetchData(); }
  };

  if (loading) return <div className="h-40 bg-surface-container-low rounded-[20px] animate-pulse mb-6" />;

  return (
    <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-semibold text-on-surface">Welcome Message</h3>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isOverride ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
          {isOverride ? 'Event-specific' : 'Global default'}
        </span>
      </div>
      <p className="hint mb-4">
        {isInherited
          ? 'Shown to attendees on the Info Center screen. This event has no override yet — editing and saving will create one just for this event, without affecting other events.'
          : isOverride
            ? "This event has its own version, overriding the global default."
            : 'Shown to attendees on the Info Center screen for every event that has no override of its own — editing this affects all of them.'}
      </p>

      <div className="space-y-2 mb-3">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-on-surface-variant flex-shrink-0">•</span>
            <input className="input flex-1" value={b} onChange={e => handleChangeBullet(i, e.target.value)} placeholder="Bullet text" />
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button type="button" onClick={() => handleMoveBullet(i, 'up')} disabled={i === 0} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
              </button>
              <button type="button" onClick={() => handleMoveBullet(i, 'down')} disabled={i === bullets.length - 1} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
              </button>
              <button type="button" onClick={() => handleRemoveBullet(i)} className="p-1 rounded text-on-surface-variant hover:text-error">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={handleAddBullet} className="text-xs text-primary hover:opacity-80 font-medium">+ Add bullet</button>
      </div>

      <div className="flex gap-3 pt-3 border-t border-outline-variant">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : isOverride ? 'Update' : 'Save for this event'}</button>
        {isOverride && (
          <button onClick={handleRevert} className="btn-secondary text-sm">Revert to global default</button>
        )}
      </div>
    </div>
  );
}

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  contact_group: string | null;
  display_order: number;
};

type ContactForm = {
  name: string;
  email: string;
  phone: string;
  avatar_url: string;
  contact_group: string;
  display_order: string;
};

const EMPTY: ContactForm = { name: '', email: '', phone: '', avatar_url: '', contact_group: '', display_order: '0' };

export default function InfoCenterPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('support_contacts')
      .select('id,name,email,phone,avatar_url,contact_group,display_order')
      .eq('event_id', eventId)
      .order('contact_group').order('display_order');
    if (error) toast.error('Failed to load contacts');
    else setContacts(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const groups = Array.from(new Set(contacts.map(c => c.contact_group ?? 'General')));

  const openAdd = (group?: string) => {
    setEditing(null);
    setForm({ ...EMPTY, contact_group: group ?? '', display_order: contacts.length.toString() });
    setShowForm(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', avatar_url: c.avatar_url ?? '', contact_group: c.contact_group ?? '', display_order: c.display_order.toString() });
    setShowForm(true);
  };

  const set = (f: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      avatar_url: form.avatar_url || null,
      contact_group: form.contact_group || null,
      display_order: parseInt(form.display_order) || 0,
    };
    if (editing) {
      const { error } = await supabase.from('support_contacts').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message); else { toast.success('Contact updated'); setShowForm(false); fetchData(); }
    } else {
      const { error } = await supabase.from('support_contacts').insert({ ...payload, event_id: eventId });
      if (error) toast.error(error.message); else { toast.success('Contact added'); setShowForm(false); fetchData(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm({ message: `Delete "${name}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('support_contacts').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchData(); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="info-center" desc="Support contacts available to attendees" />
        <button onClick={() => openAdd()} className="btn-primary flex-shrink-0">
          <span className="material-symbols-outlined text-[18px]">add</span> Add Contact
        </button>
      </div>

      {eventId && <WelcomeBulletsCard eventId={eventId} />}

      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Contact' : 'New Contact'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Full Name *</label>
              <input className="input" value={form.name} onChange={set('name')} placeholder="Support Team" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={set('email')} placeholder="support@event.com" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={set('phone')} placeholder="+27 11 000 0000" />
            </div>
            <div>
              <label className="label">Group</label>
              <input className="input" value={form.contact_group} onChange={set('contact_group')} placeholder="Registration" list="group-opts" />
              <datalist id="group-opts">
                {groups.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Display Order</label>
              <input type="number" className="input" value={form.display_order} onChange={set('display_order')} min={0} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Avatar URL</label>
              <input className="input" value={form.avatar_url} onChange={set('avatar_url')} placeholder="https://..." />
              {form.avatar_url && (
                <div className="mt-2">
                  <Avatar name={form.name} avatarUrl={form.avatar_url} size={40} />
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add Contact'}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
      </FormModal>

      {loading ? (
        <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">info</p>
          <p className="text-on-surface-variant">No support contacts yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{group}</h3>
                <button onClick={() => openAdd(group)} className="text-xs text-primary hover:opacity-80 font-medium">+ Add to group</button>
              </div>
              <div className="space-y-2">
                {contacts.filter(c => (c.contact_group ?? 'General') === group).map(c => (
                  <div key={c.id} className="flex items-center gap-4 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4">
                    <Avatar name={c.name} avatarUrl={c.avatar_url} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-on-surface truncate">{c.name}</p>
                      <p className="text-sm text-on-surface-variant truncate">{[c.email, c.phone].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                      <button onClick={() => openEdit(c)} title="Edit" className="text-sm text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5">
                        <span className="hidden sm:inline">Edit</span>
                        <span className="material-symbols-outlined text-[16px] sm:hidden">edit</span>
                      </button>
                      <button onClick={() => handleDelete(c.id, c.name)} title="Delete" className="text-sm text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5">
                        <span className="hidden sm:inline">Delete</span>
                        <span className="material-symbols-outlined text-[16px] sm:hidden">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
