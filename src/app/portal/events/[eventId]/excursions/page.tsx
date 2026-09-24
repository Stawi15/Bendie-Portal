'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useEvent } from '@/contexts/EventContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import { ImageField } from '@/components/portal/ImageField';
import { AssetPickerModal } from '@/components/portal/AssetPickerModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import toast from 'react-hot-toast';

/**
 * Feature 016 CSV coverage expansion. `category` is a human-enterable label,
 * never a database ID (per the CSV design principle) — `beforeImport` below
 * resolves each row's label to an existing event-scoped category or creates
 * one, sequentially, BEFORE the per-row concurrent import starts, so two rows
 * naming the same brand-new category can never race each other into a
 * duplicate-key error. Global (`event_id IS NULL`) categories/excursions are
 * out of scope for CSV — bulk-imported rows always belong to this one event;
 * "apply to all events" remains a deliberate, one-at-a-time manual action.
 */
type ExcursionCsvRow = { category: string; title: string; description: string | null; image_url: string | null };

const EXCURSION_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'category', label: 'Category', required: true },
  { key: 'title', label: 'Title', required: true },
  { key: 'description', label: 'Description' },
  { key: 'imageUrl', label: 'Image URL' },
];

const EXCURSION_CSV_SAMPLES: Record<string, string>[] = [
  { category: 'Tours', title: 'Nairobi National Park Visit', description: 'Half-day game drive close to the city', imageUrl: '' },
  { category: 'Tours', title: 'City Cultural Tour', description: 'Guided walking tour of the historic quarter', imageUrl: '' },
];

function parseExcursionCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<ExcursionCsvRow> {
  const errors: string[] = [];
  const category = getField(raw, 'category');
  if (!category) errors.push('category is required');
  const title = getField(raw, 'title');
  if (!title) errors.push('title is required');

  const data: ExcursionCsvRow = {
    category,
    title,
    description: getField(raw, 'description') || null,
    image_url: getField(raw, 'imageUrl') || null,
  };

  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

type Category = {
  id: string;
  event_id: string | null;
  key: string;
  label: string;
  icon: string | null;
  display_order: number;
};

type Excursion = {
  id: string;
  event_id: string | null;
  category_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
};

type CategoryForm = { label: string; icon: string; is_global: boolean };
type ExcursionForm = { title: string; description: string; image_url: string; is_global: boolean };

const EMPTY_CATEGORY: CategoryForm = { label: '', icon: '', is_global: false };
const EMPTY_EXCURSION: ExcursionForm = { title: '', description: '', image_url: '', is_global: false };

function toKey(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export default function ExcursionsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { currentEvent } = useEvent();
  const confirm = useConfirm();

  const [categories, setCategories] = useState<Category[]>([]);
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY);

  const [editingExcursion, setEditingExcursion] = useState<Excursion | null>(null);
  const [showExcursionForm, setShowExcursionForm] = useState(false);
  const [excursionForm, setExcursionForm] = useState<ExcursionForm>(EMPTY_EXCURSION);

  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const csvCategoryMapRef = useRef<Map<string, string>>(new Map());

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('excursion_categories')
      .select('id,event_id,key,label,icon,display_order')
      .or(`event_id.eq.${eventId},event_id.is.null`)
      .order('display_order');
    if (error) toast.error('Failed to load categories');
    else setCategories(data ?? []);
    setLoading(false);
  };

  const fetchExcursions = async (categoryId: string) => {
    const { data, error } = await supabase
      .from('excursions')
      .select('id,event_id,category_id,title,description,image_url,display_order')
      .eq('category_id', categoryId)
      .or(`event_id.eq.${eventId},event_id.is.null`)
      .order('display_order');
    if (error) toast.error('Failed to load excursions');
    else setExcursions(data ?? []);
  };

  useEffect(() => { if (eventId) fetchCategories(); }, [eventId]);
  useEffect(() => { if (selectedCategory) fetchExcursions(selectedCategory.id); else setExcursions([]); }, [selectedCategory]);

  // ─── Categories ───────────────────────────────────────────────────────

  const openAddCategory = () => { setEditingCategory(null); setCategoryForm(EMPTY_CATEGORY); setShowCategoryForm(true); };
  const openEditCategory = (c: Category) => {
    setEditingCategory(c);
    setCategoryForm({ label: c.label, icon: c.icon ?? '', is_global: c.event_id === null });
    setShowCategoryForm(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.label.trim()) { toast.error('Label is required'); return; }
    setSaving(true);

    const payload = {
      label: categoryForm.label.trim(),
      icon: categoryForm.icon.trim() || null,
      event_id: categoryForm.is_global ? null : eventId,
    };

    if (editingCategory) {
      const { error } = await supabase.from('excursion_categories').update(payload).eq('id', editingCategory.id);
      if (error) toast.error(error.message);
      else { toast.success('Category updated'); setShowCategoryForm(false); fetchCategories(); }
    } else {
      const { error } = await supabase.from('excursion_categories').insert({
        ...payload, key: toKey(categoryForm.label), display_order: categories.length,
      });
      if (error) {
        toast.error(error.code === '23505' ? 'A category with this name already exists in this scope' : error.message);
      } else {
        toast.success('Category added'); setShowCategoryForm(false); fetchCategories();
      }
    }
    setSaving(false);
  };

  const handleDeleteCategory = async (c: Category) => {
    const { count } = await supabase.from('excursions').select('id', { count: 'exact', head: true }).eq('category_id', c.id);
    const message = count
      ? `Delete "${c.label}" and its ${count} excursion${count !== 1 ? 's' : ''}?`
      : `Delete "${c.label}"?`;
    if (!(await confirm({ message, confirmLabel: 'Delete', destructive: true }))) return;

    if (count) {
      const { error } = await supabase.from('excursions').delete().eq('category_id', c.id);
      if (error) { toast.error(error.message); return; }
    }
    const { error } = await supabase.from('excursion_categories').delete().eq('id', c.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Deleted');
      if (selectedCategory?.id === c.id) setSelectedCategory(null);
      fetchCategories();
    }
  };

  // ─── Excursions ───────────────────────────────────────────────────────

  const openAddExcursion = () => { setEditingExcursion(null); setExcursionForm(EMPTY_EXCURSION); setShowExcursionForm(true); };
  const openEditExcursion = (x: Excursion) => {
    setEditingExcursion(x);
    setExcursionForm({ title: x.title, description: x.description ?? '', image_url: x.image_url ?? '', is_global: x.event_id === null });
    setShowExcursionForm(true);
  };

  const handleSaveExcursion = async (keepOpen = false) => {
    if (!excursionForm.title.trim()) { toast.error('Title is required'); return; }
    if (!selectedCategory) return;
    setSaving(true);

    const payload = {
      title: excursionForm.title.trim(),
      description: excursionForm.description.trim() || null,
      image_url: excursionForm.image_url.trim() || null,
      event_id: excursionForm.is_global ? null : eventId,
    };

    // Feature 016 Data Entry UX pass — "Save & Add Another." The category is
    // already fixed context for this whole panel (not a form field here), so
    // it naturally carries over for free; only the excursion-specific fields
    // below are cleared for the next entry.
    const afterSuccess = () => {
      if (keepOpen && !editingExcursion) setExcursionForm(EMPTY_EXCURSION);
      else setShowExcursionForm(false);
      fetchExcursions(selectedCategory.id);
    };

    if (editingExcursion) {
      const { error } = await supabase.from('excursions').update(payload).eq('id', editingExcursion.id);
      if (error) toast.error(error.message);
      else { toast.success('Excursion updated'); afterSuccess(); }
    } else {
      const { error } = await supabase.from('excursions').insert({
        ...payload, category_id: selectedCategory.id, display_order: excursions.length,
      });
      if (error) toast.error(error.message);
      else { toast.success('Excursion added'); afterSuccess(); }
    }
    setSaving(false);
  };

  const handleDeleteExcursion = async (id: string, title: string) => {
    if (!(await confirm({ message: `Delete "${title}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('excursions').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); if (selectedCategory) fetchExcursions(selectedCategory.id); }
  };

  // Resolves every distinct category label in the batch to an event-scoped
  // category id BEFORE the concurrent per-row import starts (sequential, one
  // insert at a time) — avoids two rows racing to create the same brand-new
  // category and hitting the (event_id, key) unique constraint.
  const prepareExcursionImport = async (rows: ExcursionCsvRow[]) => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.label.trim().toLowerCase(), c.id);

    const distinctLabels = [...new Set(rows.map((r) => r.category.trim()))];
    for (const label of distinctLabels) {
      const key = label.toLowerCase();
      if (map.has(key)) continue;
      const { data, error } = await supabase
        .from('excursion_categories')
        .insert({ label, key: toKey(label), event_id: eventId, display_order: categories.length + map.size })
        .select('id')
        .single();
      if (error || !data) throw new Error(`Failed to create category "${label}": ${error?.message ?? 'unknown error'}`);
      map.set(key, data.id);
    }
    csvCategoryMapRef.current = map;
  };

  const importExcursionRow = async (row: ExcursionCsvRow) => {
    const categoryId = csvCategoryMapRef.current.get(row.category.trim().toLowerCase());
    if (!categoryId) return { error: `Category "${row.category}" could not be resolved` };
    const { error } = await supabase.from('excursions').insert({
      category_id: categoryId,
      title: row.title,
      description: row.description,
      image_url: row.image_url,
      event_id: eventId,
      display_order: 0,
    });
    return { error: error?.message };
  };

  const handleExcursionCsvImported = () => {
    fetchCategories();
    if (selectedCategory) fetchExcursions(selectedCategory.id);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="excursions" desc={`${categories.length} categor${categories.length !== 1 ? 'ies' : 'y'}`} />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setCsvOpen(true)} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import CSV
          </button>
          <button onClick={openAddCategory} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> New Category
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Categories list */}
        <div className="lg:col-span-1">
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Categories</h3>
          {loading ? (
            <div className="animate-pulse space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-surface-container-low rounded-xl" />)}</div>
          ) : categories.length === 0 ? (
            <p className="text-sm text-on-surface-variant/70 italic">No categories yet.</p>
          ) : (
            <div className="space-y-2">
              {categories.map(c => (
                <div key={c.id} onClick={() => setSelectedCategory(c)} className={`cursor-pointer rounded-[20px] p-3 border transition ${selectedCategory?.id === c.id ? 'border-primary bg-primary/5' : 'border-[#E4EAF0] bg-white panel-shadow hover:border-primary/30'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm text-on-surface truncate flex items-center gap-1.5">
                      {c.icon && <span>{c.icon}</span>} {c.label}
                    </p>
                    {c.event_id === null && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant flex-shrink-0">Global</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={e => { e.stopPropagation(); openEditCategory(c); }} className="text-xs text-primary hover:opacity-80">Edit</button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteCategory(c); }} className="text-xs text-error hover:opacity-80">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Excursions panel */}
        <div className="lg:col-span-2">
          {!selectedCategory ? (
            <div className="flex items-center justify-center h-64 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow text-on-surface-variant text-sm">Select a category to manage its excursions</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  {selectedCategory.label} — {excursions.length} excursion{excursions.length !== 1 ? 's' : ''}
                </h3>
                <button onClick={openAddExcursion} className="btn-primary text-xs py-1.5">
                  <span className="material-symbols-outlined text-[16px]">add</span> Add Excursion
                </button>
              </div>

              {excursions.length === 0 ? (
                <p className="text-sm text-on-surface-variant/70 italic">No excursions in this category yet. Add one manually, or use Import CSV above to paste rows or upload a file.</p>
              ) : (
                <div className="space-y-2">
                  {excursions.map(x => (
                    <div key={x.id} className="flex items-center gap-3 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4">
                      {x.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={x.image_url} alt={x.title} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-on-surface-variant/50">landscape</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-on-surface truncate">{x.title}</p>
                          {x.event_id === null && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant flex-shrink-0">Global</span>
                          )}
                        </div>
                        {x.description && <p className="text-xs text-on-surface-variant/70 truncate">{x.description}</p>}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => openEditExcursion(x)} className="text-xs text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5">Edit</button>
                        <button onClick={() => handleDeleteExcursion(x.id, x.title)} className="text-xs text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Category form modal */}
      <FormModal open={showCategoryForm} onClose={() => setShowCategoryForm(false)} title={editingCategory ? 'Edit Category' : 'New Category'} maxWidthClassName="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="label">Label *</label>
            <input className="input" value={categoryForm.label} onChange={e => setCategoryForm(p => ({ ...p, label: e.target.value }))} placeholder="Restaurants" />
          </div>
          <div>
            <label className="label">Icon</label>
            <input className="input" value={categoryForm.icon} onChange={e => setCategoryForm(p => ({ ...p, icon: e.target.value }))} placeholder="🍽️ or an Ionicons name" />
            <p className="hint">Emoji or Ionicons name, shown next to the tab label in-app</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={categoryForm.is_global} onChange={e => setCategoryForm(p => ({ ...p, is_global: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
            <span className="text-sm font-medium text-on-surface">Apply to all events</span>
          </label>
        </div>
        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
          <button onClick={handleSaveCategory} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editingCategory ? 'Update' : 'Add Category'}</button>
          <button onClick={() => setShowCategoryForm(false)} className="btn-secondary">Cancel</button>
        </div>
      </FormModal>

      {/* Excursion form modal */}
      <FormModal open={showExcursionForm} onClose={() => setShowExcursionForm(false)} title={editingExcursion ? 'Edit Excursion' : 'New Excursion'} maxWidthClassName="max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={excursionForm.title} onChange={e => setExcursionForm(p => ({ ...p, title: e.target.value }))} placeholder="Cape Point Day Trip" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input h-20 resize-none" value={excursionForm.description} onChange={e => setExcursionForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the excursion..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
          </div>
          <ImageField
            label="Image"
            value={excursionForm.image_url}
            onChange={(url) => setExcursionForm(p => ({ ...p, image_url: url }))}
            onBrowse={currentEvent?.organization_id ? () => setPickerOpen(true) : undefined}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={excursionForm.is_global} onChange={e => setExcursionForm(p => ({ ...p, is_global: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
            <span className="text-sm font-medium text-on-surface">Apply to all events</span>
          </label>
        </div>
        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant flex-wrap">
          <button onClick={() => handleSaveExcursion(false)} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editingExcursion ? 'Update' : 'Add Excursion'}</button>
          {!editingExcursion && (
            <button onClick={() => handleSaveExcursion(true)} disabled={saving} className="btn-secondary">
              {saving ? 'Saving...' : 'Save & Add Another'}
            </button>
          )}
          <button onClick={() => setShowExcursionForm(false)} className="btn-secondary">Cancel</button>
        </div>
      </FormModal>

      {currentEvent?.organization_id && (
        <AssetPickerModal
          open={pickerOpen}
          organizationId={currentEvent.organization_id}
          onClose={() => setPickerOpen(false)}
          onSelect={(url) => setExcursionForm(p => ({ ...p, image_url: url }))}
        />
      )}

      <CsvImportModal<ExcursionCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={handleExcursionCsvImported}
        title="Import Excursions"
        templateFilename="excursions-template.csv"
        columns={EXCURSION_CSV_COLUMNS}
        sampleRows={EXCURSION_CSV_SAMPLES}
        parseRow={parseExcursionCsvRow}
        importRow={importExcursionRow}
        beforeImport={prepareExcursionImport}
      />
    </div>
  );
}
