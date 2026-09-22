'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { FormModal } from '@/components/portal/FormModal';
import { Avatar } from '@/components/portal/Avatar';
import { matchOrCreateParticipant, describeParticipantMatchOutcome, type ParticipantMatchOutcome } from '@/lib/plannerParticipantMatching';

type Candidate = { userId: string; fullName: string | null; email: string | null; avatarUrl: string | null };

type Props = {
  open: boolean;
  /** "attendees" reads this event's own Event Team roster; "organisation" reads every organisation person, regardless of event. */
  source: 'attendees' | 'organisation';
  eventId: string;
  organizationId: string;
  /** Lowercased emails already tracked as Planner Participants for this event — used to exclude them from selection and never re-process them. */
  existingParticipantEmails: Set<string>;
  onClose: () => void;
  onDone: () => void;
};

/**
 * Feature 016 (Attendee/Participant Journey Clarification) — lets a manager
 * explicitly select existing Bendie attendees or organisation people to add
 * as Planner Participants, without retyping their details. This is an
 * explicit per-person choice by the manager (never an automatic guess) —
 * the actual link-vs-create decision per selected person is still made by
 * the shared `matchOrCreateParticipant` helper's exact-email rule, reusing
 * Feature 011's existing routes only.
 */
export function AddParticipantFromPortalModal({ open, source, eventId, organizationId, existingParticipantEmails, onClose, onDone }: Props) {
  const [step, setStep] = useState<'select' | 'results'>('select');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ParticipantMatchOutcome[]>([]);

  // Corrective fix (Feature 016 continuation, Planner Participants
  // navigation-stability investigation): the original version of this
  // effect had no `.catch()` and no staleness guard — a query failure (or a
  // reopen with different props before the first query resolved) left
  // `loading` stuck `true` forever with no way to recover except closing the
  // modal. Both are fixed here: `cancelled` discards a stale response
  // (matching every other data-fetching effect in this codebase), and a
  // genuine failure now surfaces `loadError` instead of an infinite
  // skeleton.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep('select');
    setSelectedIds(new Set());
    setSearch('');
    setResults([]);
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const { data, error } =
          source === 'attendees'
            ? await supabase.from('event_members').select('user_id, profiles!event_members_user_id_fkey(full_name, email, avatar_url)').eq('event_id', eventId)
            : await supabase.from('organization_members').select('user_id, profiles:user_id(full_name, email, avatar_url)').eq('organization_id', organizationId);
        if (cancelled) return;
        if (error) {
          setLoadError('Could not load people to add — try again.');
          setLoading(false);
          return;
        }
        type Raw = { user_id: string; profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null };
        const rows = ((data as unknown as Raw[]) ?? []).map((r) => ({
          userId: r.user_id,
          fullName: r.profiles?.full_name ?? null,
          email: r.profiles?.email ?? null,
          avatarUrl: r.profiles?.avatar_url ?? null,
        }));
        // Never pre-hide a candidate just because their email happens to
        // match — still list them, but visibly marked, so the manager makes
        // an informed, explicit choice rather than having people silently
        // disappear from the picker.
        setCandidates(rows);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setLoadError('Could not load people to add — try again.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, source, eventId, organizationId]);

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

  const handleSubmit = async () => {
    setSubmitting(true);
    const selected = candidates.filter((c) => selectedIds.has(c.userId));
    const outcomes: ParticipantMatchOutcome[] = [];
    for (const person of selected) {
      // Sequential, not concurrent — createNewParticipant/linkExistingParticipant
      // are not designed for concurrent calls against the same event, and this
      // is a small, manager-initiated, human-scale selection, not a bulk import.
      const outcome = await matchOrCreateParticipant(eventId, { fullName: person.fullName ?? person.email ?? 'Unknown', email: person.email }, existingParticipantEmails);
      outcomes.push(outcome);
    }
    setResults(outcomes);
    setSubmitting(false);
    setStep('results');
    onDone();
  };

  return (
    <FormModal open={open} onClose={onClose} title={source === 'attendees' ? 'Add Participant — From Bendie Attendees' : 'Add Participant — From Organisation'} maxWidthClassName="max-w-lg">
      {step === 'select' && (
        <div className="space-y-3">
          <input className="input" placeholder={source === 'attendees' ? 'Search attendees…' : 'Search organisation people…'} value={search} onChange={(e) => setSearch(e.target.value)} />
          {loadError ? (
            <p className="text-sm text-error py-4 text-center">{loadError}</p>
          ) : loading ? (
            <div className="animate-pulse space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-container-low rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">
              {source === 'attendees' ? 'No one is on this event yet.' : 'No one in this organisation yet.'}
            </p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {filtered.map((p) => {
                const alreadyParticipant = p.email ? existingParticipantEmails.has(p.email.trim().toLowerCase()) : false;
                return (
                  <label key={p.userId} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer ${alreadyParticipant ? 'opacity-50' : 'hover:bg-surface-container-low'}`}>
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary rounded flex-shrink-0"
                      checked={selectedIds.has(p.userId)}
                      disabled={alreadyParticipant}
                      onChange={() => toggle(p.userId)}
                    />
                    <Avatar name={p.fullName} email={p.email} avatarUrl={p.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-on-surface truncate">{p.fullName ?? 'Unnamed'}</p>
                      <p className="text-xs text-on-surface-variant truncate">{p.email}</p>
                    </div>
                    {alreadyParticipant && <span className="text-xs text-on-surface-variant flex-shrink-0">Already a participant</span>}
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex justify-between items-center pt-3 border-t border-outline-variant">
            <span className="text-xs text-on-surface-variant">{selectedIds.size} selected</span>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary disabled:opacity-50" disabled={selectedIds.size === 0 || submitting} onClick={handleSubmit}>
                {submitting ? 'Adding…' : `Add ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'results' && (
        <div className="space-y-3">
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {results.map((r, i) => (
              <p key={i} className={`text-sm ${r.status === 'failed' ? 'text-error' : 'text-on-surface'}`}>
                {describeParticipantMatchOutcome(r)}
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
