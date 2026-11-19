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
import { TimeZoneField } from '@/components/portal/TimeZoneField';
import {
  TIME_ZONE_REJECTED_MESSAGE,
  detectTimeZone,
  isListedTimeZone,
  isTimeZoneConstraintError,
  isValidTimeZone,
  utcIsoToZonedLocal,
  zonedLocalToUtcIso,
} from '@/lib/eventTimeZone';

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
  /** Feature 024: IANA name, '' = not set. */
  timezone: string;
};

const EMPTY: BasicsForm = {
  name: '', slug: '', description: '', location: '',
  status: 'draft', event_type: 'conference', starts_at: '', ends_at: '',
  attendee_limit: '', networking_mode: 'full',
  interests_enabled: true, in_house: false, disabled_menu_items: [], timezone: '',
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
 * Feature 024 — venue time. Start/End are shown and saved in the event's time zone, or in the
 * organiser's computer zone when the event has none (exactly as before: Feature 016 already made
 * Save and display agree on the computer's zone). `displayZone` below is the zone the current
 * `datetime-local` strings are written in.
 */
const computerZone = () => detectTimeZone() ?? 'UTC';

export default function BasicsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  // Keep the shared event (Dashboard readiness, nav) in step with what was just saved — no refetch.
  const { patchCurrentEvent } = useEvent();
  const [form, setForm] = useState<BasicsForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Feature 024: the zone the Start/End strings are currently written in, whether the event has
  // Bendie Planner (its own time zone isn't synced), and whether the zone was changed this visit.
  const [displayZone, setDisplayZone] = useState<string>(computerZone);
  const [hasPlanner, setHasPlanner] = useState(false);
  const [zoneChanged, setZoneChanged] = useState(false);
  // The zone stored on the event, accepted on save even if this browser's list lacks it (an alias).
  const [loadedZone, setLoadedZone] = useState('');
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
        const zone = isValidTimeZone(data.timezone) ? data.timezone : computerZone();
        setLoadedZone(data.timezone ?? '');
        setDisplayZone(zone);
        // 'not_required' (the column default) = no Bendie Planner on this event.
        setHasPlanner(!!data.planner_provisioning_status && data.planner_provisioning_status !== 'not_required');
        setForm({
          name: data.name ?? '',
          slug: data.slug ?? '',
          description: data.description ?? '',
          location: data.location ?? '',
          status: data.status ?? 'draft',
          event_type: data.event_type ?? 'conference',
          starts_at: utcIsoToZonedLocal(data.starts_at, zone),
          ends_at: utcIsoToZonedLocal(data.ends_at, zone),
          attendee_limit: data.attendee_limit?.toString() ?? '',
          networking_mode: data.networking_mode ?? 'full',
          interests_enabled: data.interests_enabled ?? true,
          in_house: data.in_house ?? false,
          disabled_menu_items: data.disabled_menu_items ?? [],
          timezone: data.timezone ?? '',
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

  const [fieldErrors, setFieldErrors] = useState<{ name?: string; ends_at?: string; timezone?: string }>({});

  /**
   * Feature 024 (FR-008): once the field holds a valid zone (or is cleared), re-show Start/End in it
   * without moving the moments they represent: old-zone wall clock → instant → new-zone wall clock.
   * While a name is half-typed nothing is converted.
   */
  const changeTimeZone = (value: string) => {
    setFieldErrors((p) => ({ ...p, timezone: undefined }));
    const nextZone = value === '' ? computerZone() : isListedTimeZone(value) || (value === loadedZone && isValidTimeZone(value)) ? value : null;
    setForm((prev) => {
      if (!nextZone || nextZone === displayZone) return { ...prev, timezone: value };
      const convert = (local: string) => {
        const iso = local ? zonedLocalToUtcIso(local, displayZone) : null;
        return iso ? utcIsoToZonedLocal(iso, nextZone) : local;
      };
      return { ...prev, timezone: value, starts_at: convert(prev.starts_at), ends_at: convert(prev.ends_at) };
    });
    if (nextZone && nextZone !== displayZone) {
      setDisplayZone(nextZone);
      if (form.starts_at || form.ends_at) setZoneChanged(true);
    }
  };

  const handleSave = async () => {
    const errors: { name?: string; ends_at?: string; timezone?: string } = {};
    if (!form.name.trim()) errors.name = 'Your event needs a name.';
    if (form.starts_at && form.ends_at && form.ends_at < form.starts_at) errors.ends_at = 'The end is before the start. Choose the same time or later.';
    if (form.timezone && form.timezone !== loadedZone && !isListedTimeZone(form.timezone)) errors.timezone = 'Choose a time zone from the list.';
    setFieldErrors(errors);
    if (errors.name || errors.ends_at || errors.timezone) return;
    setSaving(true);
    saveStatus.start();
    const payload = {
      name: form.name,
      slug: form.slug || null,
      description: form.description || null,
      location: form.location || null,
      status: form.status,
      event_type: form.event_type,
      // Venue time (FR-007): the strings are wall-clock times in `displayZone`.
      starts_at: form.starts_at ? zonedLocalToUtcIso(form.starts_at, displayZone) : null,
      ends_at: form.ends_at ? zonedLocalToUtcIso(form.ends_at, displayZone) : null,
      attendee_limit: form.attendee_limit ? parseInt(form.attendee_limit) : null,
      networking_mode: form.networking_mode,
      interests_enabled: form.interests_enabled,
      in_house: form.in_house,
      disabled_menu_items: form.disabled_menu_items,
      timezone: form.timezone || null,
    };
    const { error } = await supabase.from('events').update(payload).eq('id', eventId);

    if (error) {
      if (isTimeZoneConstraintError(error)) setFieldErrors((p) => ({ ...p, timezone: TIME_ZONE_REJECTED_MESSAGE }));
      toast.error(isTimeZoneConstraintError(error) ? TIME_ZONE_REJECTED_MESSAGE : friendlyError(error));
      saveStatus.fail();
    }
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

          {/* Feature 024 — time zone (FR-004, FR-005, FR-011). */}
          <div className="sm:col-span-2 lg:col-span-2">
            <TimeZoneField
              id="basics-timezone"
              label="Time zone"
              value={form.timezone}
              onChange={changeTimeZone}
              error={fieldErrors.timezone}
              hint={
                zoneChanged
                  ? 'Check the start and end times after changing the time zone.'
                  : hasPlanner
                    ? 'Start and end are in this time zone. Bendie Planner keeps its own time zone, set in the Planner app.'
                    : 'Start and end are in this time zone. It also sets when attendees get reminders.'
              }
            />
          </div>

          {!form.timezone && (
            <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-tertiary-container bg-tertiary-fixed/40 p-3 text-xs text-on-tertiary-fixed-variant flex gap-2" role="status">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">notifications_off</span>
              <span>
                <span className="font-semibold">Attendee reminders are off for this event.</span> Countdowns, nudges, the evening recap and the
                wrap-up message only go out once the event has a time zone. Until then, start and end are shown in your computer&apos;s time zone.
              </span>
            </div>
          )}

          <div>
            <label className="label">Start Date & Time<span className="font-normal text-on-surface-variant"> · {form.timezone ? displayZone : 'your computer’s time zone'}</span></label>
            <input type="datetime-local" className="input" value={form.starts_at} onChange={set('starts_at')} />
          </div>

          <div>
            <label className="label" htmlFor="basics-end">End Date & Time<span className="font-normal text-on-surface-variant"> · {form.timezone ? displayZone : 'your computer’s time zone'}</span></label>
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
