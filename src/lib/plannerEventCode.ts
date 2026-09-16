/**
 * Deterministic, collision-proof Planner event_code for a given Portal
 * event (Feature 004). Derived solely from the Portal event's own stable
 * `events.id` -- never its title/name -- so the exact same code is
 * produced on every provisioning attempt or retry for that event, and
 * doubles as the Planner-side idempotency lookup key (research.md §8/§10).
 *
 * Collision-proof by construction, not merely resistant: it embeds a value
 * (`events.id`) that is already globally unique as Portal's own primary
 * key, so there is no residual collision probability to reason about.
 * Planner's `event_code` column is `text` with no length limit (live-
 * verified), so the full UUID form needs no truncation.
 */
export function plannerEventCode(portalEventId: string): string {
  return `PORTAL-${portalEventId}`;
}
