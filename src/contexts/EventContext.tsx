'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getAccessibleEvents } from '@/lib/portalAuth';
import type { Database } from '@/types/database';

type Event = Database['public']['Tables']['events']['Row'];

export interface EventContextType {
  currentEventId: string | null;
  currentEvent: Event | null;
  events: Event[];
  loading: boolean;
  error: string | null;
  setCurrentEvent: (eventId: string) => Promise<void>;
  refreshEvent: () => Promise<void>;
}

export const EventContext = createContext<EventContextType | undefined>(undefined);

export const EventProvider = ({ children }: { children: ReactNode }) => {
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load accessible events on mount
  useEffect(() => {
    const loadEvents = async () => {
      try {
        setLoading(true);
        setError(null);
        const accessibleEvents = await getAccessibleEvents();

        if (accessibleEvents.length > 0) {
          // Set events and default to first one
          const fullEvents: Event[] = accessibleEvents.map(
            (e) =>
              ({
                id: e.id,
                name: e.name,
                status: e.status as 'draft' | 'published' | 'active' | 'completed' | 'archived',
                starts_at: e.starts_at,
              }) as Event
          );

          setEvents(fullEvents);
          setCurrentEventId(accessibleEvents[0].id);

          // Fetch full event details
          const { data: fullEventData, error: fetchError } = await supabase
            .from('events')
            .select('*')
            .eq('id', accessibleEvents[0].id)
            .single();

          if (fetchError) {
            setError('Failed to load event details');
            console.error(fetchError);
          } else {
            setCurrentEvent(fullEventData);
          }
        } else {
          setError('No accessible events found');
        }
      } catch (err) {
        setError('Error loading events');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  const handleSetCurrentEvent = useCallback(async (eventId: string) => {
    try {
      setLoading(true);
      setError(null);
      setCurrentEventId(eventId);

      // Fetch full event details
      const { data: fullEventData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (fetchError) {
        setError('Failed to load event details');
        console.error(fetchError);
      } else {
        setCurrentEvent(fullEventData);
      }
    } catch (err) {
      setError('Error switching events');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshEvent = useCallback(async () => {
    if (!currentEventId) return;

    try {
      setLoading(true);
      const { data: fullEventData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('id', currentEventId)
        .single();

      if (fetchError) {
        setError('Failed to refresh event');
        console.error(fetchError);
      } else {
        setCurrentEvent(fullEventData);
      }
    } catch (err) {
      setError('Error refreshing event');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentEventId]);

  return (
    <EventContext.Provider
      value={{
        currentEventId,
        currentEvent,
        events,
        loading,
        error,
        setCurrentEvent: handleSetCurrentEvent,
        refreshEvent,
      }}
    >
      {children}
    </EventContext.Provider>
  );
};

export const useEvent = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvent must be used within EventProvider');
  }
  return context;
};
