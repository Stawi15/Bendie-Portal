'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { organizationPeopleContacts } from '@/lib/profileContacts';
import type { OrgPersonRow } from '@/components/portal/OrgPeoplePanel';

type UseOrgPeopleOptions = {
  /** Cap the number of rows fetched (used for the Overview preview); omit for the full People list. */
  limit?: number;
};

type PreviewRow = {
  user_id: string;
  role: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
    last_seen_at: string | null;
    job_title: string | null;
    bio: string | null;
  } | null;
};

/**
 * Fetches org members joined to profiles, plus their cross-event
 * assignments (event_members roles). Shared by the Overview preview and
 * the full People page so both stay in lockstep.
 */
export function useOrgPeople(organizationId: string | null, orgLoading: boolean, options: UseOrgPeopleOptions = {}) {
  const { limit } = options;
  const [people, setPeople] = useState<OrgPersonRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [elevatedCount, setElevatedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    let membersQuery = supabase
      .from('organization_members')
      .select(
        // Feature 027 (C1): email/phone/global_role come from the org-scoped contacts route.
        'user_id, role, created_at, profiles:user_id(full_name, avatar_url, last_seen_at, job_title, bio)',
        { count: 'exact' }
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (limit) membersQuery = membersQuery.range(0, limit - 1);

    const [membersRes, elevatedRes, orgContacts] = await Promise.all([
      membersQuery,
      supabase
        .from('organization_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('role', ['owner', 'admin']),
      organizationPeopleContacts(organizationId),
    ]);

    const rows = (membersRes.data as unknown as PreviewRow[]) ?? [];
    const userIds = rows.map((r) => r.user_id);

    const eventIdsByUser: Record<string, string[]> = {};
    if (userIds.length > 0) {
      const { data: memberRows } = await supabase
        .from('event_members')
        .select('user_id, event_id')
        .eq('organization_id', organizationId)
        .in('user_id', userIds);

      for (const row of (memberRows as { user_id: string; event_id: string }[]) ?? []) {
        if (!eventIdsByUser[row.user_id]) eventIdsByUser[row.user_id] = [];
        eventIdsByUser[row.user_id].push(row.event_id);
      }
    }

    setPeople(
      rows.map((r) => ({
        userId: r.user_id,
        fullName: r.profiles?.full_name ?? null,
        email: orgContacts.contacts.get(r.user_id)?.email ?? null,
        contactLoaded: orgContacts.contacts.has(r.user_id),
        avatarUrl: r.profiles?.avatar_url ?? null,
        orgRole: r.role,
        globalRole: orgContacts.globalRoles?.get(r.user_id) ?? 'attendee',
        lastSeenAt: r.profiles?.last_seen_at ?? null,
        phone: orgContacts.contacts.get(r.user_id)?.phone ?? null,
        jobTitle: r.profiles?.job_title ?? null,
        bio: r.profiles?.bio ?? null,
        assignedEventIds: eventIdsByUser[r.user_id] ?? [],
      }))
    );
    setTotal(membersRes.count ?? 0);
    setElevatedCount(elevatedRes.count ?? 0);
    setLoading(false);
  }, [organizationId, limit]);

  useEffect(() => {
    if (orgLoading || !organizationId) return;
    refetch();
  }, [organizationId, orgLoading, refetch]);

  return { people, total, elevatedCount, loading, refetch };
}
