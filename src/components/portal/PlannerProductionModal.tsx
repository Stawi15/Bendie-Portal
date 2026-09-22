'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

export type PlannerProductionSessionClient = {
  id: number;
  sessionTitle: string | null;
  sessionDate: string | null;
  dayNumber: number | null;
  startTime: string | null;
  endTime: string | null;
  taskType: string | null;
  trackName: string | null;
  roomName: string | null;
  isParallel: boolean;
  parentProductionId: number | null;
  sortOrder: number | null;
  participants: string | null;
  mode: string | null;
  micType: string | null;
  presentation: string | null;
  mainScreen: string | null;
  notes: string | null;
  stageHandNotes: string | null;
  guestExperience: string | null;
  status: string | null;
  displayStatus: string | null;
  slidesFileName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PlannerProductionFormValues = {
  sessionTitle: string;
  sessionDate: string;
  dayNumber: string;
  startTime: string;
  endTime: string;
  taskType: string;
  trackName: string;
  roomName: string;
  isParallel: boolean;
  parentProductionId: string;
  sortOrder: string;
  participants: string;
  mode: string;
  micType: string;
  presentation: string;
  mainScreen: string;
  notes: string;
  stageHandNotes: string;
  guestExperience: string;
  status: 'auto' | 'pending' | 'ready' | 'active' | 'completed' | 'cancelled';
};

const EMPTY_VALUES: PlannerProductionFormValues = {
  sessionTitle: '',
  sessionDate: '',
  dayNumber: '',
  startTime: '',
  endTime: '',
  taskType: '',
  trackName: '',
  roomName: '',
  isParallel: false,
  parentProductionId: '',
  sortOrder: '',
  participants: '',
  mode: '',
  micType: '',
  presentation: '',
  mainScreen: '',
  notes: '',
  stageHandNotes: '',
  guestExperience: '',
  status: 'auto',
};

/** Portal UX continuation (016) — the programme/location context worth carrying into a fresh "Save & Add Another" form when entering several consecutive sessions on the same day/track/room; title, times, and every other session-specific field always reset. */
export type PlannerProductionPresetContext = Pick<PlannerProductionFormValues, 'sessionDate' | 'dayNumber' | 'trackName' | 'roomName'>;

function sessionToValues(s: PlannerProductionSessionClient): PlannerProductionFormValues {
  const lowerStatus = (s.status ?? '').trim().toLowerCase();
  return {
    sessionTitle: s.sessionTitle ?? '',
    sessionDate: s.sessionDate ?? '',
    dayNumber: s.dayNumber !== null ? String(s.dayNumber) : '',
    startTime: (s.startTime ?? '').slice(0, 5),
    endTime: (s.endTime ?? '').slice(0, 5),
    taskType: s.taskType ?? '',
    trackName: s.trackName ?? '',
    roomName: s.roomName ?? '',
    isParallel: s.isParallel,
    parentProductionId: s.parentProductionId !== null ? String(s.parentProductionId) : '',
    sortOrder: s.sortOrder !== null ? String(s.sortOrder) : '',
    participants: s.participants ?? '',
    mode: s.mode ?? '',
    micType: s.micType ?? '',
    presentation: s.presentation ?? '',
    mainScreen: s.mainScreen ?? '',
    notes: s.notes ?? '',
    stageHandNotes: s.stageHandNotes ?? '',
    guestExperience: s.guestExperience ?? '',
    status: (['pending', 'ready', 'active', 'completed', 'cancelled'].includes(lowerStatus) ? lowerStatus : 'auto') as PlannerProductionFormValues['status'],
  };
}

/** Does this record have any Advanced-section value set? If so, Advanced must default open on edit so nothing is accidentally hidden/lost. */
function hasAdvancedValues(v: PlannerProductionFormValues): boolean {
  return v.isParallel || !!v.parentProductionId || v.status !== 'auto';
}

type SessionOption = { id: number; label: string };

type PlannerProductionModalProps = {
  open: boolean;
  editing: PlannerProductionSessionClient | null;
  parallelOptions: SessionOption[];
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  onSubmit: (values: PlannerProductionFormValues, keepOpen: boolean) => void;
  presetContext?: PlannerProductionPresetContext;
};

/** Section heading used only within this modal's own progressive-disclosure layout — not a shared component, so it carries no design-system weight beyond this one form. */
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{title}</p>
      {children}
    </div>
  );
}

/**
 * Feature 014 — create/edit form covering every USER-MANAGED field
 * (spec.md). `status` offers Auto (time-based, the view's own default
 * detection) / Mark Completed / a free-text override for anything else
 * already present on legacy rows — never a raw always-visible text box, to
 * keep the common case (leave it to automatic detection) the default.
 *
 * Portal UX continuation (016) — reorganized into progressive-disclosure
 * sections (Session Details dominant, Advanced collapsed by default on
 * create) purely as a layout change: every field, its name, its validation,
 * and the canonical `production_tasks` write shape are unchanged.
 */
