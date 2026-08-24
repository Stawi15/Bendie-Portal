'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useEvent } from '@/contexts/EventContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import { ImageField } from '@/components/portal/ImageField';
import { TagInput } from '@/components/portal/TagInput';
import { AssetPickerModal } from '@/components/portal/AssetPickerModal';
import toast from 'react-hot-toast';

type NewsItem = {
  id: string;
  event_id: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  themes: string[];
  image_url: string | null;
  is_featured: boolean;
  registration_url: string | null;
  read_time_minutes: number | null;
  published_at: string;
};

type NewsForm = {
  title: string;
  summary: string;
  body: string;
  themes: string[];
  image_url: string;
  is_featured: boolean;
  registration_url: string;
  read_time_minutes: string;
  published_at: string; // datetime-local
  is_global: boolean;
};

function toLocal(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16);
}
function nowLocal() {
  return new Date().toISOString().slice(0, 16);
}

const emptyForm = (): NewsForm => ({
  title: '', summary: '', body: '', themes: [], image_url: '',
  is_featured: false, registration_url: '', read_time_minutes: '',
  published_at: nowLocal(), is_global: false,
});

export default function NewsFeedPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { currentEvent } = useEvent();
  const confirm = useConfirm();

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewsForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fetchData = async () => {
    // Matches the app's own read order — published_at desc, not display_order
    // (display_order exists on this table but schema-reference.md confirms
    // the app never actually reads it for news_items).
    const { data, error } = await supabase
      .from('news_items')
      .select('id,event_id,title,summary,body,themes,image_url,is_featured,registration_url,read_time_minutes,published_at')
      .or(`event_id.eq.${eventId},event_id.is.null`)
      .order('published_at', { ascending: false });
    if (error) toast.error('Failed to load news feed');
    else setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setShowForm(true); };
  const openEdit = (n: NewsItem) => {
    setEditing(n);
    setForm({
      title: n.title, summary: n.summary ?? '', body: n.body ?? '', themes: n.themes ?? [],
      image_url: n.image_url ?? '', is_featured: n.is_featured,
      registration_url: n.registration_url ?? '', read_time_minutes: n.read_time_minutes?.toString() ?? '',
      published_at: toLocal(n.published_at), is_global: n.event_id === null,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);

    const payload = {
      title: form.title.trim(),
      summary: form.summary.trim() || null,
      body: form.body.trim() || null,
      themes: form.themes,
      image_url: form.image_url.trim() || null,
      is_featured: form.is_featured,
      registration_url: form.registration_url.trim() || null,
      read_time_minutes: form.read_time_minutes ? parseInt(form.read_time_minutes) : null,
      published_at: form.published_at ? new Date(form.published_at).toISOString() : new Date().toISOString(),
      event_id: form.is_global ? null : eventId,
    };

    if (editing) {
      const { error } = await supabase.from('news_items').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message);
      else { toast.success('Article updated'); setShowForm(false); fetchData(); }
    } else {
      const { error } = await supabase.from('news_items').insert(payload);
      if (error) toast.error(error.message);
      else { toast.success('Article added'); setShowForm(false); fetchData(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!(await confirm({ message: `Delete "${title}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('news_items').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const toggleFeatured = async (n: NewsItem) => {
    const { error } = await supabase.from('news_items').update({ is_featured: !n.is_featured }).eq('id', n.id);
    if (error) toast.error(error.message);
    else fetchData();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="news" desc={`${items.length} article${items.length !== 1 ? 's' : ''}`} />
        <button onClick={openAdd} className="btn-primary flex-shrink-0">
          <span className="material-symbols-outlined text-[18px]">add</span> Add Article
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">newspaper</p>
          <p className="text-on-surface-variant">No articles yet. Add the first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(n => (
            <div key={n.id} onClick={() => openEdit(n)} className="flex items-center gap-4 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4 hover:border-primary/30 transition cursor-pointer">
              {n.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.image_url} alt={n.title} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant/50">newspaper</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-on-surface truncate">{n.title}</p>
                  {n.is_featured && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 flex-shrink-0 inline-flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[12px]">star</span> Featured
                    </span>
                  )}
                  {n.event_id === null && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant flex-shrink-0">Global</span>
                  )}
                </div>
                {n.summary && <p className="text-sm text-on-surface-variant truncate mt-0.5">{n.summary}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-on-surface-variant/70">{new Date(n.published_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {n.themes.slice(0, 3).map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => toggleFeatured(n)} title={n.is_featured ? 'Unfeature' : 'Feature'} className={`text-xs px-2 py-1 rounded-lg font-medium transition ${n.is_featured ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}>
                  {n.is_featured ? 'Unfeature' : 'Feature'}
                </button>
                <button onClick={() => openEdit(n)} className="text-sm text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5 transition">Edit</button>
                <button onClick={() => handleDelete(n.id, n.title)} className="text-sm text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5 transition">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Article' : 'New Article'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Coca-Cola Africa Summit Returns" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Summary</label>
            <input className="input" value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} placeholder="Short preview shown on the Featured and More Stories cards" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Body</label>
            <textarea className="input h-40 resize-none" value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} placeholder="Full article text..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
            <p className="hint">Separate paragraphs with a blank line — the app renders each one as its own block. Not a list, just one field.</p>
          </div>
          <div className="sm:col-span-2">
            <ImageField
              label="Image"
              value={form.image_url}
              onChange={(url) => setForm(p => ({ ...p, image_url: url }))}
              onBrowse={currentEvent?.organization_id ? () => setPickerOpen(true) : undefined}
              compact
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Themes</label>
            <TagInput value={form.themes} onChange={(themes) => setForm(p => ({ ...p, themes }))} placeholder="AI, Fintech" />
            <p className="hint">Shown as &quot;Summit Themes&quot; on the article page, and drives the News Feed&apos;s theme filter</p>
          </div>
          <div>
            <label className="label">Registration URL</label>
            <input type="url" className="input" value={form.registration_url} onChange={e => setForm(p => ({ ...p, registration_url: e.target.value }))} placeholder="https://..." />
            <p className="hint">Powers &quot;Register Now&quot; — the button is hidden if left blank</p>
          </div>
          <div>
            <label className="label">Read Time (minutes)</label>
            <input type="number" className="input" value={form.read_time_minutes} onChange={e => setForm(p => ({ ...p, read_time_minutes: e.target.value }))} min={0} placeholder="Auto-estimated if left blank" />
          </div>
          <div>
            <label className="label">Published At</label>
            <input type="datetime-local" className="input" value={form.published_at} onChange={e => setForm(p => ({ ...p, published_at: e.target.value }))} />
          </div>
          <div className="flex items-end gap-6 pb-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_featured} onChange={e => setForm(p => ({ ...p, is_featured: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
              <span className="text-sm font-medium text-on-surface">Featured</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_global} onChange={e => setForm(p => ({ ...p, is_global: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
              <span className="text-sm font-medium text-on-surface">Apply to all events</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add Article'}</button>
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
    </div>
  );
}
