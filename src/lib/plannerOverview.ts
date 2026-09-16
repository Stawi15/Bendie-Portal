import 'server-only';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import { isPlannerProvisioningStale } from '@/lib/plannerProvisioningStaleness';

/**
 * Feature 005 — narrow, read-only Planner Overview data access. Deliberately not a
 * generic Planner repository: this module exposes exactly the two operations the
 * Planner Overview needs, each with an explicit column list, never `select('*')`
 * (FR-004, FR-015). Server-only (`server-only` guard, matching `plannerAdmin.ts`'s
 * convention) — must never be imported from a `'use client'` file.
 */

export type PlannerOverviewSummary = {
  event_title: string;
  description: string | null;
  location: string | null;
  setup_date: string | null;
  start_date: string | null;
  end_date: string | null;
  number_of_sessions: number;
  status: string;
};

/**
 * Reads the linked Bendie Planner event's identity + session summary from
 * `event_summary_realtime` — the only source verified (during `/speckit.clarify`)
 * to reliably provide one row per event, including zero-session events. Deliberately
 * does NOT read `session_status_realtime`/`session_summary_realtime`/
 * `overall_session_summary` (unreliable — a usable row for only one live event,
 * internally inconsistent even there) and does not attempt to reconstruct a
 * pending/active/completed breakdown from `production_tasks` (spec.md FR-003).
 *
 * Returns `null` when no row exists for this Planner event id (a dangling/
 * externally-deleted Planner event) — callers must treat that the same as "no
 * active counterpart" (`status: 'unavailable'`), never as a legitimate zero-session
 * read (data-model.md's precedence table, step 4).
 *
 * Throws on a genuine read failure (network/query error) — callers must catch this
 * and map it to `status: 'backend_error'`, logging the real error server-side only
 * and never returning it to the client (FR-006, FR-014).
 */
export async function getPlannerOverviewSummary(plannerEventId: number): Promise<PlannerOverviewSummary | null> {
  const planner = getPlannerAdminClient();

  const { data, error } = await planner
    .from('event_summary_realtime')
    .select('event_title, description, location, setup_date, start_date, end_date, number_of_sessions, status')
    .eq('event_id', plannerEventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export type PlannerOverviewStatus = 'ready' | 'pending' | 'stale' | 'failed' | 'unavailable';

/** Everything `resolvePlannerOverviewStatus` can determine WITHOUT knowing whether an
 * active counterpart link exists. `'needs-link-check'` is a sentinel meaning: the
 * event's provisioning status is `succeeded`, so the final answer depends on link
 * presence — the caller must resolve the canonical `event_planner_links` row and
 * finish the decision itself (or call `resolvePlannerOverviewStatus` with it). */
export type ProvisioningPhase = 'pending' | 'stale' | 'failed' | 'unavailable' | 'needs-link-check';

/**
 * The link-independent half of data-model.md's precedence table (review finding F5):
 * for `pending`/`provisioning`/`stale`/`failed`/the `not_required`-anomaly, the
 * outcome is fully determined by `planner_provisioning_status` alone — querying
 * `event_planner_links` for these cases would only ever discard the result, needlessly
 * widening the window in which the Portal service-role client is used. Callers should
 * evaluate this FIRST and only proceed to link resolution when it returns
 * `'needs-link-check'`.
 */
export function resolveProvisioningPhase(event: {
  planner_provisioning_status: string;
  planner_provisioning_last_attempted_at: string | null;
  created_at: string;
}): ProvisioningPhase {
  const status = event.planner_provisioning_status;

  if (status === 'pending' || status === 'provisioning') {
    return isPlannerProvisioningStale({
      planner_provisioning_status: status,
      planner_provisioning_last_attempted_at: event.planner_provisioning_last_attempted_at,
      created_at: event.created_at,
    })
      ? 'stale'
      : 'pending';
  }

  if (status === 'failed') return 'failed';

  if (status === 'succeeded') return 'needs-link-check';

  // 'not_required' (Bendie-only default) reached here despite an active Planner
  // product is itself an integrity anomaly — fail closed the same way a missing
  // link would (this function's caller is only ever reached once an active Planner
  // product has already been confirmed, so this status value here is unreachable
  // via any real code path).
  return 'unavailable';
}

/**
 * Implements data-model.md's provisioning/link-state precedence exactly: the
 * event's `planner_provisioning_status` is evaluated BEFORE the counterpart link's
 * presence — an active link is never treated as sufficient authority to load
 * Planner data once status says `failed`, and link presence is irrelevant while
 * status is still `pending`/`provisioning` (spec.md FR-017; quickstart.md §L,
 * combinations 4-5). Returns `'ready'` only when the caller should proceed to
 * `getPlannerOverviewSummary` — every other return value is itself the final
 * response status, with no Planner read attempted. This is read-only evaluation:
 * it never mutates `planner_provisioning_status` or `event_planner_links`.
 *
 * Building on `resolveProvisioningPhase` — kept as a single full-precedence entry
 * point (in addition to the staged one above) so the precedence table remains
 * testable as one unit against both inputs together (see
 * scratchpad/test-precedence.mjs and quickstart.md §K/§L).
 */
export function resolvePlannerOverviewStatus(
  event: {
    planner_provisioning_status: string;
    planner_provisioning_last_attempted_at: string | null;
    created_at: string;
  },
  activeLink: { planner_event_id: number } | null
): PlannerOverviewStatus {
  const phase = resolveProvisioningPhase(event);
  if (phase !== 'needs-link-check') return phase;

  // A succeeded event with no active link is an integrity anomaly (should not
  // occur via any real code path — provisionPlannerEvent only ever finalizes to
  // 'succeeded' once the link is written) — fail closed, never repair.
  return activeLink ? 'ready' : 'unavailable';
}
