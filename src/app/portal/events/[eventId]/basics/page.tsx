'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useEvent } from '@/contexts/EventContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { EVENTS_SELECT_COLUMNS, type EventRow } from '@/lib/eventColumns';
import toast from 'react-hot-toast';
import { friendlyError } from '@/lib/userFacingError';
import { useSaveStatus } from '@/lib/useSaveStatus';
import { SaveStatus } from '@/components/portal/SaveStatus';

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

/**
 * ISO → `datetime-local` value in LOCAL time. Feature 016 fix: was the UTC slice of
 * `toISOString()`, while Save parses the input as local time — re-saving Basics in a
 * non-UTC timezone shifted the event's dates by the UTC offset.
 */
function toLocalDatetime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BasicsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  // Keep the shared event (Dashboard readiness, nav) in step with what was just saved — no refetch.
  const { patchCurrentEvent } = useEvent();
  const [form, setForm] = useState<BasicsForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Feature 016: truthful Unsaved → Saving… → Saved / Couldn't save indicator.
  const saveStatus = useSaveStatus(form, !loading);

  useEffect(() => {
    if (!eventId) return;
    // Feature 016 (main-tab performance pass): cancelled when the user leaves; an aborted
    // load never toasts or writes state. (Deliberately still reads the row rather than
    // reusing EventContext: other tabs save event columns without patching the context.)
    const controller = new AbortController();
    supabase.from('events').select(EVENTS_SELECT_COLUMNS).eq('id', eventId).abortSignal(controller.signal).single().then(({ data, error }) => {
      if (controller.signal.aborted) return;
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
    return () => controller.abort();
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

  const [fieldErrors, setFieldErrors] = useState<{ name?: string; ends_at?: string }>({});

  const handleSave = async () => {
    const errors: { name?: string; ends_at?: string } = {};
    if (!form.name.trim()) errors.name = 'Your event needs a name.';
    if (form.starts_at && form.ends_at && new Date(form.ends_at) < new Date(form.starts_at)) errors.ends_at = 'The end is before the start. Choose the same time or later.';
    setFieldErrors(errors);
    if (errors.name || errors.ends_at) return;
    setSaving(true);
    saveStatus.start();
    const payload = {
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
    };
    const { error } = await supabase.from('events').update(payload).eq('id', eventId);

    if (error) { toast.error(friendlyError(error)); saveStatus.fail(); }
    else { toast.success('Basics saved'); saveStatus.succeed(); patchCurrentEvent(eventId, payload as Partial<EventRow>); } // the DB just accepted these values
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-96 bg-surface-container-low rounded-[20px]" />;

  return (
    <div>
      <div className="mb-4">
        <SectionHeader sectionKey="basics" />
      </div>

      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-5 sm:p-6 space-y-5">

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="label" htmlFor="basics-name">Event Name *</label>
            <input
              id="basics-name"
              className={`input ${fieldErrors.name ? 'border-error' : ''}`}
              value={form.name}
              onChange={(e) => { set('name')(e); if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined })); }}
              placeholder="Annual Tech Summit 2026"
              aria-invalid={!!fieldErrors.name}
              aria-describedby={fieldErrors.name ? 'basics-name-error' : undefined}
            />
            {fieldErrors.name && <p id="basics-name-error" className="text-xs text-error mt-1">{fieldErrors.name}</p>}
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
              <option value="active">Live</option>
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
            <label className="label" htmlFor="basics-end">End Date & Time</label>
            <input
              id="basics-end"
              type="datetime-local"
              className={`input ${fieldErrors.ends_at ? 'border-error' : ''}`}
              value={form.ends_at}
              min={form.starts_at || undefined}
              onChange={(e) => { set('ends_at')(e); if (fieldErrors.ends_at) setFieldErrors((p) => ({ ...p, ends_at: undefined })); }}
              aria-invalid={!!fieldErrors.ends_at}
              aria-describedby={fieldErrors.ends_at ? 'basics-end-error' : undefined}
            />
            {fieldErrors.ends_at && <p id="basics-end-error" className="text-xs text-error mt-1">{fieldErrors.ends_at}</p>}
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

        <div className="border-t border-outline-variant pt-5">
          <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-1">Attendee app menu — hide items</h3>
          <p className="hint mb-3">
            Ticked items are hidden from attendees in the Bendie app for this event. Gallery and Help/FAQs always stay in the app&apos;s bottom bar; Networking follows Networking Mode above.
            This is separate from <span className="font-medium">Manage modules</span> (top of the event), which only changes what your team sees here in the Portal.
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

        <div className="pt-2 border-t border-outline-variant flex flex-wrap items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <SaveStatus dirty={saveStatus.dirty} phase={saveStatus.phase} onRetry={handleSave} />
        </div>
      </div>
    </div>
  );
}
