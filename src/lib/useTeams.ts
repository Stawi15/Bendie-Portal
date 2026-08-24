'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type Team = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  memberCount: number;
};

export function useTeams(organizationId: string | null, orgLoading: boolean) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    const { data: teamRows, error } = await supabase
      .from('teams')
      .select('id, organization_id, name, description')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (error || !teamRows) {
      setTeams([]);
      setLoading(false);
      return;
    }

    const teamIds = teamRows.map((t) => t.id);
    const countsByTeam: Record<string, number> = {};
    if (teamIds.length > 0) {
      const { data: memberRows } = await supabase.from('team_members').select('team_id').in('team_id', teamIds);
      for (const row of (memberRows as { team_id: string }[]) ?? []) {
        countsByTeam[row.team_id] = (countsByTeam[row.team_id] ?? 0) + 1;
      }
    }

    setTeams(
      teamRows.map((t) => ({
        id: t.id,
        organizationId: t.organization_id,
        name: t.name,
        description: t.description,
        memberCount: countsByTeam[t.id] ?? 0,
      }))
    );
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (orgLoading || !organizationId) return;
    refetch();
  }, [organizationId, orgLoading, refetch]);

  return { teams, loading, refetch };
}
