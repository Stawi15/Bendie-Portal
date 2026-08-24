'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Avatar } from '@/components/portal/Avatar';
import type { Team } from '@/lib/useTeams';
import toast from 'react-hot-toast';

type MemberRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type TeamMembersModalProps = {
  team: Team | null;
  organizationId: string;
  onClose: () => void;
  onChanged: () => void;
};

export function TeamMembersModal({ team, organizationId, onClose, onChanged }: TeamMembersModalProps) {
  const confirm = useConfirm();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [candidates, setCandidates] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!team) return;
    setLoading(true);

    const [memberRes, orgRes] = await Promise.all([
      supabase
        .from('team_members')
        .select('user_id, profiles:user_id(full_name, email, avatar_url)')
        .eq('team_id', team.id),
      supabase
        .from('organization_members')
        .select('user_id, profiles:user_id(full_name, email, avatar_url)')
        .eq('organization_id', organizationId),
    ]);

    type Raw = { user_id: string; profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null };

    const memberRows = ((memberRes.data as unknown as Raw[]) ?? []).map((r) => ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name ?? null,
      email: r.profiles?.email ?? null,
      avatar_url: r.profiles?.avatar_url ?? null,
    }));
    const memberIds = new Set(memberRows.map((m) => m.user_id));

    const orgRows = ((orgRes.data as unknown as Raw[]) ?? []).map((r) => ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name ?? null,
      email: r.profiles?.email ?? null,
      avatar_url: r.profiles?.avatar_url ?? null,
    }));

    setMembers(memberRows);
    setCandidates(orgRows.filter((p) => !memberIds.has(p.user_id)));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [team?.id]);

  if (!team) return null;

  const handleAdd = async (person: MemberRow) => {
    setAddingId(person.user_id);
    const { error } = await supabase.from('team_members').insert({ team_id: team.id, user_id: person.user_id });
    setAddingId(null);
    if (error) { toast.error(error.message); return; }
    setMembers((prev) => [...prev, person]);
    setCandidates((prev) => prev.filter((p) => p.user_id !== person.user_id));
    onChanged();
  };

  const handleRemove = async (person: MemberRow) => {
    const ok = await confirm({
      title: 'Remove from team',
      message: `Remove ${person.full_name ?? person.email} from "${team.name}"?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;

    setRemovingId(person.user_id);
    const { error } = await supabase.from('team_members').delete().eq('team_id', team.id).eq('user_id', person.user_id);
    setRemovingId(null);
    if (error) { toast.error(error.message); return; }
    setMembers((prev) => prev.filter((p) => p.user_id !== person.user_id));
    setCandidates((prev) => [...prev, person]);
    onChanged();
  };

  const filteredCandidates = candidates.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="mb-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{team.name}</h2>
          {team.description && <p className="hint mt-0.5">{team.description}</p>}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-container-low rounded-xl" />)}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-5">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                Members ({members.length})
              </p>
              {members.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-2">No members yet — add people below.</p>
              ) : (
                <div className="space-y-1">
                  {members.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-surface-container-low">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={m.full_name} email={m.email} avatarUrl={m.avatar_url} size={28} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">{m.full_name ?? 'Unnamed'}</p>
                          <p className="text-xs text-on-surface-variant truncate">{m.email}</p>
                        </div>
                      </div>
                      <button
                        className="flex-shrink-0 text-xs text-error font-medium px-2 py-1 rounded-lg hover:bg-error/5"
                        onClick={() => handleRemove(m)}
                        disabled={removingId === m.user_id}
                      >
                        {removingId === m.user_id ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Add People</p>
              <input
                className="input mb-2"
                placeholder="Search organisation members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredCandidates.length === 0 ? (
                  <p className="text-sm text-on-surface-variant py-2">
                    {candidates.length === 0 ? 'Everyone in this organisation is already in this team.' : 'No matches.'}
                  </p>
                ) : (
                  filteredCandidates.map((p) => (
                    <div key={p.user_id} className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-surface-container-low">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={p.full_name} email={p.email} avatarUrl={p.avatar_url} size={28} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">{p.full_name ?? 'Unnamed'}</p>
                          <p className="text-xs text-on-surface-variant truncate">{p.email}</p>
                        </div>
                      </div>
                      <button
                        className="flex-shrink-0 text-xs text-primary font-medium px-2 py-1 rounded-lg hover:bg-primary/5"
                        onClick={() => handleAdd(p)}
                        disabled={addingId === p.user_id}
                      >
                        {addingId === p.user_id ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4 pt-4 border-t border-outline-variant">
          <button className="btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
