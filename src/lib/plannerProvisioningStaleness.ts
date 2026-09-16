/**
 * Feature 004 — post-review corrective pass (R1). Central definition of what
 * "stuck" means for a `pending`/`provisioning` event, so the threshold isn't
 * scattered as a magic number wherever it's checked.
 *
 * Provisioning is designed to be a single, bounded, synchronous operation —
 * one Portal transaction plus at most two Planner-side round trips plus one
 * Portal write (plan.md's "Performance Goals") — so a genuinely healthy
 * attempt completes in seconds, not minutes. A `pending`/`provisioning` row
 * still untouched after this threshold is far more likely a crashed/lost
 * attempt (research.md §14 scenario 12) than one still legitimately working.
 *
 * This does NOT enable any automatic reclaim — the CAS claim in
 * plannerEventProvisioning.ts still only reclaims from `pending`/`failed`,
 * unchanged. This threshold drives customer-facing messaging only: telling
 * the truth about "this looks stuck" instead of showing an indefinite
 * "in progress" message forever. A genuinely stuck row still requires
 * manual/admin database intervention to resolve (documented limitation,
 * research.md §14 scenario 12 / §16).
 */
export const PLANNER_PROVISIONING_STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

export function isPlannerProvisioningStale(event: {
  planner_provisioning_status: string;
  planner_provisioning_last_attempted_at: string | null;
  created_at: string;
}): boolean {
  if (event.planner_provisioning_status !== 'pending' && event.planner_provisioning_status !== 'provisioning') {
    return false;
  }
  // `pending` events that were never actually attempted (e.g. the request
  // handler crashed before calling provisionPlannerEvent at all) have no
  // last_attempted_at yet — created_at is the next-best staleness anchor.
  const referenceIso = event.planner_provisioning_last_attempted_at ?? event.created_at;
  const referenceMs = new Date(referenceIso).getTime();
  if (Number.isNaN(referenceMs)) return false;
  return Date.now() - referenceMs > PLANNER_PROVISIONING_STALE_AFTER_MS;
}
