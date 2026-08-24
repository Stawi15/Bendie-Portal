'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';

type BasicsForm = {
  name: string;
  slug: string;
  description: string;
  location: string;
  status: string;
  event_type: string;
  starts_at: string;
  ends_at: string;
  attendee_limit: string;
  networking_mode: string;
  interests_enabled: boolean;
  in_house: boolean;
  disabled_menu_items: string[];
};

const EMPTY: BasicsForm = {
  name: '', slug: '', description: '', location: '',
  status: 'draft', event_type: 'conference', starts_at: '', ends_at: '',
  attendee_limit: '', networking_mode: 'full',
  interests_enabled: true, in_house: false, disabled_menu_items: [],
};

const MENU_ITEM_LABELS: Record<string, string> = {
  excursions: 'Excursions',
  expo: 'Expo Directory',
  news: 'News Feed',
  interactives: 'Interactives (Games)',
  event_photos: 'Event Photos',
  files: 'Files',
  feedback: 'Feedback',
  info: 'Info Center',
};
const MENU_ITEM_KEYS = Object.keys(MENU_ITEM_LABELS);

function toLocalDatetime(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16);
}

export default function BasicsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [form, setForm] = useState<BasicsForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    supabase.from('events').select('*').eq('id', eventId).single().then(({ data, error }) => {
      if (error) { toast.error('Failed to load event'); }
      else if (data) {
        setForm({
          name: data.name ?? '',
          slug: data.slug ?? '',
          description: data.description ?? '',
          location: data.location ?? '',
          status: data.status ?? 'draft',
          event_type: data.event_type ?? 'conference',
          starts_at: toLocalDatetime(data.starts_at),
          ends_at: toLocalDatetime(data.ends_at),
          attendee_limit: data.attendee_limit?.toString() ?? '',
          networking_mode: data.networking_mode ?? 'full',
          interests_enabled: data.interests_enabled ?? true,
          in_house: data.in_house ?? false,
          disabled_menu_items: data.disabled_menu_items ?? [],
        });
      }
      setLoading(false);
    });
  }, [eventId]);

  const set = (field: keyof BasicsForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const setCheck = (field: keyof BasicsForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.checked }));

  const toggleMenuItem = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({
      ...prev,
      disabled_menu_items: e.target.checked
        ? [...prev.disabled_menu_items, key]
        : prev.disabled_menu_items.filter(k => k !== key),
    }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('events').update({
      name: form.name,
      slug: form.slug || null,
      description: form.description || null,
      location: form.location || null,
      status: form.status,
      event_type: form.event_type,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      attendee_limit: form.attendee_limit ? parseInt(form.attendee_limit) : null,
      networking_mode: form.networking_mode,
      interests_enabled: form.interests_enabled,
      in_house: form.in_house,
      disabled_menu_items: form.disabled_menu_items,
    }).eq('id', eventId);

    if (error) { toast.error(error.message); }
    else { toast.success('Basics saved'); }
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-96 bg-surface-container-low rounded-[20px]" />;

  return (
    <div>
      <div className="mb-6">
        <SectionHeader sectionKey="basics" />
      </div>

      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 space-y-6">

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="label">Event Name *</label>
            <input className="input" value={form.name} onChange={set('name')} placeholder="Annual Tech Summit 2026" />
          </div>

          <div>
            <label className="label">Slug</label>
            <input className="input" value={form.slug} onChange={set('slug')} placeholder="tech-summit-2026" />
            <p className="hint">URL-friendly identifier</p>
          </div>

          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className="label">Event Type</label>
            <select className="input" value={form.event_type} onChange={set('event_type')}>
              <option value="conference">Conference</option>
              <option value="teambuilding">Team Building</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          <div>
            <label className="label">Attendee Limit</label>
            <input type="number" className="input" value={form.attendee_limit} onChange={set('attendee_limit')} placeholder="500" min={0} />
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <label className="label">Description</label>
            <textarea className="input h-24 resize-none" value={form.description} onChange={set('description')} placeholder="Describe this event..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={set('location')} placeholder="Cape Town International Convention Centre" />
          </div>

          <div>
            <label className="label">Start Date & Time</label>
            <input type="datetime-local" className="input" value={form.starts_at} onChange={set('starts_at')} />
          </div>

          <div>
            <label className="label">End Date & Time</label>
            <input type="datetime-local" className="input" value={form.ends_at} onChange={set('ends_at')} />
          </div>

          <div>
            <label className="label">Networking Mode</label>
            <select className="input" value={form.networking_mode} onChange={set('networking_mode')}>
              <option value="full">Full</option>
              <option value="attendees_only">Attendees Only</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6 sm:col-span-2 lg:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.interests_enabled} onChange={setCheck('interests_enabled')} className="w-4 h-4 accent-primary rounded" />
              <span className="text-sm font-medium text-on-surface">Interests Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.in_house} onChange={setCheck('in_house')} className="w-4 h-4 accent-primary rounded" />
              <span className="text-sm font-medium text-on-surface">In-House Event</span>
            </label>
          </div>
        </div>

        <div className="border-t border-outline-variant pt-6">
          <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-1">Hide Menu Items</h3>
          <p className="hint mb-3">
            Hide optional menu items for this event only. Gallery and Help/FAQs can&apos;t be hidden here — the app&apos;s bottom tab bar always links to them. Networking is controlled by the Networking Mode field above, not this list.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MENU_ITEM_KEYS.map(key => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.disabled_menu_items.includes(key)}
                  onChange={toggleMenuItem(key)}
                  className="w-4 h-4 accent-primary rounded"
                />
                <span className="text-sm font-medium text-on-surface">{MENU_ITEM_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-outline-variant">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
