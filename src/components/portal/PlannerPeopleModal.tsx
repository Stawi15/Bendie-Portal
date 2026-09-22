'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

export type PlannerParticipantClient = {
  id: number;
  eventPassengerId: number;
  fullName: string;
  title: string | null;
  passport: string | null;
  dietaryRequirements: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  linkedAt: string;
};

export type PlannerParticipantSearchResult = { passengerId: number; fullName: string; email: string | null; phone: string | null };

export type PlannerParticipantFormValues = {
  fullName: string;
  title: string;
  passport: string;
  dietaryRequirements: string;
  gender: string;
  email: string;
  phone: string;
};

const EMPTY_VALUES: PlannerParticipantFormValues = { fullName: '', title: '', passport: '', dietaryRequirements: '', gender: '', email: '', phone: '' };

function participantToValues(p: PlannerParticipantClient): PlannerParticipantFormValues {
  return {
    fullName: p.fullName,
    title: p.title ?? '',
    passport: p.passport ?? '',
    dietaryRequirements: p.dietaryRequirements ?? '',
    gender: p.gender ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
  };
}

type PlannerPeopleModalProps = {
  open: boolean;
  /** `null` = "add" mode (new-person / search-existing tabs); a participant = "edit" mode. */
  editing: PlannerParticipantClient | null;
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  /** `keepOpen` true for "Save & Add Another" — never passed in edit mode. */
  onCreateNew: (values: PlannerParticipantFormValues, keepOpen: boolean) => void;
  onLinkExisting: (passengerId: number) => void;
  onSaveEdit: (values: PlannerParticipantFormValues) => void;
  onSearch: (query: string) => Promise<PlannerParticipantSearchResult[]>;
};

/**
 * Feature 011 — two-tab "add" form (New person / Search existing) plus an
 * "edit" mode rendering the same field set for an already-linked participant.
 * No lifecycle/status concept exists here (spec.md Verified Business Rule
 * 6) — this is pure identity/roster management, so unlike
 * `PlannerChecklistModal`/`PlannerVendorModal` there is no separate
 * create-only vs. inline-edit split: editing is a full field-set form here,
 * reached via the list's own Edit action.
 */
export function PlannerPeopleModal({ open, editing, submitting, serverError, onClose, onCreateNew, onLinkExisting, onSaveEdit, onSearch }: PlannerPeopleModalProps) {
  const [tab, setTab] = useState<'new' | 'existing'>('new');
  const [values, setValues] = useState<PlannerParticipantFormValues>(EMPTY_VALUES);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlannerParticipantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(editing ? participantToValues(editing) : EMPTY_VALUES);
    setValidationError(null);
    setTab('new');
    setSearchQuery('');
    setSearchResults([]);
  }, [open, editing]);

  useEffect(() => {
    if (!open || editing || tab !== 'existing') return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      onSearch(query)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, editing, tab, searchQuery, onSearch]);

  const handleSubmit = (e: React.SyntheticEvent, keepOpen: boolean) => {
    e.preventDefault();
    if (!values.fullName.trim()) {
      setValidationError('Full name is required.');
      return;
    }
    setValidationError(null);
    if (editing) {
      onSaveEdit(values);
    } else {
      onCreateNew(values, keepOpen);
    }
  };

  const title = editing ? 'Edit Participant' : 'Add Participant';

  return (
    <FormModal open={open} onClose={onClose} title={title} maxWidthClassName="max-w-lg">
      {!editing && (
        <div className="flex gap-2 mb-4 border-b border-outline-variant/30">
          <button type="button" className={`px-3 py-2 text-sm font-medium ${tab === 'new' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`} onClick={() => setTab('new')}>
            New person
          </button>
          <button
            type="button"
            className={`px-3 py-2 text-sm font-medium ${tab === 'existing' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}
            onClick={() => setTab('existing')}
          >
            Search existing
          </button>
        </div>
      )}

      {!editing && tab === 'existing' ? (
        <div className="space-y-3">
          <input
            className="input"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={submitting}
            autoFocus
          />
          {searching && <p className="text-xs text-on-surface-variant">Searching…</p>}
          {!searching && searchQuery.trim() && searchResults.length === 0 && <p className="text-xs text-on-surface-variant">No matching participants found.</p>}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {searchResults.map((result) => (
              <button
                key={result.passengerId}
                type="button"
                disabled={submitting}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container-low border border-outline-variant/30 disabled:opacity-50"
                onClick={() => onLinkExisting(result.passengerId)}
              >
                <p className="text-sm font-medium text-on-surface">{result.fullName}</p>
                <p className="text-xs text-on-surface-variant">{[result.email, result.phone].filter(Boolean).join(' · ') || 'No contact info on file'}</p>
              </button>
            ))}
          </div>
          {serverError && <p className="text-sm text-error">{serverError.message}</p>}
        </div>
      ) : (
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={values.fullName} onChange={(e) => setValues((prev) => ({ ...prev, fullName: e.target.value }))} disabled={submitting} autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Title</label>
              <input className="input" value={values.title} onChange={(e) => setValues((prev) => ({ ...prev, title: e.target.value }))} placeholder="Mr / Mrs / Dr" disabled={submitting} />
            </div>
            <div>
              <label className="label">Gender</label>
              <input className="input" value={values.gender} onChange={(e) => setValues((prev) => ({ ...prev, gender: e.target.value }))} disabled={submitting} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={values.email} onChange={(e) => setValues((prev) => ({ ...prev, email: e.target.value }))} disabled={submitting} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={values.phone} onChange={(e) => setValues((prev) => ({ ...prev, phone: e.target.value }))} disabled={submitting} />
            </div>
          </div>
          <div>
            <label className="label">Passport</label>
            <input className="input" value={values.passport} onChange={(e) => setValues((prev) => ({ ...prev, passport: e.target.value }))} disabled={submitting} />
          </div>
          <div>
            <label className="label">Dietary Requirements</label>
            <textarea
              className="input"
              rows={2}
              value={values.dietaryRequirements}
              onChange={(e) => setValues((prev) => ({ ...prev, dietaryRequirements: e.target.value }))}
              disabled={submitting}
            />
          </div>

          {(validationError || serverError) && <p className="text-sm text-error">{validationError ?? serverError?.message}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
            {!editing && (
              <button type="button" onClick={(e) => handleSubmit(e, true)} className="btn-secondary disabled:opacity-50" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save & Add Another'}
              </button>
            )}
            <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
              {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Person'}
            </button>
          </div>
        </form>
      )}
    </FormModal>
  );
}
