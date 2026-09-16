'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import type { EventRow } from '@/lib/eventColumns';
import { isPlannerProvisioningStale } from '@/lib/plannerProvisioningStaleness';

type Event = EventRow;

/**
 * Feature 004 minimal provisioning-status/retry affordance (tasks.md T060),
 * extended during the post-review corrective pass (R1) to distinguish a
 * `pending`/`provisioning` event that is recently/actively being worked on
 * from one that has been sitting that way long enough to likely be stuck
 * (e.g. a server crash mid-sequence, research.md §14 scenario 12). The
 * underlying CAS claim in plannerEventProvisioning.ts still only reclaims
 * from `pending`/`failed` — a stale `provisioning` row genuinely cannot be
 * retried from here, so no Retry button is ever shown for it; this is a
 * truthful-messaging correction only, not an automatic-reclaim mechanism
 * (explicitly out of scope for this correction, per research.md).
 *
 * Shows nothing for 'not_required' (Bendie-only) or 'succeeded' — only a
 * Planner/Both event that is pending, provisioning, or failed gets a
 * banner. Never shows raw diagnostic text (planner_provisioning_error is
 * not even customer-readable at the database level — see Feature 004's
 * column-privilege design); only the generic retry action is exposed here,
 * per FR-021's "DO NOT pretend creation completely failed" and FR-024's
 * "never raw diagnostics to the customer."
 */
export function PlannerProvisioningBanner({ event }: { event: Event }) {
  const [retrying, setRetrying] = useState(false);
  const status = event.planner_provisioning_status;

  if (status === 'not_required' || status === 'succeeded') return null;

  const stale =
    (status === 'pending' || status === 'provisioning') &&
    isPlannerProvisioningStale({
      planner_provisioning_status: status,
      planner_provisioning_last_attempted_at: event.planner_provisioning_last_attempted_at,
      created_at: event.created_at,
    });

  const handleRetry = async () => {
    setRetrying(true);
    const res = await fetch(`/api/events/${event.id}/retry-planner-provisioning`, { method: 'POST' });
    const result = await res.json().catch(() => ({}));
    setRetrying(false);

    if (!res.ok) {
      toast.error(result.message || result.error || 'Retry failed — try again');
      return;
    }
    if (result.plannerProvisioningStatus === 'succeeded') {
      toast.success('Bendie Planner setup completed');
      window.location.reload();
    } else {
      toast.error('Bendie Planner setup still didn’t complete — try again, or contact support if this keeps happening.');
    }
  };

  const copy = status === 'failed'
    ? 'Bendie Planner setup didn’t complete — try again, or contact support if this keeps happening.'
    : stale
      ? 'Bendie Planner setup is taking longer than expected. Please contact your administrator or support for assistance.'
      : 'Setting up Bendie Planner for this event…';

  const icon = status === 'failed' ? 'error' : stale ? 'support_agent' : 'hourglass_top';

  // A stale `pending`/`provisioning` row cannot be safely retried from
  // here — the backend's CAS claim only reclaims from `pending`/`failed`,
  // and a row that never actually stalled at `pending` (i.e. is still
  // `provisioning`) offering a Retry button would either no-op
  // (`409 provisioning_in_progress`) or, worse, imply a capability that
  // doesn't exist. Only a genuinely `failed` event gets the Retry action.
  const showRetry = status === 'failed';

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-amber-600">{icon}</span>
        <p className="text-sm text-amber-800">{copy}</p>
      </div>
      {showRetry && (
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="btn-secondary flex-shrink-0"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
