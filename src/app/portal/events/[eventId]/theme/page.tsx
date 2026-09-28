'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useEvent } from '@/contexts/EventContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { EventThemePreview } from '@/components/portal/EventThemePreview';
import { ThemeDesignerModal } from '@/components/portal/ThemeDesignerModal';
import { THEME_FIELDS, THEME_FIELD_KEYS, effectiveTheme, type EventTheme, type ThemeFieldKey } from '@/lib/eventTheme';
import toast from 'react-hot-toast';
import { friendlyError } from '@/lib/userFacingError';

type SavedTheme = Record<ThemeFieldKey, string | null>;

const EMPTY: SavedTheme = { theme_primary: null, theme_secondary: null, theme_tertiary: null };

export default function ThemePage() {
  const { eventId } = useParams<{ eventId: string }>();
  // Keep the shared event (Dashboard readiness, nav) in step with what was just saved — no refetch.
  const { patchCurrentEvent } = useEvent();
  const [saved, setSaved] = useState<SavedTheme>(EMPTY);
  const [eventName, setEventName] = useState('');
  const [loading, setLoading] = useState(true);
  const [designerOpen, setDesignerOpen] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    supabase.from('events').select('name,theme_primary,theme_secondary,theme_tertiary').eq('id', eventId).single().then(({ data, error }) => {
      if (error) toast.error('Failed to load');
      else if (data) {
        setSaved({ theme_primary: data.theme_primary, theme_secondary: data.theme_secondary, theme_tertiary: data.theme_tertiary });
        setEventName(data.name ?? '');
      }
      setLoading(false);
    });
  }, [eventId]);

  // Existing save path, unchanged: one direct `events` update, only ever on Apply.
  const handleApply = async (theme: EventTheme): Promise<string | null> => {
    const { error } = await supabase.from('events').update(theme).eq('id', eventId);
    if (error) {
      // The designer shows this inline (it stays open for a retry), so no duplicate toast —
      // and never the raw database message.
      return friendlyError(error, 'We couldn’t save the theme. Try again.');
    }
    setSaved(theme);
    patchCurrentEvent(eventId, theme);
    toast.success('Theme applied');
    return null;
  };

  if (loading) return <div className="animate-pulse h-96 bg-surface-container-low rounded-[20px]" />;

  const current = effectiveTheme(saved);
  const hasCustomTheme = THEME_FIELD_KEYS.some((k) => saved[k]);
  const previewName = eventName || 'Annual Leadership Summit';

  return (
    <div>
      <div className="mb-6">
        <SectionHeader sectionKey="theme" />
      </div>

      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8">
        <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-8 items-center">
          <div className="flex justify-center">
            <EventThemePreview theme={current} eventName={previewName} />
          </div>

          <div className="space-y-5">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Event theme</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Make your event match your brand. This is roughly how the attendee app will look.
              </p>
              {!hasCustomTheme && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">info</span>
                  Using the standard Bendie theme
                </p>
              )}
            </div>

            <ul className="space-y-3">
              {THEME_FIELD_KEYS.map((k) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full border border-outline-variant shadow-inner flex-shrink-0" style={{ backgroundColor: current[k] }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface">
                      {THEME_FIELDS[k].name} <span className="font-normal text-on-surface-variant">· {THEME_FIELDS[k].technicalName}</span>
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-mono">{current[k]}</span>
                      {!saved[k] && ' (default)'} — {THEME_FIELDS[k].description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <button type="button" onClick={() => setDesignerOpen(true)} className="btn-primary inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">palette</span>
              {hasCustomTheme ? 'Customize theme' : 'Create event theme'}
            </button>
          </div>
        </div>
      </div>

      {designerOpen && (
        <ThemeDesignerModal initialTheme={current} eventName={previewName} onClose={() => setDesignerOpen(false)} onApply={handleApply} />
      )}
    </div>
  );
}
