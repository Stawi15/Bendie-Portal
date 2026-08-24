'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import { ImageField } from '@/components/portal/ImageField';
import { AssetPickerModal } from '@/components/portal/AssetPickerModal';
import toast from 'react-hot-toast';

type EventPhoto = {
  id: string;
  image_url: string;
  caption: string | null;
  is_featured: boolean;
  display_order: number;
};

type PhotoForm = {
  image_url: string;
  caption: string;
  is_featured: boolean;
  display_order: string;
};

const EMPTY_FORM: PhotoForm = { image_url: '', caption: '', is_featured: false, display_order: '0' };

export default function EventPhotosPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const { currentEvent } = useEvent();
  const confirm = useConfirm();
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EventPhoto | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PhotoForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('event_photos')
      .select('id,image_url,caption,is_featured,display_order')
      .eq('event_id', eventId)
      .order('display_order');
    if (error) toast.error('Failed to load photos');
    else setPhotos(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, display_order: photos.length.toString() });
    setShowForm(true);
  };

  const openEdit = (p: EventPhoto) => {
    setEditing(p);
    setForm({
      image_url: p.image_url, caption: p.caption ?? '',
      is_featured: p.is_featured, display_order: p.display_order.toString(),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.image_url.trim()) { toast.error('An image is required'); return; }
    setSaving(true);

    const payload = {
      image_url: form.image_url.trim(),
      caption: form.caption.trim() || null,
      is_featured: form.is_featured,
      display_order: parseInt(form.display_order) || 0,
    };

    if (editing) {
      const { error } = await supabase.from('event_photos').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message);
      else { toast.success('Photo updated'); setShowForm(false); fetchData(); }
    } else {
      const { error } = await supabase.from('event_photos').insert({
        ...payload, event_id: eventId, uploaded_by: user?.id ?? null,
      });
      if (error) toast.error(error.message);
      else { toast.success('Photo added'); setShowForm(false); fetchData(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Delete this photo?', confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('event_photos').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const toggleFeatured = async (p: EventPhoto) => {
    const { error } = await supabase.from('event_photos').update({ is_featured: !p.is_featured }).eq('id', p.id);
    if (error) toast.error(error.message);
    else fetchData();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="event-photos" desc={`${photos.length} photo${photos.length !== 1 ? 's' : ''} curated for this event`} />
        <button onClick={openAdd} className="btn-primary flex-shrink-0">
          <span className="material-symbols-outlined text-[18px]">add</span> Add Photo
        </button>
      </div>

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Photo' : 'New Photo'} maxWidthClassName="max-w-lg">
          <div className="space-y-4">
            <ImageField
              label="Image *"
              hint="Uploads to the organisation's shared asset library"
              value={form.image_url}
              onChange={(url) => setForm(p => ({ ...p, image_url: url }))}
              onBrowse={currentEvent?.organization_id ? () => setPickerOpen(true) : undefined}
            />
            <div>
              <label className="label">Caption</label>
              <input className="input" value={form.caption} onChange={e => setForm(p => ({ ...p, caption: e.target.value }))} placeholder="Sunset over the main stage" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Display Order</label>
                <input type="number" className="input" value={form.display_order} onChange={e => setForm(p => ({ ...p, display_order: e.target.value }))} min={0} />
              </div>
              <div className="flex items-end pb-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_featured} onChange={e => setForm(p => ({ ...p, is_featured: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
                  <span className="text-sm font-medium text-on-surface">Featured</span>
                </label>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add Photo'}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
      </FormModal>

      {currentEvent?.organization_id && (
        <AssetPickerModal
          open={pickerOpen}
          organizationId={currentEvent.organization_id}
          onClose={() => setPickerOpen(false)}
          onSelect={(url) => setForm(p => ({ ...p, image_url: url }))}
        />
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">{[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : photos.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">add_photo_alternate</p>
          <p className="text-on-surface-variant">No photos yet. Add the first one to get this event&apos;s gallery started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map(p => (
            <div key={p.id} className="group relative bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image_url} alt={p.caption ?? ''} className="w-full h-40 object-cover" onError={e => { (e.target as HTMLImageElement).alt = 'Failed to load'; }} />
              {p.is_featured && (
                <div className="absolute top-2 left-2 bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[14px]">star</span> Featured
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 sm:group-hover:bg-black/40 transition-all flex items-end justify-between opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2">
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="text-xs bg-white text-on-surface px-2 py-1 rounded-lg font-medium hover:bg-surface-container-low transition">Edit</button>
                  <button onClick={() => toggleFeatured(p)} className="text-xs bg-white text-on-surface px-2 py-1 rounded-lg font-medium hover:bg-surface-container-low transition">
                    {p.is_featured ? 'Unfeature' : 'Feature'}
                  </button>
                </div>
                <button onClick={() => handleDelete(p.id)} className="text-xs bg-error text-white px-2 py-1 rounded-lg font-medium hover:opacity-90 transition">Delete</button>
              </div>
              {p.caption && (
                <div className="px-3 py-2">
                  <p className="text-xs text-on-surface-variant truncate">{p.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
