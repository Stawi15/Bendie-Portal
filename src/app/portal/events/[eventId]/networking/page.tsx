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

type InterestOption = {
  id: string;
  question_key: string;
  question_label: string | null;
  question_type: string;
  option_key: string | null;
  option_label: string | null;
  display_order: number;
  is_required: boolean;
};

type QuestionGroup = {
  question_key: string;
  question_label: string | null;
  question_type: string;
  is_required: boolean;
  options: InterestOption[];
};

type QuestionForm = {
  question_key: string;
  question_label: string;
  question_type: string;
  is_required: boolean;
};

type OptionForm = {
  option_key: string;
  option_label: string;
};

const EMPTY_Q: QuestionForm = { question_key: '', question_label: '', question_type: 'multi_select', is_required: false };
const QUESTION_TYPES = ['multi_select', 'single_select', 'short_text', 'long_text'];

type InterestOptionCsvRow = {
  rowIndex: number;
  question_key: string;
  question_label: string;
  question_type: string;
  is_required: boolean;
  option_key: string | null;
  option_label: string | null;
};

const NETWORKING_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'question_key', label: 'Question Key', required: true },
  { key: 'question_label', label: 'Question Label', required: true },
  { key: 'question_type', label: 'Question Type (multi_select, single_select, short_text, long_text)' },
  { key: 'is_required', label: 'Required (yes/no)' },
  { key: 'option_key', label: 'Option Key' },
  { key: 'option_label', label: 'Option Label' },
];

const NETWORKING_CSV_SAMPLES: Record<string, string>[] = [
  {
    question_key: 'sectors',
    question_label: 'Which sectors interest you?',
    question_type: 'multi_select',
    is_required: 'yes',
    option_key: 'fintech',
    option_label: 'Fintech',
  },
  {
    question_key: 'sectors',
    question_label: 'Which sectors interest you?',
    question_type: 'multi_select',
    is_required: 'yes',
    option_key: 'healthcare',
    option_label: 'Healthcare',
  },
  {
    question_key: 'goals',
    question_label: 'What are your goals for this event?',
    question_type: 'long_text',
    is_required: 'no',
    option_key: '',
    option_label: '',
  },
];

function parseBooleanish(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === '1';
}

