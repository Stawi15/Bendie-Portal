'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';

type ThemeForm = {
  theme_primary: string;
  theme_secondary: string;
  theme_tertiary: string;
};

const DEFAULTS = { theme_primary: '#3B82F6', theme_secondary: '#1D4ED8', theme_tertiary: '#DBEAFE' };

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant">
      <div className="flex items-center gap-3">
        <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent p-0 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-on-surface text-sm">{label}</p>
          <p className="text-xs text-on-surface-variant truncate">{hint}</p>
        </div>
        <div className="w-12 h-12 rounded-xl border border-outline-variant shadow-inner ml-auto flex-shrink-0" style={{ backgroundColor: value || '#ccc' }} />
      </div>
      <input className="input text-sm font-mono" value={value} onChange={e => onChange(e.target.value)} placeholder="#3B82F6" />
    </div>
  );
}

export default function ThemePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [form, setForm] = useState<ThemeForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    supabase.from('events').select('theme_primary,theme_secondary,theme_tertiary').eq('id', eventId).single().then(({ data, error }) => {
      if (error) toast.error('Failed to load');
      else if (data) setForm({
        theme_primary: data.theme_primary ?? DEFAULTS.theme_primary,
        theme_secondary: data.theme_secondary ?? DEFAULTS.theme_secondary,
        theme_tertiary: data.theme_tertiary ?? DEFAULTS.theme_tertiary,
      });
      setLoading(false);
    });
  }, [eventId]);

  const set = (field: keyof ThemeForm) => (v: string) => setForm(prev => ({ ...prev, [field]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('events').update({
      theme_primary: form.theme_primary || null,
      theme_secondary: form.theme_secondary || null,
      theme_tertiary: form.theme_tertiary || null,
    }).eq('id', eventId);
    if (error) toast.error(error.message);
    else toast.success('Theme colors saved');
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-96 bg-surface-container-low rounded-[20px]" />;

  return (
    <div>
      <div className="mb-6">
        <SectionHeader sectionKey="theme" />
      </div>

      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ColorField label="Primary Color" hint="Main brand color — buttons, highlights, CTAs" value={form.theme_primary} onChange={set('theme_primary')} />
          <ColorField label="Secondary Color" hint="Supporting brand color — hover states, accents" value={form.theme_secondary} onChange={set('theme_secondary')} />
          <ColorField label="Tertiary Color" hint="Background tints, badges, subtle fills" value={form.theme_tertiary} onChange={set('theme_tertiary')} />
        </div>

        {/* Live preview */}
        <div className="rounded-xl overflow-hidden border border-outline-variant grid grid-cols-1 lg:grid-cols-3">
          <div className="p-4 text-white text-sm font-semibold" style={{ backgroundColor: form.theme_primary }}>
            Primary — Buttons, nav highlights
          </div>
          <div className="p-4 text-white text-sm font-semibold" style={{ backgroundColor: form.theme_secondary }}>
            Secondary — Hover states, accents
          </div>
          <div className="p-4 text-sm font-semibold" style={{ backgroundColor: form.theme_tertiary }}>
            Tertiary — Background tints, badges
          </div>
        </div>

        <div className="pt-2 border-t border-outline-variant">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Colors'}
          </button>
        </div>
      </div>
    </div>
  );
}
