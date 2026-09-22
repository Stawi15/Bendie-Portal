'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';
import { EventAccessConfigFields } from '@/components/portal/EventAccessConfigFields';
import {
  DEFAULT_ACCESS_CONFIG,
  addPeopleToEvent,
  previewAddAllOrgPeople,
  describeOutcome,
  type EventAccessConfig,
  type PersonOutcome,
  type AddAllPreview,
} from '@/lib/eventTeamProvisioning';

type Props = {
  open: boolean;
  eventId: string;
  eventName: string;
  organizationId: string;
  existingEventMemberIds: Set<string>;
  bendieAvailable: boolean;
  plannerAvailable: boolean;
  canAdministerPlanner: boolean;
  onClose: () => void;
  onDone: () => void;
};

/**
 * "Add all organisation people" — a deliberately secondary, bulk-scale
 * action (reached via the Add People menu, never the primary CTA). Always
 * shows the exact numbers (how many total, how many already on the event,
 * how many will actually be added) and the same Event Role / Product Access
 * configuration as every other path before anything is written — never
 * silently adds everyone as attendees.
 */
export function AddAllOrgPeopleModal({
  open,
  eventId,
  eventName,
  organizationId,
  existingEventMemberIds,
  bendieAvailable,
  plannerAvailable,
  canAdministerPlanner,
  onClose,
  onDone,
}: Props) {
  const [step, setStep] = useState<'preview' | 'configure' | 'results'>('preview');
  const [preview, setPreview] = useState<AddAllPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<EventAccessConfig>({ ...DEFAULT_ACCESS_CONFIG, grantBendie: bendieAvailable, plannerAccess: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<PersonOutcome[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep('preview');
    setLoading(true);
    setConfig({ ...DEFAULT_ACCESS_CONFIG, grantBendie: bendieAvailable, plannerAccess: 'none' });
    setResults([]);
    previewAddAllOrgPeople(organizationId, existingEventMemberIds).then((p) => {
      setPreview(p);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, bendieAvailable]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    const people = preview.candidates.map((c) => ({ userId: c.userId, email: c.email, label: c.fullName ?? c.email ?? 'Unknown' }));
    const outcomes = await addPeopleToEvent(eventId, eventName, organizationId, people, config);
    setResults(outcomes);
    setSubmitting(false);
    setStep('results');
    onDone();
  };

  return (
    <FormModal open={open} onClose={onClose} title="Add All Organisation People" maxWidthClassName="max-w-lg">
      {step === 'preview' && (
        <div className="space-y-4">
          {loading ? (
            <div className="animate-pulse h-20 bg-surface-container-low rounded-xl" />
          ) : preview ? (
            preview.candidates.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-4 text-center">Everyone in this organisation is already on this event.</p>
            ) : (
              <div className="bg-surface-container-low rounded-xl p-4 space-y-1 text-sm">
                <p className="text-on-surface-variant">Organisation people: <span className="font-semibold text-on-surface">{preview.totalOrgPeople}</span></p>
                <p className="text-on-surface-variant">Already on event: <span className="font-semibold text-on-surface">{preview.alreadyInEvent}</span></p>
                <p className="text-on-surface-variant">Will be added: <span className="font-semibold text-primary">{preview.candidates.length}</span></p>
              </div>
            )
          ) : null}
          <div className="flex justify-between pt-3 border-t border-outline-variant">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary disabled:opacity-50" disabled={!preview || preview.candidates.length === 0} onClick={() => setStep('configure')}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'configure' && preview && (
        <div className="space-y-4">
          <p className="hint">This configuration will be applied to all {preview.candidates.length} people below.</p>
          <EventAccessConfigFields config={config} onChange={setConfig} bendieAvailable={bendieAvailable} plannerAvailable={plannerAvailable} canAdministerPlanner={canAdministerPlanner} />
          <div className="flex justify-between pt-3 border-t border-outline-variant">
            <button className="btn-secondary" onClick={() => setStep('preview')} disabled={submitting}>Back</button>
            <button className="btn-primary disabled:opacity-50" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Adding…' : `Add ${preview.candidates.length} People`}
            </button>
          </div>
        </div>
      )}

      {step === 'results' && (
        <div className="space-y-3">
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {results.map((r) => (
              <p key={r.userId} className={`text-sm ${r.eventMembership === 'failed' ? 'text-error' : 'text-on-surface'}`}>
                {describeOutcome(r)}
              </p>
            ))}
          </div>
          <div className="flex justify-end pt-3 border-t border-outline-variant">
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </FormModal>
  );
}
