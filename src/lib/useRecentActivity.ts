'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { emailsForUnnamed } from '@/lib/profileContacts';

export type ActivityEntry = {
  id: string;
  tableName: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  createdAt: string;
  actorName: string | null;
  message: string;
};

type RawDiff = Record<string, unknown> | null;

function describe(tableName: string, action: string, diff: RawDiff): string {
  const name = diff && typeof diff.name === 'string' ? diff.name : null;

  switch (tableName) {
    case 'teams':
      if (action === 'INSERT') return `created the team "${name ?? 'Untitled'}"`;
      if (action === 'DELETE') return `deleted the team "${name ?? 'Untitled'}"`;
      return `updated the team "${name ?? 'Untitled'}"`;
    case 'team_members':
      return action === 'INSERT' ? 'added someone to a team' : 'removed someone from a team';
    case 'organization_assets':
      return action === 'INSERT' ? `uploaded the asset "${name ?? 'file'}"` : `deleted the asset "${name ?? 'file'}"`;
    default:
      return `${action.toLowerCase()}d ${tableName}`;
  }
}

const LAST_SEEN_PREFIX = 'bendie_activity_last_seen_';

export function useRecentActivity(organizationId: string | null, orgLoading: boolean) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const lastSeenKey = organizationId ? `${LAST_SEEN_PREFIX}${organizationId}` : null;

  const fetchEntries = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('organization_audit_log')
      .select('id,table_name,action,diff,created_at,actor_user_id,profiles:actor_user_id(full_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !data) {
      setEntries([]);
      setLoading(false);
      return;
    }

    type Raw = {
      id: string;
      table_name: string;
      action: 'INSERT' | 'UPDATE' | 'DELETE';
      diff: RawDiff;
      created_at: string;
      actor_user_id: string | null;
      profiles: { full_name: string | null } | null;
    };
    // Feature 027 (C1): an unnamed actor's email via get_profile_contact (Bendie's rule applies).
    const actorEmails = await emailsForUnnamed(supabase, (data as unknown as Raw[]).map((r) => ({ id: r.actor_user_id, fullName: r.profiles?.full_name })));

    const mapped = (data as unknown as Raw[]).map((r) => ({
      id: r.id,
      tableName: r.table_name,
      action: r.action,
      createdAt: r.created_at,
      actorName: r.profiles?.full_name ?? (r.actor_user_id ? actorEmails.get(r.actor_user_id) : undefined) ?? null,
      message: describe(r.table_name, r.action, r.diff),
    }));

    setEntries(mapped);

    if (lastSeenKey) {
      const lastSeen = localStorage.getItem(lastSeenKey);
      const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
      setUnreadCount(mapped.filter((e) => new Date(e.createdAt).getTime() > lastSeenTime).length);
    }

    setLoading(false);
  }, [organizationId, lastSeenKey]);

  useEffect(() => {
    if (orgLoading) return;
    fetchEntries();
  }, [orgLoading, fetchEntries]);

  const markAllRead = useCallback(() => {
    if (!lastSeenKey) return;
    localStorage.setItem(lastSeenKey, new Date().toISOString());
    setUnreadCount(0);
  }, [lastSeenKey]);

  return { entries, loading, unreadCount, refetch: fetchEntries, markAllRead };
}
