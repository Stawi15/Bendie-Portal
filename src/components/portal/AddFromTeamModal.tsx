'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';
import { Avatar } from '@/components/portal/Avatar';
import { EventAccessConfigFields } from '@/components/portal/EventAccessConfigFields';
import {
  DEFAULT_ACCESS_CONFIG,
  addPeopleToEvent,
  previewTeamForEvent,
  describeOutcome,
  type EventAccessConfig,
  type PersonOutcome,
  type TeamPreview,
} from '@/lib/eventTeamProvisioning';

type TeamOption = { id: string; name: string };

type Props = {
  open: boolean;
  teams: TeamOption[];
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
 * "From team": pick a team, preview exactly who would actually be added
 * (never blindly inserts the whole team — some may already be on the
 * event), let the manager deselect individuals, then the same shared
 * Event Role / Product Access configuration step as every other add path.
 * Teams themselves carry no event role or product-access implication —
 * they are purely a source of people (per the locked product decision).
 */
export function AddFromTeamModal({
  open,
  teams,
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
  const [step, setStep] = useState<'pick_team' | 'preview' | 'configure' | 'results'>('pick_team');
  const [preview, setPreview] = useState<TeamPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<EventAccessConfig>({ ...DEFAULT_ACCESS_CONFIG, grantBendie: bendieAvailable });
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<PersonOutcome[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep('pick_team');
    setPreview(null);
    setSelectedIds(new Set());
    setConfig({ ...DEFAULT_ACCESS_CONFIG, grantBendie: bendieAvailable });
    setResults([]);
  }, [open, bendieAvailable]);

  if (!open) return null;

  const handlePickTeam = async (id: string) => {
    const team = teams.find((t) => t.id === id);
    if (!team) return;
    setLoadingPreview(true);
    const p = await previewTeamForEvent(id, team.name, existingEventMemberIds);
    setPreview(p);
    setSelectedIds(new Set(p.candidates.map((c) => c.userId)));
    setLoadingPreview(false);
    setStep('preview');
  };

  const toggle = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    const people = preview.candidates
      .filter((c) => selectedIds.has(c.userId))
      .map((c) => ({ userId: c.userId, email: c.email, label: c.fullName ?? c.email ?? 'Unknown' }));
    const outcomes = await addPeopleToEvent(eventId, eventName, organizationId, people, config);
    setResults(outcomes);
    setSubmitting(false);
    setStep('results');
    onDone();
  };

  return (
    <FormModal open={open} onClose={onClose} title="Add Attendees — From Team" maxWidthClassName="max-w-lg">
      {step === 'pick_team' && (
        <div className="space-y-3">
          {teams.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">No teams in this organisation yet.</p>
          ) : (
            <div className="space-y-1">
              {teams.map((t) => (
                <button key={t.id} onClick={() => handlePickTeam(t.id)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-surface-container-low transition-colors text-sm font-medium text-on-surface">
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-3 border-t border-outline-variant">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          {loadingPreview ? (
            <div className="animate-pulse space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-container-low rounded-xl" />)}</div>
          ) : preview && (
            <>
              <div className="bg-surface-container-low rounded-xl p-3 text-sm text-on-surface-variant">
                <p><span className="font-semibold text-on-surface">{preview.teamName}</span> — {preview.totalMembers} team member{preview.totalMembers !== 1 ? 's' : ''}, {preview.alreadyInEvent} already on this event.</p>
              </div>
              {preview.candidates.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-4 text-center">Everyone in this team is already on this event.</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {preview.candidates.map((p) => (
                    <label key={p.userId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-container-low cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-primary rounded flex-shrink-0" checked={selectedIds.has(p.userId)} onChange={() => toggle(p.userId)} />
                      <Avatar name={p.fullName} email={p.email} avatarUrl={p.avatarUrl} size={28} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{p.fullName ?? 'Unnamed'}</p>
                        <p className="text-xs text-on-surface-variant truncate">{p.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="flex justify-between pt-3 border-t border-outline-variant">
            <button className="btn-secondary" onClick={() => setStep('pick_team')}>Back</button>
            <button className="btn-primary disabled:opacity-50" disabled={selectedIds.size === 0} onClick={() => setStep('configure')}>
              Continue with {selectedIds.size}
            </button>
          </div>
        </div>
      )}

      {step === 'configure' && (
        <div className="space-y-4">
          <EventAccessConfigFields config={config} onChange={setConfig} bendieAvailable={bendieAvailable} plannerAvailable={plannerAvailable} canAdministerPlanner={canAdministerPlanner} />
          <div className="flex justify-between pt-3 border-t border-outline-variant">
            <button className="btn-secondary" onClick={() => setStep('preview')} disabled={submitting}>Back</button>
            <button className="btn-primary disabled:opacity-50" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Adding…' : `Add ${selectedIds.size} to Event`}
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
