'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FormModal } from '@/components/portal/FormModal';
import { Avatar } from '@/components/portal/Avatar';
import { EventAccessConfigFields } from '@/components/portal/EventAccessConfigFields';
import {
  DEFAULT_ACCESS_CONFIG,
  addPeopleToEvent,
  addPersonToEvent,
  resolveOrCreatePersonByEmail,
  listOrganizationCandidates,
  describeOutcome,
  type EventAccessConfig,
  type PersonSummary,
  type PersonOutcome,
} from '@/lib/eventTeamProvisioning';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  open: boolean;
  mode: 'organisation' | 'invite';
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
 * "From organisation" and "Invite new person" share the exact same second
 * step (Event Role / Product Access configuration) and the exact same
 * underlying provisioning call — only how the target person(s) are selected
 * differs, so this is one component with a `mode` switch rather than two
 * near-duplicate ones (per the "prefer a simple reliable implementation
 * over an enormous wizard" guidance).
 */
export function AddPeopleModal({
  open,
  mode,
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
  const [step, setStep] = useState<'select' | 'configure' | 'results'>('select');
  const [candidates, setCandidates] = useState<PersonSummary[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [config, setConfig] = useState<EventAccessConfig>({ ...DEFAULT_ACCESS_CONFIG, grantBendie: bendieAvailable });
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<PersonOutcome[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep('select');
    setSelectedIds(new Set());
    setSearch('');
    setInviteEmail('');
    setInviteFullName('');
    setConfig({ ...DEFAULT_ACCESS_CONFIG, grantBendie: bendieAvailable });
    setResults([]);
    if (mode === 'organisation') {
      setLoadingCandidates(true);
      listOrganizationCandidates(organizationId, existingEventMemberIds).then((rows) => {
        setCandidates(rows);
        setLoadingCandidates(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, organizationId]);

  if (!open) return null;

  const filtered = candidates.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.fullName?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
  });

  const toggle = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const canContinue = mode === 'organisation' ? selectedIds.size > 0 : EMAIL_RE.test(inviteEmail.trim());

  const handleSubmit = async () => {
    setSubmitting(true);
    if (mode === 'organisation') {
      const people = candidates
        .filter((c) => selectedIds.has(c.userId))
        .map((c) => ({ userId: c.userId, email: c.email, label: c.fullName ?? c.email ?? 'Unknown' }));
      const outcomes = await addPeopleToEvent(eventId, eventName, organizationId, people, config);
      setResults(outcomes);
    } else {
      const resolved = await resolveOrCreatePersonByEmail(inviteEmail, inviteFullName, organizationId);
      if ('error' in resolved) {
        toast.error(resolved.error);
        setSubmitting(false);
        return;
      }
      const label = inviteFullName.trim() || inviteEmail.trim();
      const outcome = await addPersonToEvent(eventId, eventName, organizationId, { userId: resolved.userId, email: inviteEmail.trim(), label }, config);
      setResults([outcome]);
    }
    setSubmitting(false);
    setStep('results');
    onDone();
  };

  return (
    <FormModal open={open} onClose={onClose} title={mode === 'organisation' ? 'Add Attendees — From Organisation' : 'Invite New Attendee'} maxWidthClassName="max-w-lg">
      {step === 'select' && mode === 'organisation' && (
        <div className="space-y-3">
          <input className="input" placeholder="Search organisation people…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {loadingCandidates ? (
            <div className="animate-pulse space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-container-low rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">
              {candidates.length === 0 ? 'Everyone in this organisation is already on this event.' : 'No matches.'}
            </p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {filtered.map((p) => (
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
          <div className="flex justify-between items-center pt-3 border-t border-outline-variant">
            <span className="text-xs text-on-surface-variant">{selectedIds.size} selected</span>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary disabled:opacity-50" disabled={!canContinue} onClick={() => setStep('configure')}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {step === 'select' && mode === 'invite' && (
        <div className="space-y-3">
          <p className="hint">If this email doesn&apos;t have an account yet, one is created automatically — no password, no email sent for the account itself.</p>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={inviteFullName} onChange={(e) => setInviteFullName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary disabled:opacity-50" disabled={!canContinue} onClick={() => setStep('configure')}>Continue</button>
          </div>
        </div>
      )}

      {step === 'configure' && (
        <div className="space-y-4">
          <EventAccessConfigFields config={config} onChange={setConfig} bendieAvailable={bendieAvailable} plannerAvailable={plannerAvailable} canAdministerPlanner={canAdministerPlanner} />
          <div className="flex justify-between pt-3 border-t border-outline-variant">
            <button className="btn-secondary" onClick={() => setStep('select')} disabled={submitting}>Back</button>
            <button className="btn-primary disabled:opacity-50" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Adding…' : mode === 'organisation' ? `Add ${selectedIds.size} to Event` : 'Add to Event'}
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
