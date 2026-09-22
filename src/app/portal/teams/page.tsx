'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTeams, type Team } from '@/lib/useTeams';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/lib/supabaseClient';
import { CreateTeamModal } from '@/components/portal/CreateTeamModal';
import { TeamMembersModal } from '@/components/portal/TeamMembersModal';
import toast from 'react-hot-toast';

export default function TeamsPage() {
  const { organizationId, loading: orgLoading } = useOrganization();
  const { isGlobalAdmin } = useAuth();
  const { teams, loading, refetch } = useTeams(organizationId, orgLoading);
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [managingTeam, setManagingTeam] = useState<Team | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Feature 016 (Event Team Foundation Fix) — teams are now organisation-
  // owner/admin manageable, not only platform-admin manageable (the RLS fix
  // this pass added), so this page needs its own admin check to avoid
  // showing management controls that would 403 for an ordinary org member.
  const [canManageTeams, setCanManageTeams] = useState<boolean | null>(null);

  useEffect(() => {
    if (isGlobalAdmin) { setCanManageTeams(true); return; }
    if (!organizationId) return;
    let cancelled = false;
    supabase.rpc('is_organization_admin', { org_id: organizationId }).then(({ data, error }) => {
      if (!cancelled) setCanManageTeams(!error && data === true);
    });
    return () => { cancelled = true; };
  }, [organizationId, isGlobalAdmin]);

  const handleDelete = async (team: Team) => {
    const ok = await confirm({
      title: 'Delete team',
      message: `Delete "${team.name}"? This removes the team and its membership list — it does not remove anyone from events.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setDeletingId(team.id);
    const { error } = await supabase.from('teams').delete().eq('id', team.id);
    setDeletingId(null);

    if (error) toast.error(error.message);
    else { toast.success(`Team "${team.name}" deleted`); refetch(); }
  };

  return (
    <div>
      <div className="mb-lg flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Teams</h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            Reusable groups of organisation people — add a whole team to an event in one step from that event&apos;s
            Attendees &amp; Access page (Add People → From team).
          </p>
        </div>
        {canManageTeams && (
          <button className="btn-primary flex-shrink-0 flex items-center gap-2" onClick={() => setCreateOpen(true)} disabled={!organizationId}>
            <span className="material-symbols-outlined text-lg">add</span>
            Create Team
          </button>
        )}
      </div>

      {canManageTeams === false && (
        <p className="hint mb-4">
          You can view your organisation&apos;s teams. Creating, editing, or deleting a team requires organisation
          owner or admin access.
        </p>
      )}

      {loading || orgLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-surface-container-low rounded-[20px] animate-pulse" />)}
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow flex flex-col items-center text-center py-20 px-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <span className="material-symbols-outlined text-primary text-3xl">groups</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-2">No teams yet</h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm mb-5">
            Create a team to group people from this organisation — then add the whole team to an event in one step
            from that event&apos;s Attendees &amp; Access page.
          </p>
          {canManageTeams && <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create Team</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <div key={team.id} className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface truncate">{team.name}</h3>
                  {team.description && (
                    <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{team.description}</p>
                  )}
                </div>
                {canManageTeams && (
                  <button
                    className="flex-shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors"
                    onClick={() => handleDelete(team)}
                    disabled={deletingId === team.id}
                    aria-label={`Delete ${team.name}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                )}
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-sm">person</span>
                {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
              </div>

              {canManageTeams && (
                <button
                  className="btn-secondary mt-4 flex items-center justify-center gap-2 text-sm"
                  onClick={() => setManagingTeam(team)}
                >
                  <span className="material-symbols-outlined text-[18px]">group_add</span>
                  Manage Members
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {organizationId && (
        <CreateTeamModal
          open={createOpen}
          organizationId={organizationId}
          onClose={() => setCreateOpen(false)}
          onCreated={refetch}
        />
      )}

      {organizationId && managingTeam && (
        <TeamMembersModal
          team={managingTeam}
          organizationId={organizationId}
          onClose={() => setManagingTeam(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}