export function PlannerProductionModal({ open, editing, parallelOptions, submitting, serverError, onClose, onSubmit, presetContext }: PlannerProductionModalProps) {
  const [values, setValues] = useState<PlannerProductionFormValues>(EMPTY_VALUES);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = editing ? sessionToValues(editing) : { ...EMPTY_VALUES, ...presetContext };
    setValues(next);
    setAdvancedOpen(hasAdvancedValues(next));
    setValidationError(null);
  }, [open, editing, presetContext]);

  const handleSubmit = (e: React.SyntheticEvent, keepOpen: boolean) => {
    e.preventDefault();
    if (!values.sessionTitle.trim() || !values.sessionDate) {
      setValidationError('Session title and date are required.');
      return;
    }
    setValidationError(null);
    onSubmit(values, keepOpen);
  };

  const options = parallelOptions.filter((o) => !editing || o.id !== editing.id);

  return (
    <FormModal open={open} onClose={onClose} title={editing ? 'Edit Production Session' : 'Add Production Session'} maxWidthClassName="max-w-2xl">
      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        <FormSection title="Session Details">
          <div>
            <label className="label">Session Title</label>
            <input className="input" value={values.sessionTitle} onChange={(e) => setValues((prev) => ({ ...prev, sessionTitle: e.target.value }))} disabled={submitting} autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={values.sessionDate} onChange={(e) => setValues((prev) => ({ ...prev, sessionDate: e.target.value }))} disabled={submitting} />
            </div>
            <div>
              <label className="label">Start Time</label>
              <input type="time" className="input" value={values.startTime} onChange={(e) => setValues((prev) => ({ ...prev, startTime: e.target.value }))} disabled={submitting} />
            </div>
            <div>
              <label className="label">End Time</label>
              <input type="time" className="input" value={values.endTime} onChange={(e) => setValues((prev) => ({ ...prev, endTime: e.target.value }))} disabled={submitting} />
            </div>
          </div>
          <div>
            <label className="label">Type</label>
            <input className="input" value={values.taskType} onChange={(e) => setValues((prev) => ({ ...prev, taskType: e.target.value }))} placeholder="Keynote / Workshop / Break" disabled={submitting} />
          </div>
        </FormSection>

        <FormSection title="Programme & Location">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Day Number</label>
              <input type="number" className="input" value={values.dayNumber} onChange={(e) => setValues((prev) => ({ ...prev, dayNumber: e.target.value }))} disabled={submitting} />
            </div>
            <div>
              <label className="label">Track</label>
              <input className="input" value={values.trackName} onChange={(e) => setValues((prev) => ({ ...prev, trackName: e.target.value }))} disabled={submitting} />
            </div>
            <div>
              <label className="label">Room</label>
              <input className="input" value={values.roomName} onChange={(e) => setValues((prev) => ({ ...prev, roomName: e.target.value }))} disabled={submitting} />
            </div>
          </div>
          <div>
            <label className="label">Sort Order</label>
            <input type="number" className="input" value={values.sortOrder} onChange={(e) => setValues((prev) => ({ ...prev, sortOrder: e.target.value }))} disabled={submitting} />
          </div>
        </FormSection>

        <FormSection title="Production Requirements">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Mode</label>
              <input className="input" value={values.mode} onChange={(e) => setValues((prev) => ({ ...prev, mode: e.target.value }))} placeholder="In-Person / Live" disabled={submitting} />
            </div>
            <div>
              <label className="label">Mic Type</label>
              <input className="input" value={values.micType} onChange={(e) => setValues((prev) => ({ ...prev, micType: e.target.value }))} disabled={submitting} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Presentation</label>
              <input className="input" value={values.presentation} onChange={(e) => setValues((prev) => ({ ...prev, presentation: e.target.value }))} disabled={submitting} />
            </div>
            <div>
              <label className="label">Main Screen</label>
              <input className="input" value={values.mainScreen} onChange={(e) => setValues((prev) => ({ ...prev, mainScreen: e.target.value }))} disabled={submitting} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Additional Details">
          <div>
            <label className="label">Participants</label>
            <input className="input" value={values.participants} onChange={(e) => setValues((prev) => ({ ...prev, participants: e.target.value }))} disabled={submitting} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={values.notes} onChange={(e) => setValues((prev) => ({ ...prev, notes: e.target.value }))} disabled={submitting} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Stage Hand Notes</label>
              <textarea className="input" rows={2} value={values.stageHandNotes} onChange={(e) => setValues((prev) => ({ ...prev, stageHandNotes: e.target.value }))} disabled={submitting} />
            </div>
            <div>
              <label className="label">Guest Experience</label>
              <textarea className="input" rows={2} value={values.guestExperience} onChange={(e) => setValues((prev) => ({ ...prev, guestExperience: e.target.value }))} disabled={submitting} />
            </div>
          </div>
          {editing?.slidesFileName && <p className="text-xs text-on-surface-variant">Slides on file: {editing.slidesFileName} (upload management not yet available in Portal)</p>}
        </FormSection>

        <div className="border border-outline-variant/50 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            Advanced
            <span className="material-symbols-outlined text-[18px]">{advancedOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {advancedOpen && (
            <div className="p-4 pt-1 space-y-4 border-t border-outline-variant/50">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-on-surface">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary rounded"
                    checked={values.isParallel}
                    onChange={(e) => setValues((prev) => ({ ...prev, isParallel: e.target.checked }))}
                    disabled={submitting}
                  />
                  Runs in parallel
                </label>
                <div className="flex-1 min-w-[200px]">
                  <select
                    className="input"
                    value={values.parentProductionId}
                    onChange={(e) => setValues((prev) => ({ ...prev, parentProductionId: e.target.value }))}
                    disabled={submitting}
                  >
                    <option value="">No parallel parent</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Status Override</label>
                <select
                  className="input"
                  value={values.status}
                  onChange={(e) => setValues((prev) => ({ ...prev, status: e.target.value as PlannerProductionFormValues['status'] }))}
                  disabled={submitting}
                >
                  <option value="auto">Auto (time-based)</option>
                  <option value="pending">Pending</option>
                  <option value="ready">Ready</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {(validationError || serverError) && <p className="text-sm text-error">{validationError ?? serverError?.message}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          {!editing && (
            <button type="button" onClick={(e) => handleSubmit(e, true)} className="btn-secondary disabled:opacity-50" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save & Add Another'}
            </button>
          )}
          <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
            {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Session'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
