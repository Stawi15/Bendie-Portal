'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useEvent } from '@/contexts/EventContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import { ImageField } from '@/components/portal/ImageField';
import { AssetPickerModal } from '@/components/portal/AssetPickerModal';
import { moveItem } from '@/lib/reorder';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, parseFlexibleBoolean, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import toast from 'react-hot-toast';

/**
 * Feature 016 CSV coverage expansion. Hero/gallery images are deliberately
 * excluded from this CSV (documented limitation): unlike the other four
 * modules' single flat `image_url` column, an activity's images live in a
 * separate `activity_images` child table with a hero/gallery split, and
 * bringing that relational shape into a flat CSV row would meaningfully
 * complicate the format for a secondary field. Use the Asset Picker in the
 * activity's own edit form to add images after import.
 */
type ActivityCsvRow = { title: string; description: string | null; location: string | null; rating: number | null; is_featured: boolean };

const ACTIVITY_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'title', label: 'Title', required: true },
  { key: 'description', label: 'Description' },
  { key: 'location', label: 'Location' },
  { key: 'rating', label: 'Rating (0-5)' },
  { key: 'isFeatured', label: 'Featured (true/false)' },
];

const ACTIVITY_CSV_SAMPLES: Record<string, string>[] = [
  { title: 'Sunrise Yoga', description: 'Guided yoga session overlooking the lake', location: 'Poolside Deck', rating: '4.5', isFeatured: 'true' },
  { title: 'Evening Bonfire', description: 'Casual networking around the fire pit', location: 'Main Lawn', rating: '', isFeatured: 'false' },
];

function parseActivityCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<ActivityCsvRow> {
  const errors: string[] = [];
  const title = getField(raw, 'title');
  if (!title) errors.push('title is required');

  const ratingRaw = getField(raw, 'rating');
  let rating: number | null = null;
  if (ratingRaw) {
    const parsed = parseFloat(ratingRaw);
    if (isNaN(parsed) || parsed < 0 || parsed > 5) errors.push('rating must be a number between 0 and 5');
    else rating = parsed;
  }

  const featuredRaw = parseFlexibleBoolean(getField(raw, 'isFeatured'));
  if (!featuredRaw.ok) errors.push('isFeatured must be true or false');

  const data: ActivityCsvRow = {
    title,
    description: getField(raw, 'description') || null,
    location: getField(raw, 'location') || null,
    rating,
    is_featured: featuredRaw.ok ? featuredRaw.value ?? false : false,
  };

  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

type Activity = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  rating: number | null;
  is_featured: boolean;
  display_order: number;
  slug: string | null;
};

type ActivityForm = {
  title: string;
  description: string;
  location: string;
  rating: string;
  is_featured: boolean;
  display_order: string;
};

const EMPTY_FORM: ActivityForm = {
  title: '', description: '', location: '', rating: '', is_featured: false, display_order: '0',
};

type ActivityImageRow = {
  key: string; // stable React key — equals dbId when loaded from DB, generated for new rows
  dbId: string | null; // activity_images.id — null until saved
  image_url: string;
  alt_text: string;
};

const EMPTY_HERO: ActivityImageRow = { key: 'hero', dbId: null, image_url: '', alt_text: '' };

