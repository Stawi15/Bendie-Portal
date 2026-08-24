'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useEvent } from '@/contexts/EventContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import { ImageField } from '@/components/portal/ImageField';
import { AssetPickerModal } from '@/components/portal/AssetPickerModal';
import toast from 'react-hot-toast';

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

  const handleSaveExcursion = async () => {
    if (!excursionForm.title.trim()) { toast.error('Title is required'); return; }
    if (!selectedCategory) return;
    setSaving(true);

    const payload = {
      title: excursionForm.title.trim(),
      description: excursionForm.description.trim() || null,
      image_url: excursionForm.image_url.trim() || null,
      event_id: excursionForm.is_global ? null : eventId,
    };

    if (editingExcursion) {
      const { error } = await supabase.from('excursions').update(payload).eq('id', editingExcursion.id);
      if (error) toast.error(error.message);
      else { toast.success('Excursion updated'); setShowExcursionForm(false); fetchExcursions(selectedCategory.id); }
    } else {
      const { error } = await supabase.from('excursions').insert({
        ...payload, category_id: selectedCategory.id, display_order: excursions.length,
      });
      if (error) toast.error(error.message);
      else { toast.success('Excursion added'); setShowExcursionForm(false); fetchExcursions(selectedCategory.id); }
    }
    setSaving(false);
  };

  const handleDeleteExcursion = async (id: string, title: string) => {
    if (!(await confirm({ message: `Delete "${title}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('excursions').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); if (selectedCategory) fetchExcursions(selectedCategory.id); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="excursions" desc={`${categories.length} categor${categories.length !== 1 ? 'ies' : 'y'}`} />
        <button onClick={openAddCategory} className="btn-primary flex-shrink-0">
          <span className="material-symbols-outlined text-[18px]">add</span> New Category
        </button>
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
                <p className="text-sm text-on-surface-variant/70 italic">No excursions in this category yet.</p>
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
        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
          <button onClick={handleSaveExcursion} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editingExcursion ? 'Update' : 'Add Excursion'}</button>
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
    </div>
  );
}
