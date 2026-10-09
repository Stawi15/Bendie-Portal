'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

export type PlannerAgendaItemClient = {
  id: number;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  dayNumber: number | null;
  dayLabel: string | null;
  title: string;
  subtitle: string | null;
  speakers: string | null;
  mc: string | null;
  roomName: string | null;
  trackName: string | null;
  itemType: string | null;
  description: string | null;
  notes: string | null;
  sortOrder: number;
  readOnly: boolean;
};

export type PlannerAgendaFormValues = {
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  subtitle: string;
  speakers: string;
  mc: string;
  roomName: string;
  trackName: string;
  itemType: string;
  dayLabel: string;
  dayNumber: string;
  description: string;
  notes: string;
};

const EMPTY: PlannerAgendaFormValues = {
  date: '',
  startTime: '',
  endTime: '',
  title: '',
  subtitle: '',
  speakers: '',
  mc: '',
  roomName: '',
  trackName: '',
  itemType: '',
  dayLabel: '',
  dayNumber: '',
  description: '',
  notes: '',
};

function fromItem(item: PlannerAgendaItemClient): PlannerAgendaFormValues {
  return {
    date: item.date ?? '',
    startTime: item.startTime ?? '',
    endTime: item.endTime ?? '',
    title: item.title,
    subtitle: item.subtitle ?? '',
    speakers: item.speakers ?? '',
    mc: item.mc ?? '',
    roomName: item.roomName ?? '',
    trackName: item.trackName ?? '',
    itemType: item.itemType ?? '',
    dayLabel: item.dayLabel ?? '',
    dayNumber: item.dayNumber !== null ? String(item.dayNumber) : '',
    description: item.description ?? '',
    notes: item.notes ?? '',
  };
}

type Props = {
  open: boolean;
  editing: PlannerAgendaItemClient | null;
  submitting: boolean;
  error: string | null;
  /** Bumped by the page after "Save & add another" to clear the form, keeping the date. */
  resetKey: number;
  lastDate?: string;
  onClose: () => void;
  onSubmit: (values: PlannerAgendaFormValues, keepOpen: boolean) => void;
};

const MORE_KEYS: (keyof PlannerAgendaFormValues)[] = ['subtitle', 'speakers', 'mc', 'roomName', 'trackName', 'itemType', 'dayLabel', 'dayNumber', 'description', 'notes'];

/** Feature 018 — add/edit one Planner agenda item. Title and date required; everything else optional. */
export function PlannerAgendaModal({ open, editing, submitting, error, resetKey, lastDate, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<PlannerAgendaFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof PlannerAgendaFormValues, string>>>({});
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = editing ? fromItem(editing) : { ...EMPTY, date: lastDate ?? '' };
    setValues(next);
    setFieldErrors({});
    setShowMore(MORE_KEYS.some((k) => next[k] !== ''));
  }, [open, editing, resetKey, lastDate]);

  if (!open) return null;

  const set = (k: keyof PlannerAgendaFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = (keepOpen: boolean) => {
    const errs: Partial<Record<keyof PlannerAgendaFormValues, string>> = {};
    if (!values.title.trim()) errs.title = 'Title is required';
    if (!values.date) errs.date = 'Date is required';
    if (values.startTime && values.endTime && values.endTime <= values.startTime) errs.endTime = 'End time must be after the start time';
    if (values.dayNumber && !(Number.isInteger(Number(values.dayNumber)) && Number(values.dayNumber) >= 1)) errs.dayNumber = 'Use a whole number of 1 or more';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit(values, keepOpen);
  };

  const field = (k: keyof PlannerAgendaFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`agenda-${k}`}>
        {label}
      </label>
      <input
        id={`agenda-${k}`}
        className="input"
        value={values[k]}
        onChange={set(k)}
        aria-invalid={!!fieldErrors[k]}
        aria-describedby={fieldErrors[k] ? `agenda-${k}-error` : undefined}
        {...props}
      />
      {fieldErrors[k] && (
        <p id={`agenda-${k}-error`} className="text-xs text-error mt-1">
          {fieldErrors[k]}
        </p>
      )}
    </div>
  );

  return (
    <FormModal open={open} onClose={onClose} title={editing ? 'Edit Agenda Item' : 'Add Agenda Item'} maxWidthClassName="max-w-xl">
      <div className="space-y-4">
        {field('title', 'Title *', { placeholder: 'Opening keynote' })}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {field('date', 'Date *', { type: 'date' })}
          {field('startTime', 'Start', { type: 'time' })}
          {field('endTime', 'End', { type: 'time' })}
        </div>
        <p className="hint -mt-2">Leave the times empty for an item without a set time — it is listed first on its day.</p>

        <button type="button" className="row-action" onClick={() => setShowMore((s) => !s)} aria-expanded={showMore}>
          {showMore ? 'Fewer details' : 'More details (speakers, MC, room, type…)'}
        </button>

        {showMore && (
          <div className="space-y-3">
            {field('subtitle', 'Subtitle')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field('speakers', 'Speakers', { placeholder: 'Jane Smith, David Otieno' })}
              {field('mc', 'MC')}
              {field('roomName', 'Room')}
              {field('trackName', 'Track')}
              {field('itemType', 'Type', { placeholder: 'session, break, meal…' })}
              {field('dayLabel', 'Day label', { placeholder: 'Day 1 – Open Strong' })}
              {field('dayNumber', 'Day number', { inputMode: 'numeric', placeholder: 'Worked out from the event dates if empty' })}
            </div>
            <div>
              <label className="label" htmlFor="agenda-description">
                Description
              </label>
              <textarea id="agenda-description" className="input min-h-[72px]" value={values.description} onChange={set('description')} />
            </div>
            <div>
              <label className="label" htmlFor="agenda-notes">
                Notes
              </label>
              <textarea id="agenda-notes" className="input min-h-[60px]" value={values.notes} onChange={set('notes')} />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-outline-variant">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          {!editing && (
            <button type="button" className="btn-secondary" onClick={() => submit(true)} disabled={submitting}>
              Save &amp; add another
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => submit(false)} disabled={submitting}>
            {submitting ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </div>
    </FormModal>
  );
}