export default function NetworkingPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [options, setOptions] = useState<InterestOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddQ, setShowAddQ] = useState(false);
  const [qForm, setQForm] = useState<QuestionForm>(EMPTY_Q);
  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null);
  const [optionForm, setOptionForm] = useState<OptionForm>({ option_key: '', option_label: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('event_interest_options')
      .select('id,question_key,question_label,question_type,option_key,option_label,display_order,is_required')
      .eq('event_id', eventId)
      .order('display_order');
    if (error) toast.error('Failed to load');
    else setOptions(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  // Group by question_key
  const groups: QuestionGroup[] = [];
  const seen = new Set<string>();
  for (const opt of options) {
    if (!seen.has(opt.question_key)) {
      seen.add(opt.question_key);
      groups.push({
        question_key: opt.question_key,
        question_label: opt.question_label,
        question_type: opt.question_type,
        is_required: opt.is_required,
        options: options.filter(o => o.question_key === opt.question_key),
      });
    }
  }

  const isSelectType = (type: string) => type === 'multi_select' || type === 'single_select';

  const filteredGroups = groups.filter(g => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (g.question_label ?? '').toLowerCase().includes(q) ||
      g.question_key.toLowerCase().includes(q) ||
      g.options.some(o => (o.option_label ?? '').toLowerCase().includes(q) || (o.option_key ?? '').toLowerCase().includes(q))
    );
  });

  const setQ = (field: keyof QuestionForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setQForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleAddQuestion = async () => {
    if (!qForm.question_key.trim()) { toast.error('Question key is required'); return; }
    if (!qForm.question_label.trim()) { toast.error('Question label is required'); return; }
    // Ensure unique key
    if (groups.find(g => g.question_key === qForm.question_key.trim())) {
      toast.error('Question key already exists'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('event_interest_options').insert({
      event_id: eventId,
      question_key: qForm.question_key.trim().toLowerCase().replace(/\s+/g, '_'),
      question_label: qForm.question_label.trim(),
      question_type: qForm.question_type,
      is_required: qForm.is_required,
      display_order: groups.length,
    });
    if (error) toast.error(error.message);
    else { toast.success('Question added'); setShowAddQ(false); setQForm(EMPTY_Q); fetchData(); }
    setSaving(false);
  };

  const handleAddOption = async (questionKey: string) => {
    if (!optionForm.option_key.trim()) { toast.error('Option key is required'); return; }
    if (!optionForm.option_label.trim()) { toast.error('Option label is required'); return; }
    const group = groups.find(g => g.question_key === questionKey)!;
    setSaving(true);
    const { error } = await supabase.from('event_interest_options').insert({
      event_id: eventId,
      question_key: questionKey,
      question_label: group.question_label,
      question_type: group.question_type,
      is_required: group.is_required,
      option_key: optionForm.option_key.trim().toLowerCase().replace(/\s+/g, '_'),
      option_label: optionForm.option_label.trim(),
      display_order: group.options.length,
    });
    if (error) toast.error(error.message);
    else { toast.success('Option added'); setAddingOptionFor(null); setOptionForm({ option_key: '', option_label: '' }); fetchData(); }
    setSaving(false);
  };

  const handleDeleteOption = async (id: string) => {
    const { error } = await supabase.from('event_interest_options').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const handleDeleteQuestion = async (questionKey: string) => {
    if (!(await confirm({ message: `Delete all rows for question "${questionKey}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('event_interest_options')
      .delete().eq('event_id', eventId).eq('question_key', questionKey);
    if (error) toast.error(error.message);
    else { toast.success('Question deleted'); fetchData(); }
  };

  const toggleRequired = async (group: QuestionGroup) => {
    const newVal = !group.is_required;
    const { error } = await supabase.from('event_interest_options')
      .update({ is_required: newVal })
      .eq('event_id', eventId).eq('question_key', group.question_key);
    if (error) toast.error(error.message);
    else fetchData();
  };

  const parseNetworkingCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<InterestOptionCsvRow> => {
    const errors: string[] = [];

    const rawKey = getField(raw, 'question_key');
    if (!rawKey) errors.push('question_key is required');
    const questionKey = rawKey.trim().toLowerCase().replace(/\s+/g, '_');

    const questionLabel = getField(raw, 'question_label');
    if (!questionLabel) errors.push('question_label is required');

    const questionTypeRaw = getField(raw, 'question_type').toLowerCase();
    const questionType = questionTypeRaw || 'multi_select';
    if (questionTypeRaw && !QUESTION_TYPES.includes(questionTypeRaw)) {
      errors.push(`question_type must be one of: ${QUESTION_TYPES.join(', ')}`);
    }

    const isRequired = parseBooleanish(getField(raw, 'is_required'));
    const isSelectType = questionType === 'multi_select' || questionType === 'single_select';

    const optionKeyRaw = getField(raw, 'option_key');
    const optionLabelRaw = getField(raw, 'option_label');
    let optionKey: string | null = null;
    let optionLabel: string | null = null;

    if (optionKeyRaw || optionLabelRaw) {
      if (!isSelectType) {
        errors.push('option_key/option_label are only allowed for multi_select or single_select questions');
      } else if (!optionKeyRaw || !optionLabelRaw) {
        errors.push('option_key and option_label must both be provided together');
      } else {
        optionKey = optionKeyRaw.trim().toLowerCase().replace(/\s+/g, '_');
        optionLabel = optionLabelRaw;
      }
    }

    const data: InterestOptionCsvRow = {
      rowIndex,
      question_key: questionKey,
      question_label: questionLabel,
      question_type: questionType,
      is_required: isRequired,
      option_key: optionKey,
      option_label: optionLabel,
    };

    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  const importNetworkingRow = async (row: InterestOptionCsvRow) => {
    const { rowIndex, ...rest } = row;
    const existingCount = options.filter((o) => o.question_key === rest.question_key).length;
    const { error } = await supabase.from('event_interest_options').insert({
      event_id: eventId,
      ...rest,
      display_order: existingCount + rowIndex,
    });
    return { error: error?.message };
  };

  const TYPE_LABEL: Record<string, string> = {
    multi_select: 'Multi-select', single_select: 'Single select',
    short_text: 'Short text', long_text: 'Long text',
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="networking" desc="Define the interest questions shown to attendees during onboarding" />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setCsvOpen(true)} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import CSV
          </button>
          <button onClick={() => setShowAddQ(true)} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> Add Question
          </button>
        </div>
      </div>

      {/* Add Question modal */}
      <FormModal open={showAddQ} onClose={() => { setShowAddQ(false); setQForm(EMPTY_Q); }} title="New Question">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Question Key *</label>
              <input className="input font-mono text-sm" value={qForm.question_key} onChange={setQ('question_key')} placeholder="investment_stage" />
              <p className="hint">Unique identifier, lowercase with underscores</p>
            </div>
            <div>
              <label className="label">Question Type</label>
              <select className="input" value={qForm.question_type} onChange={setQ('question_type')}>
                {QUESTION_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Question Label *</label>
              <input className="input" value={qForm.question_label} onChange={setQ('question_label')} placeholder="What stage of investment are you in?" />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={qForm.is_required} onChange={e => setQForm(p => ({ ...p, is_required: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
                <span className="text-sm font-medium text-on-surface">Required question</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
            <button onClick={handleAddQuestion} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Add Question'}</button>
            <button onClick={() => { setShowAddQ(false); setQForm(EMPTY_Q); }} className="btn-secondary">Cancel</button>
          </div>
      </FormModal>

      {/* Search */}
      {!loading && groups.length > 0 && (
        <div className="mb-4 max-w-sm">
          <input
            type="text"
            placeholder="Search by question or option..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full"
          />
        </div>
      )}

      {/* Questions */}
      {loading ? (
        <div className="animate-pulse space-y-4">{[1, 2].map(i => <div key={i} className="h-32 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">link</p>
          <p className="text-on-surface-variant">No networking questions yet.</p>
          <p className="text-sm text-on-surface-variant/70 mt-1">Add questions to capture attendee interests during onboarding.</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">search</p>
          <p className="text-on-surface-variant">No questions match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredGroups.map(group => (
            <div key={group.question_key} className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden">
              {/* Question header */}
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 bg-surface-container-low border-b border-outline-variant">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-on-surface">{group.question_label}</p>
                    {group.is_required && <span className="text-xs px-1.5 py-0.5 rounded bg-error/10 text-error font-medium">Required</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded">{group.question_key}</code>
                    <span className="text-xs text-on-surface-variant">{TYPE_LABEL[group.question_type] ?? group.question_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleRequired(group)} className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-lg hover:bg-surface-container-high transition">
                    {group.is_required ? 'Make optional' : 'Make required'}
                  </button>
                  {isSelectType(group.question_type) && (
                    <button onClick={() => { setAddingOptionFor(group.question_key); setOptionForm({ option_key: '', option_label: '' }); }}
                      className="text-xs text-primary hover:opacity-80 px-2 py-1 rounded-lg hover:bg-primary/5 transition">
                      + Option
                    </button>
                  )}
                  <button onClick={() => handleDeleteQuestion(group.question_key)} className="text-xs text-error hover:opacity-80 px-2 py-1 rounded-lg hover:bg-error/5 transition">Delete</button>
                </div>
              </div>

              {/* Options */}
              {isSelectType(group.question_type) && (
                <div className="px-5 py-3">
                  {group.options.filter(o => o.option_key).length === 0 ? (
                    <p className="text-sm text-on-surface-variant/70 italic">No options yet — click &quot;+ Option&quot; to add choices.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {group.options.filter(o => o.option_key).map(opt => (
                        <div key={opt.id} className="flex items-center gap-1 bg-primary/5 border border-primary/20 rounded-full px-3 py-1">
                          <span className="text-sm text-primary">{opt.option_label}</span>
                          <code className="text-xs text-primary/60">({opt.option_key})</code>
                          <button onClick={() => handleDeleteOption(opt.id)} className="text-primary/60 hover:text-error ml-1 font-bold leading-none transition">×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline option add form */}
                  {addingOptionFor === group.question_key && (
                    <div className="flex gap-2 mt-3 items-end">
                      <div className="flex-1">
                        <label className="label text-xs">Option Key</label>
                        <input className="input text-sm font-mono" value={optionForm.option_key} onChange={e => setOptionForm(p => ({ ...p, option_key: e.target.value }))} placeholder="early_stage" />
                      </div>
                      <div className="flex-1">
                        <label className="label text-xs">Option Label</label>
                        <input className="input text-sm" value={optionForm.option_label} onChange={e => setOptionForm(p => ({ ...p, option_label: e.target.value }))} placeholder="Early Stage" />
                      </div>
                      <button onClick={() => handleAddOption(group.question_key)} disabled={saving} className="btn-primary text-xs py-2">{saving ? '...' : 'Add'}</button>
                      <button onClick={() => setAddingOptionFor(null)} className="btn-secondary text-xs py-2">Cancel</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CsvImportModal<InterestOptionCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetchData}
        title="Import Networking Questions"
        templateFilename="networking-template.csv"
        columns={NETWORKING_CSV_COLUMNS}
        sampleRows={NETWORKING_CSV_SAMPLES}
        parseRow={parseNetworkingCsvRow}
        importRow={importNetworkingRow}
      />
    </div>
  );
}
