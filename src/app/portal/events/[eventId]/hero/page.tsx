'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { AssetPickerModal } from '@/components/portal/AssetPickerModal';
import { ImageField } from '@/components/portal/ImageField';
import toast from 'react-hot-toast';

type HeroForm = {
  hero_title: string;
  hero_description: string;
  hero_image_url: string;
  image_url: string;
  profile_banner_image_url: string;
  gallery_background: string;
  gallery_external_url: string;
};

const EMPTY: HeroForm = {
  hero_title: '', hero_description: '', hero_image_url: '',
  image_url: '', profile_banner_image_url: '', gallery_background: '',
  gallery_external_url: '',
};

export default function HeroPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [form, setForm] = useState<HeroForm>(EMPTY);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerField, setPickerField] = useState<keyof HeroForm | null>(null);

  useEffect(() => {
    if (!eventId) return;
    supabase.from('events').select('organization_id,hero_title,hero_description,hero_image_url,image_url,profile_banner_image_url,gallery_background,gallery_external_url').eq('id', eventId).single().then(({ data, error }) => {
      if (error) toast.error('Failed to load');
      else if (data) {
        setOrganizationId(data.organization_id ?? null);
        setForm({
          hero_title: data.hero_title ?? '',
          hero_description: data.hero_description ?? '',
          hero_image_url: data.hero_image_url ?? '',
          image_url: data.image_url ?? '',
          profile_banner_image_url: data.profile_banner_image_url ?? '',
          gallery_background: data.gallery_background ?? '',
          gallery_external_url: data.gallery_external_url ?? '',
        });
      }
      setLoading(false);
    });
  }, [eventId]);

  const set = (field: keyof HeroForm) => (v: string) => setForm(prev => ({ ...prev, [field]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('events').update({
      hero_title: form.hero_title || null,
      hero_description: form.hero_description || null,
      hero_image_url: form.hero_image_url || null,
      image_url: form.image_url || null,
      profile_banner_image_url: form.profile_banner_image_url || null,
      gallery_background: form.gallery_background || null,
      gallery_external_url: form.gallery_external_url || null,
    }).eq('id', eventId);
    if (error) toast.error(error.message);
    else toast.success('Hero & Branding saved');
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-96 bg-surface-container-low rounded-[20px]" />;

  return (
    <div>
      <div className="mb-6">
        <SectionHeader sectionKey="hero" />
      </div>

      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="lg:col-span-2 min-w-0">
            <label className="label">Hero Title</label>
            <input className="input" value={form.hero_title} onChange={e => set('hero_title')(e.target.value)} placeholder="Welcome to Tech Summit 2026" />
          </div>

          <div className="lg:col-span-2 min-w-0">
            <label className="label">Hero Description</label>
            <textarea className="input h-20 resize-none" value={form.hero_description} onChange={e => set('hero_description')(e.target.value)} placeholder="Three days of insights, innovation, and connection." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
          </div>

          <ImageField label="Hero Image URL" hint="Main event banner image (landscape, min 1200px wide)" value={form.hero_image_url} onChange={set('hero_image_url')} onBrowse={() => setPickerField('hero_image_url')} />
          <ImageField label="Event Card Image URL" hint="Thumbnail shown on event listing cards" value={form.image_url} onChange={set('image_url')} onBrowse={() => setPickerField('image_url')} />
          <ImageField label="Profile Banner Image URL" hint="Banner shown on attendee profile pages for this event" value={form.profile_banner_image_url} onChange={set('profile_banner_image_url')} onBrowse={() => setPickerField('profile_banner_image_url')} />
          <ImageField label="Gallery Background Image URL" hint="Background image for the photo gallery screen" value={form.gallery_background} onChange={set('gallery_background')} onBrowse={() => setPickerField('gallery_background')} />

          <div className="lg:col-span-2 min-w-0">
            <label className="label">External Gallery URL</label>
            <input className="input" value={form.gallery_external_url} onChange={e => set('gallery_external_url')(e.target.value)} placeholder="https://photos.example.com/event" />
            <p className="hint">Optional: link to an external photo album (Google Photos, Flickr, etc.)</p>
          </div>
        </div>

        <div className="pt-2 border-t border-outline-variant">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {organizationId && pickerField && (
        <AssetPickerModal
          open
          organizationId={organizationId}
          onClose={() => setPickerField(null)}
          onSelect={(url) => set(pickerField)(url)}
        />
      )}
    </div>
  );
}