export default function ActivitiesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const { currentEvent } = useEvent();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ActivityForm>(EMPTY_FORM);
  const [heroImage, setHeroImage] = useState<ActivityImageRow>(EMPTY_HERO);
  const [galleryImages, setGalleryImages] = useState<ActivityImageRow[]>([]);
  const [originalImageIds, setOriginalImageIds] = useState<Set<string>>(new Set());
  const [pickerTarget, setPickerTarget] = useState<string | null>(null); // 'hero' or a gallery row's key
  const [saving, setSaving] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('id,title,description,location,rating,is_featured,display_order,slug')
      .eq('event_id', eventId)
      .order('display_order');
    if (error) toast.error('Failed to load activities');
    else setActivities(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, display_order: activities.length.toString() });
    setHeroImage(EMPTY_HERO);
    setGalleryImages([]);
    setOriginalImageIds(new Set());
    setShowForm(true);
  };

  /** Feature 016 Data Entry UX pass — opens a NEW, unsaved, prefilled record; never writes to the database until the user presses Save (item 7). Images are deliberately never copied — they're separate rows tied to a specific activity_id, and system-generated state (id, slug, display_order) is never carried over either. */
  const openDuplicate = (a: Activity) => {
    setEditing(null);
    setForm({
      title: `${a.title} (Copy)`, description: a.description ?? '', location: a.location ?? '',
      rating: a.rating != null ? a.rating.toString() : '', is_featured: a.is_featured, display_order: activities.length.toString(),
    });
    setHeroImage(EMPTY_HERO);
    setGalleryImages([]);
    setOriginalImageIds(new Set());
    setShowForm(true);
  };

  const openEdit = async (a: Activity) => {
    setEditing(a);
    setForm({
      title: a.title, description: a.description ?? '',
      location: a.location ?? '', rating: a.rating != null ? a.rating.toString() : '',
      is_featured: a.is_featured, display_order: a.display_order.toString(),
    });
    setHeroImage(EMPTY_HERO);
    setGalleryImages([]);
    setOriginalImageIds(new Set());
    setShowForm(true);

    const { data, error } = await supabase
      .from('activity_images')
      .select('id,image_url,image_type,alt_text,display_order')
      .eq('activity_id', a.id)
      .order('display_order');
    if (error) { toast.error('Failed to load images'); return; }

    const rows = data ?? [];
    const hero = rows.find(r => r.image_type === 'hero');
    const gallery = rows.filter(r => r.image_type === 'gallery');

    if (hero) setHeroImage({ key: hero.id, dbId: hero.id, image_url: hero.image_url, alt_text: hero.alt_text ?? '' });
    setGalleryImages(gallery.map(r => ({ key: r.id, dbId: r.id, image_url: r.image_url, alt_text: r.alt_text ?? '' })));
    setOriginalImageIds(new Set(rows.map(r => r.id)));
  };

  const set = (field: keyof ActivityForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  // Gallery image handlers
  const addGalleryImage = () =>
    setGalleryImages(prev => [...prev, { key: crypto.randomUUID(), dbId: null, image_url: '', alt_text: '' }]);
  const removeGalleryImage = (key: string) => setGalleryImages(prev => prev.filter(r => r.key !== key));
  const moveGalleryImage = (key: string, direction: 'up' | 'down') =>
    setGalleryImages(prev => moveItem(prev, prev.findIndex(r => r.key === key), direction));
  const setGalleryUrl = (key: string, url: string) =>
    setGalleryImages(prev => prev.map(r => (r.key === key ? { ...r, image_url: url } : r)));
  const setGalleryAlt = (key: string, alt: string) =>
    setGalleryImages(prev => prev.map(r => (r.key === key ? { ...r, alt_text: alt } : r)));

  const handleAssetSelected = (url: string) => {
    if (!pickerTarget) return;
    if (pickerTarget === 'hero') setHeroImage(prev => ({ ...prev, image_url: url }));
    else setGalleryUrl(pickerTarget, url);
  };

  const handleSave = async (keepOpen = false) => {
    if (!form.title) { toast.error('Title is required'); return; }
    setSaving(true);

    const slug = form.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const payload = {
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      rating: form.rating ? parseFloat(form.rating) : null,
      is_featured: form.is_featured,
      display_order: parseInt(form.display_order) || 0,
    };

    let activityId: string | null = editing?.id ?? null;

    if (editing) {
      const { error } = await supabase.from('activities').update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('activities').insert({ ...payload, event_id: eventId, slug }).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      activityId = data.id;
    }

    if (activityId) {
      const currentIds = new Set<string>([
        ...(heroImage.image_url.trim() && heroImage.dbId ? [heroImage.dbId] : []),
        ...galleryImages.filter(r => r.dbId).map(r => r.dbId as string),
      ]);
      const toDelete = [...originalImageIds].filter(id => !currentIds.has(id));
      if (toDelete.length > 0) {
        const { error } = await supabase.from('activity_images').delete().in('id', toDelete);
        if (error) toast.error(`Failed to remove some images: ${error.message}`);
      }

      if (heroImage.image_url.trim()) {
        if (heroImage.dbId) {
          const { error } = await supabase.from('activity_images')
            .update({ image_url: heroImage.image_url, alt_text: heroImage.alt_text || null }).eq('id', heroImage.dbId);
          if (error) toast.error(`Failed to update hero image: ${error.message}`);
        } else {
          const { error } = await supabase.from('activity_images').insert({
            activity_id: activityId, image_url: heroImage.image_url, alt_text: heroImage.alt_text || null,
            image_type: 'hero', display_order: 0,
          });
          if (error) toast.error(`Failed to add hero image: ${error.message}`);
        }
      }

      for (let i = 0; i < galleryImages.length; i++) {
        const img = galleryImages[i];
        if (!img.image_url.trim()) continue;
        if (img.dbId) {
          const { error } = await supabase.from('activity_images')
            .update({ image_url: img.image_url, alt_text: img.alt_text || null, display_order: i }).eq('id', img.dbId);
          if (error) toast.error(`Failed to update a gallery image: ${error.message}`);
        } else {
          const { error } = await supabase.from('activity_images').insert({
            activity_id: activityId, image_url: img.image_url, alt_text: img.alt_text || null,
            image_type: 'gallery', display_order: i,
          });
          if (error) toast.error(`Failed to add a gallery image: ${error.message}`);
        }
      }
    }

    toast.success(editing ? 'Activity updated' : 'Activity added');
    // Feature 016 Data Entry UX pass — "Save & Add Another" (create-only, never
    // reachable while editing, matching PlannerTaskModal's own gating).
    // Retains `location` — the field most likely to be identical across a
    // batch of activities entered back-to-back (e.g. several sessions at the
    // same venue) — and clears everything title/description/rating/featured-
    // specific, plus any hero/gallery image state, since those are
    // per-activity by nature.
    if (keepOpen && !editing) {
      setForm({ ...EMPTY_FORM, location: form.location, display_order: (activities.length + 1).toString() });
      setHeroImage(EMPTY_HERO);
      setGalleryImages([]);
      setOriginalImageIds(new Set());
    } else {
      setShowForm(false);
    }
    fetchData();
    setSaving(false);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!(await confirm({ message: `Delete "${title}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const toggleFeatured = async (a: Activity) => {
    const { error } = await supabase.from('activities').update({ is_featured: !a.is_featured }).eq('id', a.id);
    if (error) toast.error(error.message);
    else fetchData();
  };

  const importActivityRow = async (row: ActivityCsvRow) => {
    const { error } = await supabase.from('activities').insert({
      ...row,
      event_id: eventId,
      slug: row.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      display_order: activities.length,
    });
    return { error: error?.message };
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="activities" desc={`${activities.length} activit${activities.length !== 1 ? 'ies' : 'y'}`} />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setCsvOpen(true)} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import CSV
          </button>
          <button onClick={openAdd} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> Add Activity
          </button>
        </div>
      </div>

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Activity' : 'New Activity'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Title *</label>
              <input className="input" value={form.title} onChange={set('title')} placeholder="Morning Run" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea className="input h-20 resize-none" value={form.description} onChange={set('description')} placeholder="Describe the activity..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.location} onChange={set('location')} placeholder="Hotel Lobby" />
            </div>
            <div>
              <label className="label">Rating</label>
              <input type="number" className="input" value={form.rating} onChange={set('rating')} placeholder="4.5" min={0} max={5} step={0.5} />
              <p className="hint">0–5 stars</p>
            </div>
            <div>
              <label className="label">Display Order</label>
              <input type="number" className="input" value={form.display_order} onChange={set('display_order')} min={0} />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_featured} onChange={e => setForm(p => ({ ...p, is_featured: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
                <span className="text-sm font-medium text-on-surface">Featured Activity</span>
              </label>
            </div>
          </div>

          {/* Hero image */}
          <div className="border-t border-outline-variant mt-4 pt-4">
            <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-3">Hero Image</h3>
            <ImageField
              label=""
              hint="Main image for this activity's detail page"
              value={heroImage.image_url}
              onChange={(url) => setHeroImage(prev => ({ ...prev, image_url: url }))}
              onBrowse={currentEvent?.organization_id ? () => setPickerTarget('hero') : undefined}
            />
            {heroImage.image_url && (
              <input
                className="input text-sm mt-2"
                value={heroImage.alt_text}
                onChange={e => setHeroImage(prev => ({ ...prev, alt_text: e.target.value }))}
                placeholder="Alt text (for accessibility)"
              />
            )}
          </div>

          {/* Gallery images */}
          <div className="border-t border-outline-variant mt-4 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide">Gallery Images</h3>
              <button type="button" onClick={addGalleryImage} className="btn-secondary text-xs py-1.5">
                <span className="material-symbols-outlined text-[16px]">add</span> Add Image
              </button>
            </div>
            {galleryImages.length === 0 ? (
              <p className="text-sm text-on-surface-variant/70 italic">No gallery images yet.</p>
            ) : (
              <div className="space-y-3">
                {galleryImages.map((img, i) => (
                  <div key={img.key} className="flex gap-3 bg-surface-container-low rounded-xl p-3">
                    <div className="flex-1 space-y-2">
                      <ImageField
                        label=""
                        value={img.image_url}
                        onChange={(url) => setGalleryUrl(img.key, url)}
                        onBrowse={currentEvent?.organization_id ? () => setPickerTarget(img.key) : undefined}
                        compact
                      />
                      <input
                        className="input text-sm"
                        value={img.alt_text}
                        onChange={e => setGalleryAlt(img.key, e.target.value)}
                        placeholder="Alt text (for accessibility)"
                      />
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button type="button" onClick={() => moveGalleryImage(img.key, 'up')} disabled={i === 0} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                        <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                      </button>
                      <button type="button" onClick={() => moveGalleryImage(img.key, 'down')} disabled={i === galleryImages.length - 1} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                        <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                      </button>
                      <button type="button" onClick={() => removeGalleryImage(img.key)} className="p-1 rounded text-on-surface-variant hover:text-error">
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant flex-wrap">
            <button onClick={() => handleSave(false)} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add Activity'}</button>
            {!editing && (
              <button onClick={() => handleSave(true)} disabled={saving} className="btn-secondary">
                {saving ? 'Saving...' : 'Save & Add Another'}
              </button>
            )}
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
      </FormModal>

      {currentEvent?.organization_id && (
        <AssetPickerModal
          open={pickerTarget !== null}
          organizationId={currentEvent.organization_id}
          onClose={() => setPickerTarget(null)}
          onSelect={handleAssetSelected}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">bolt</p>
          <p className="text-on-surface-variant">No activities yet.</p>
          <p className="text-on-surface-variant/70 text-sm mt-1">Add one manually, paste from a spreadsheet, or import a CSV.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {activities.map(a => (
            <div key={a.id} onClick={() => openEdit(a)} className="flex items-center gap-4 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4 hover:border-primary/30 transition cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-semibold text-on-surface truncate min-w-0">{a.title}</p>
                  {a.is_featured && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 inline-flex items-center gap-0.5 flex-shrink-0">
                      <span className="material-symbols-outlined text-[14px]">star</span> Featured
                    </span>
                  )}
                </div>
                {a.location && (
                  <p className="text-sm text-on-surface-variant mt-0.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">location_on</span> {a.location}
                  </p>
                )}
                {a.rating !== null && a.rating > 0 && <p className="text-xs text-on-surface-variant/70">Rating: {a.rating}/5</p>}
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button onClick={(e) => { e.stopPropagation(); toggleFeatured(a); }} title={a.is_featured ? 'Unfeature' : 'Feature'} className={`text-xs px-2 py-1 rounded-lg font-medium transition ${a.is_featured ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}>
                  <span className="hidden sm:inline">{a.is_featured ? 'Unfeature' : 'Feature'}</span>
                  <span className="material-symbols-outlined text-[16px] sm:hidden">star</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); openEdit(a); }} title="Edit" className="text-sm text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5 transition">
                  <span className="hidden sm:inline">Edit</span>
                  <span className="material-symbols-outlined text-[16px] sm:hidden">edit</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); openDuplicate(a); }} title="Duplicate" className="text-sm text-on-surface-variant hover:text-primary font-medium px-2 py-1 rounded-lg hover:bg-primary/5 transition">
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(a.id, a.title); }} title="Delete" className="text-sm text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5 transition">
                  <span className="hidden sm:inline">Delete</span>
                  <span className="material-symbols-outlined text-[16px] sm:hidden">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CsvImportModal<ActivityCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetchData}
        title="Import Activities"
        templateFilename="activities-template.csv"
        columns={ACTIVITY_CSV_COLUMNS}
        sampleRows={ACTIVITY_CSV_SAMPLES}
        parseRow={parseActivityCsvRow}
        importRow={importActivityRow}
      />
    </div>
  );
}
