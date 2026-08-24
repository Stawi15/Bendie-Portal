'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';

type TerminologyForm = {
  facilitator_label_singular: string;
  facilitator_label_plural: string;
  category_label: string;
  theme_label: string;
  theme_icon: string;
  feedback_form_url: string;
};

const EMPTY: TerminologyForm = {
  facilitator_label_singular: '',
  facilitator_label_plural: '',
  category_label: '',
  theme_label: '',
  theme_icon: '',
  feedback_form_url: '',
};

function Field({ label, hint, value, onChange, placeholder }: { label: string; hint: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      <p className="hint">{hint}</p>
    </div>
  );
}

export default function TerminologyPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [form, setForm] = useState<TerminologyForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    supabase.from('events')
      .select('facilitator_label_singular,facilitator_label_plural,category_label,theme_label,theme_icon,feedback_form_url')
      .eq('id', eventId).single()
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load');
        else if (data) setForm({
          facilitator_label_singular: data.facilitator_label_singular ?? '',
          facilitator_label_plural: data.facilitator_label_plural ?? '',
          category_label: data.category_label ?? '',
          theme_label: data.theme_label ?? '',
          theme_icon: data.theme_icon ?? '',
          feedback_form_url: data.feedback_form_url ?? '',
        });
        setLoading(false);
      });
  }, [eventId]);

  const set = (field: keyof TerminologyForm) => (v: string) => setForm(prev => ({ ...prev, [field]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('events').update({
      facilitator_label_singular: form.facilitator_label_singular || null,
      facilitator_label_plural: form.facilitator_label_plural || null,
      category_label: form.category_label || null,
      theme_label: form.theme_label || null,
      theme_icon: form.theme_icon || null,
      feedback_form_url: form.feedback_form_url || null,
    }).eq('id', eventId);
    if (error) toast.error(error.message);
    else toast.success('Terminology saved');
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-96 bg-surface-container-low rounded-[20px]" />;

  return (
    <div>
      <div className="mb-6">
        <SectionHeader sectionKey="terminology" />
      </div>

      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 space-y-6">
        <div>
          <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-4">Facilitator Labels</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Singular Label" hint='e.g. "Speaker", "Coach", "Mentor"' value={form.facilitator_label_singular} onChange={set('facilitator_label_singular')} placeholder="Facilitator" />
            <Field label="Plural Label" hint='e.g. "Speakers", "Coaches", "Mentors"' value={form.facilitator_label_plural} onChange={set('facilitator_label_plural')} placeholder="Facilitators" />
          </div>
        </div>

        <div className="border-t border-outline-variant pt-6">
          <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-4">Event Classification</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Category Label" hint='Shown as event category tag, e.g. "Innovation Summit"' value={form.category_label} onChange={set('category_label')} placeholder="Technology" />
            <Field label="Theme Label" hint='Short theme descriptor, e.g. "Future Forward"' value={form.theme_label} onChange={set('theme_label')} placeholder="Innovation" />
            <Field label="Theme Icon" hint='Emoji or icon representing the theme, e.g. "🚀"' value={form.theme_icon} onChange={set('theme_icon')} placeholder="🚀" />
          </div>
        </div>

        <div className="border-t border-outline-variant pt-6">
          <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-4">External Links</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Feedback Form URL" hint="External survey or feedback form link shown to attendees after the event" value={form.feedback_form_url} onChange={set('feedback_form_url')} placeholder="https://forms.example.com/feedback" />
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
