'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';
import type { Database } from '@/types/database';

type Event = Database['public']['Tables']['events']['Row'];

type CreateEventModalProps = {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onCreated: (event: Event) => void;
};

const EMPTY_FORM = { name: '', location: '', starts_at: '', ends_at: '' };

export function CreateEventModal({ open, organizationId, onClose, onCreated }: CreateEventModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const setField = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleClose = () => {
    setForm(EMPTY_FORM);
    onClose();
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Event name is required');
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('events')
      .insert({
        organization_id: organizationId,
        name: form.name.trim(),
        location: form.location.trim() || null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        status: 'draft',
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Event created');
    onCreated(data);
    setForm(EMPTY_FORM);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">New Event</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Event name</label>
            <input className="input" value={form.name} onChange={setField('name')} placeholder="e.g. Stawi Escape" />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={setField('location')} placeholder="e.g. Naivasha" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Start date</label>
              <input className="input" type="date" value={form.starts_at} onChange={setField('starts_at')} />
            </div>
            <div>
              <label className="label">End date</label>
              <input className="input" type="date" value={form.ends_at} onChange={setField('ends_at')} />
            </div>
          </div>
          <p className="hint">New events start as Draft — you can publish once it&apos;s ready.</p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
