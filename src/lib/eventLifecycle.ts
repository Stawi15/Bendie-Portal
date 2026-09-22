import type { EventRow } from '@/lib/eventColumns';

/**
 * Navigation pass (016 continuation 4) — canonical, single-source event
 * lifecycle derivation, replacing the compound `status === 'published' &&
 * starts_at > now`-style logic that was previously duplicated, identically,
 * in `EventsOverviewPanel.tsx` and `OrganizationHome.tsx`.
 *
 * `events.status` (live-verified: `text NOT NULL CHECK (status IN
 * ('draft','published','active','completed','archived'))`) is a single,
 * fully manual field — nothing in the application auto-transitions it based
 * on `starts_at`/`ends_at`. That created a real, reproducible gap: a
 * `published` event whose date range had already passed, but that nobody
 * had manually re-marked, matched neither the "Upcoming" (date passed) nor
 * "Live" (status still `published`, not `active`) tab/count anywhere —
 * it only ever surfaced under "All," still labeled "Published," forever.
 *
 * This function is the one place that gap is closed. `draft`/`archived`/
 * `completed` always win outright — those are terminal, deliberate human
 * decisions never second-guessed by a date comparison. `published` and
 * `active` are each refined by `ends_at` when it has clearly passed: a
 * live-verified read of real production data (2026-09-22) found the exact
 * same staleness pattern on BOTH values, not just `published` — the large
 * majority of `active`-status events in the database have an `ends_at` from
 * weeks or months earlier (nobody had manually re-marked them), so an
 * `ends_at`-passed check applies identically to both rather than only fixing
 * the `published` case and leaving `active` with the same bug. A currently-
 * running, future, or genuinely dateless `active` event is never touched —
 * only one whose own recorded end date has unambiguously passed.
 */
export type EventLifecycle = 'draft' | 'published' | 'upcoming' | 'active' | 'completed' | 'archived';

export const EVENT_LIFECYCLE_LABELS: Record<EventLifecycle, string> = {
  draft: 'Draft',
  published: 'Published',
  upcoming: 'Upcoming',
  active: 'Live',
  completed: 'Completed',
  archived: 'Archived',
};

export const EVENT_LIFECYCLE_PILL_CLASSES: Record<EventLifecycle, string> = {
  draft: 'bg-surface-container-high text-on-surface-variant',
  published: 'bg-primary/10 text-primary',
  upcoming: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-surface-container-high text-on-surface-variant',
  archived: 'bg-surface-container-high text-on-surface-variant',
};

export function deriveEventLifecycle(event: Pick<EventRow, 'status' | 'starts_at' | 'ends_at'>, now: Date = new Date()): EventLifecycle {
  const status = event.status;
  // Terminal, deliberate human decisions always win — never overridden by a date guess.
  if (status === 'draft') return 'draft';
  if (status === 'archived') return 'archived';
  if (status === 'completed') return 'completed';

  const end = event.ends_at ? new Date(event.ends_at) : null;

  if (status === 'active') {
    // A manually-marked "Live" event whose own recorded end date has
    // unambiguously passed is stale, not actually live — reclassify as
    // completed rather than leaving it "Live" forever (live-verified: this
    // is the majority case in real production data, not a rare edge case).
    if (end && now > end) return 'completed';
    return 'active';
  }

  // status === 'published' — the only state with no explicit lifecycle
  // opinion of its own, so (and only so) this is where dates refine it.
  if (!event.starts_at) return 'published'; // no date evidence to derive from
  const start = new Date(event.starts_at);
  if (now < start) return 'upcoming';
  if (end && now > end) return 'completed'; // date evidence the window has passed — the gap this helper fixes
  return 'active'; // within the date window (or started with no end date, not yet ended)
}
