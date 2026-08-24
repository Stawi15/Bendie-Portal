'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { FormModal } from '@/components/portal/FormModal';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { useConfirm } from '@/contexts/ConfirmContext';
import toast from 'react-hot-toast';

type FAQ = {
  id: string;
  section: string;
  question: string;
  answer: string;
  display_order: number;
};

type FAQForm = {
  section: string;
  question: string;
  answer: string;
  display_order: string;
};

const EMPTY_FORM: FAQForm = { section: 'General', question: '', answer: '', display_order: '0' };

type FaqCsvRow = {
  rowIndex: number;
  section: string;
  question: string;
  answer: string;
};

const FAQ_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'section', label: 'Section' },
  { key: 'question', label: 'Question', required: true },
  { key: 'answer', label: 'Answer', required: true },
];

const FAQ_CSV_SAMPLES: Record<string, string>[] = [
  { section: 'Logistics', question: 'What is the dress code?', answer: 'Smart casual is recommended for all sessions.' },
  { section: 'Logistics', question: 'Is parking available?', answer: 'Yes, free parking is available on-site.' },
  { section: 'Registration', question: 'Can I bring a guest?', answer: 'Guests must register separately in advance.' },
];

function parseFaqCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<FaqCsvRow> {
  const errors: string[] = [];

  const question = getField(raw, 'question');
  if (!question) errors.push('question is required');

  const answer = getField(raw, 'answer');
  if (!answer) errors.push('answer is required');

  const data: FaqCsvRow = {
    rowIndex,
    section: getField(raw, 'section') || 'General',
    question,
    answer,
  };

  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

export default function FAQsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FAQ | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FAQForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('faqs')
      .select('id,section,question,answer,display_order')
      .eq('event_id', eventId)
      .order('section').order('display_order');
    if (error) toast.error('Failed to load FAQs');
    else setFaqs(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  // Group FAQs by section
  const sections = Array.from(new Set(faqs.map(f => f.section)));

  const openAdd = (section?: string) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, section: section ?? 'General', display_order: faqs.filter(f => f.section === (section ?? 'General')).length.toString() });
    setShowForm(true);
  };

  const openEdit = (faq: FAQ) => {
    setEditing(faq);
    setForm({ section: faq.section, question: faq.question, answer: faq.answer, display_order: faq.display_order.toString() });
    setShowForm(true);
  };

  const set = (field: keyof FAQForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.question.trim()) { toast.error('Question is required'); return; }
    if (!form.answer.trim()) { toast.error('Answer is required'); return; }
    if (!form.section.trim()) { toast.error('Section is required'); return; }
    setSaving(true);

    const payload = {
      section: form.section.trim(),
      question: form.question.trim(),
      answer: form.answer.trim(),
      display_order: parseInt(form.display_order) || 0,
    };

    if (editing) {
      const { error } = await supabase.from('faqs').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message);
      else { toast.success('FAQ updated'); setShowForm(false); fetchData(); }
    } else {
      const { error } = await supabase.from('faqs').insert({ ...payload, event_id: eventId });
      if (error) toast.error(error.message);
      else { toast.success('FAQ added'); setShowForm(false); fetchData(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, question: string) => {
    if (!(await confirm({ message: `Delete this FAQ?\n"${question}"`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('faqs').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const importFaqRow = async (row: FaqCsvRow) => {
    const { rowIndex, ...rest } = row;
    const existingCount = faqs.filter((f) => f.section === rest.section).length;
    const { error } = await supabase.from('faqs').insert({
      event_id: eventId,
      ...rest,
      display_order: existingCount + rowIndex,
    });
    return { error: error?.message };
  };

  const filteredFaqs = faqs.filter(f => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q) || f.section.toLowerCase().includes(q);
  });
  const visibleSections = sections.filter(section => filteredFaqs.some(f => f.section === section));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader
          sectionKey="faqs"
          desc={`${faqs.length} question${faqs.length !== 1 ? 's' : ''} across ${sections.length} section${sections.length !== 1 ? 's' : ''}`}
        />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setCsvOpen(true)} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import CSV
          </button>
          <button onClick={() => openAdd()} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> Add FAQ
          </button>
        </div>
      </div>

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit FAQ' : 'New FAQ'}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Section *</label>
                <input className="input" value={form.section} onChange={set('section')} placeholder="General" list="section-suggestions" />
                <datalist id="section-suggestions">
                  {sections.map(s => <option key={s} value={s} />)}
                  {['General', 'Logistics', 'Content', 'Catering', 'Accommodation', 'Registration'].filter(s => !sections.includes(s)).map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label className="label">Display Order</label>
                <input type="number" className="input" value={form.display_order} onChange={set('display_order')} min={0} />
              </div>
            </div>
            <div>
              <label className="label">Question *</label>
              <input className="input" value={form.question} onChange={set('question')} placeholder="What is the dress code?" />
            </div>
            <div>
              <label className="label">Answer *</label>
              <textarea className="input h-24 resize-none" value={form.answer} onChange={set('answer')} placeholder="Smart casual is recommended..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
            </div>
          </div>
          <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add FAQ'}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
      </FormModal>

      {/* Search */}
      {!loading && faqs.length > 0 && (
        <div className="mb-4 max-w-sm">
          <input
            type="text"
            placeholder="Search by question, answer, section..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full"
          />
        </div>
      )}

      {/* Grouped FAQ list */}
      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : faqs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">help</p>
          <p className="text-on-surface-variant">No FAQs yet. Add the first one.</p>
        </div>
      ) : visibleSections.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">search</p>
          <p className="text-on-surface-variant">No FAQs match your search.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleSections.map(section => (
            <div key={section}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{section}</h3>
                <button onClick={() => openAdd(section)} className="text-xs text-primary hover:opacity-80 font-medium">+ Add to section</button>
              </div>
              <div className="space-y-2">
                {filteredFaqs.filter(f => f.section === section).map(faq => (
                  <div key={faq.id} className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-container-low/40 transition"
                      onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                    >
                      <p className="font-medium text-on-surface text-sm">{faq.question}</p>
                      <span className="material-symbols-outlined text-on-surface-variant ml-2 flex-shrink-0 text-[20px]">
                        {expandedId === faq.id ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                    {expandedId === faq.id && (
                      <div className="px-5 pb-4 border-t border-outline-variant">
                        <p className="text-sm text-on-surface-variant mt-3 whitespace-pre-wrap">{faq.answer}</p>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => openEdit(faq)} className="text-xs text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5">Edit</button>
                          <button onClick={() => handleDelete(faq.id, faq.question)} className="text-xs text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5">Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <CsvImportModal<FaqCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetchData}
        title="Import FAQs"
        templateFilename="faqs-template.csv"
        columns={FAQ_CSV_COLUMNS}
        sampleRows={FAQ_CSV_SAMPLES}
        parseRow={parseFaqCsvRow}
        importRow={importFaqRow}
      />
    </div>
  );
}
