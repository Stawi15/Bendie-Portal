'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getEventStatsMap, type EventStats } from '@/lib/eventStats';
import type { Database } from '@/types/database';

type Event = Database['public']['Tables']['events']['Row'];

/**
 * Fetches every event for an organisation plus the batched per-event
 * stats (people count / setup progress) used by the Overview and Events
 * list pages. Shared so both stay in lockstep instead of duplicating the
 * fetch + batching logic.
 */
export function useOrgEvents(organizationId: string | null, orgLoading: boolean) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsMap, setStatsMap] = useState<Record<string, EventStats>>({});

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', organizationId)
      .order('starts_at', { ascending: false });

    if (error) {
      console.error(error);
      setEvents([]);
    } else {
      setEvents(data ?? []);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (orgLoading || !organizationId) return;
    refetch();
  }, [organizationId, orgLoading, refetch]);

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
