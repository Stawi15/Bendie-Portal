import { supabase } from '@/lib/supabaseClient';
import type { EventRow } from '@/lib/eventColumns';

type Event = EventRow;

export type EventStats = {
  peopleCount: number;
  progress: number;
};

const PROGRESS_RELATED_TABLES = ['facilitators', 'agenda_sessions', 'emergency_contacts', 'faqs'] as const;

async function batchCountByEventId(table: string, eventIds: string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};

  const { data, error } = await supabase.from(table).select('event_id').in('event_id', eventIds);
  if (error || !data) {
    console.error(`Failed to batch-count ${table}`, error);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data as { event_id: string | null }[]) {
    if (!row.event_id) continue;
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Batched people-count + setup-progress heuristic for a list of events.
 * Progress = fraction of 8 checks passed (4 event fields + 4 related-table
 * counts), each fetched once for the whole list rather than per row.
 */
export async function getEventStatsMap(events: Event[]): Promise<Record<string, EventStats>> {
  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return {};

  const [peopleCounts, ...relatedCounts] = await Promise.all([
    batchCountByEventId('event_members', eventIds),
    ...PROGRESS_RELATED_TABLES.map((table) => batchCountByEventId(table, eventIds)),
  ]);

  const relatedCountsByTable = Object.fromEntries(
    PROGRESS_RELATED_TABLES.map((table, i) => [table, relatedCounts[i]])
  ) as Record<(typeof PROGRESS_RELATED_TABLES)[number], Record<string, number>>;

  const stats: Record<string, EventStats> = {};
  for (const event of events) {
    const checks = [
      Boolean(event.description),
      Boolean(event.location),
      Boolean(event.hero_image_url),
      Boolean(event.theme_primary),
      (relatedCountsByTable.facilitators[event.id] ?? 0) > 0,
      (relatedCountsByTable.agenda_sessions[event.id] ?? 0) > 0,
      (relatedCountsByTable.emergency_contacts[event.id] ?? 0) > 0,
      (relatedCountsByTable.faqs[event.id] ?? 0) > 0,
    ];
    const progress = Math.round((checks.filter(Boolean).length / checks.length) * 100);

    stats[event.id] = {
      peopleCount: peopleCounts[event.id] ?? 0,
      progress,
    };
  }

  return stats;
}
