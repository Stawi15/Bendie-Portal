'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getEventStatsMap, type EventStats } from '@/lib/eventStats';
import { EVENTS_SELECT_COLUMNS, EVENTS_SELECT_COLUMNS_WITH_PRODUCT_FILTER, type EventRow } from '@/lib/eventColumns';
import type { ProductKey } from '@/lib/productNavigation';

type Event = EventRow;

/**
 * Fetches every event for an organisation plus the batched per-event
 * stats (people count / setup progress) used by the Overview and Events
 * list pages. Shared so both stay in lockstep instead of duplicating the
 * fetch + batching logic.
 *
 * `product` (Feature 006, optional): when supplied, filters at the query
 * layer via an inner-join embed on `event_products` — never `event_planner_links`
 * (that table is Planner counterpart infrastructure, not product membership) —
 * so a Bendie-only/Planner-only/Both event is included or excluded exactly per
 * FR-022-FR-025, never fetched unfiltered and hidden client-side.
 */
export function useOrgEvents(organizationId: string | null, orgLoading: boolean, product?: ProductKey | null) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsMap, setStatsMap] = useState<Record<string, EventStats>>({});
  // Generation-ref guard (Feature 006, matching EventContext.tsx's established
  // pattern): a stale in-flight fetch for a superseded (organizationId, product)
  // pair must never overwrite state a newer request has already produced.
  const generationRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    const generation = ++generationRef.current;
    setLoading(true);

    const query = product
      ? supabase
          .from('events')
          .select(EVENTS_SELECT_COLUMNS_WITH_PRODUCT_FILTER)
          .eq('organization_id', organizationId)
          .eq('event_products.product_key', product)
          .order('starts_at', { ascending: false })
      : supabase
          .from('events')
          .select(EVENTS_SELECT_COLUMNS)
          .eq('organization_id', organizationId)
          .order('starts_at', { ascending: false });

    const { data, error } = await query;

    if (generationRef.current !== generation) return;

    if (error) {
      console.error(error);
      setEvents([]);
    } else {
      // Strip the embedded `event_products` filter artifact so EventRow's
      // shape stays identical whether or not `product` was passed.
      const rows = (data ?? []) as unknown as Array<Event & { event_products?: unknown }>;
      setEvents(rows.map(({ event_products: _eventProducts, ...event }) => event as Event));
    }
    setLoading(false);
  }, [organizationId, product]);

  useEffect(() => {
    if (orgLoading || !organizationId) return;
    refetch();
  }, [organizationId, orgLoading, product, refetch]);

  useEffect(() => {
    if (loading) return;
    if (events.length === 0) {
      setStatsMap({});
      return;
    }
    let cancelled = false;
    getEventStatsMap(events).then((map) => {
      if (!cancelled) setStatsMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [events, loading]);

  const addEvent = useCallback((event: Event) => {
    setEvents((prev) => [event, ...prev]);
  }, []);

  return { events, loading, statsMap, refetch, addEvent };
}
