'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';
import { Avatar } from '@/components/portal/Avatar';
import { ORG_ROLE_LABELS } from '@/lib/portalLabels';

type ProfileResult = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type AddPersonModalProps = {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onAdded: () => void;
};

export const ORG_ROLES = ['member', 'admin', 'attendee', 'facilitator', 'staff'];

export function AddPersonModal({ open, organizationId, onClose, onAdded }: AddPersonModalProps) {
  const [mode, setMode] = useState<'search' | 'create'>('search');

  // Search-existing mode
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Create-new mode
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const resetAll = () => {
    setMode('search');
    setQuery('');
    setResults([]);
    setSearched(false);
    setNewName('');
    setNewEmail('');
    setNewRole('member');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .ilike('email', `%${query.trim()}%`)
      .limit(5);
    setSearching(false);

    if (error) {
      toast.error('Search failed');
      console.error(error);
      return;
    }
    setResults(data ?? []);
  };

  const handleAdd = async (profile: ProfileResult) => {
    setAddingId(profile.id);
    const { error } = await supabase
      .from('organization_members')
      .insert({ organization_id: organizationId, user_id: profile.id, role: 'member' });
    setAddingId(null);

    if (error) {
      if (error.code === '23505') {
        toast.error(`${profile.full_name ?? profile.email} is already in this organisation`);
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success(`${profile.full_name ?? profile.email} added to the organisation`);
    setResults((prev) => prev.filter((p) => p.id !== profile.id));
    onAdded();
  };

  const handleCreateUser = async () => {
    if (!newEmail.trim()) { toast.error('Email is required'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          fullName: newName.trim(),
          organizationId,
          orgRole: newRole,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? 'Failed to create user');
        return;
      }
      toast.success(`${newName.trim() || newEmail.trim()} created — add them to an event below to grant access.`);
      setNewName('');
      setNewEmail('');
      setNewRole('member');
      onAdded();
    } catch (err) {
      toast.error('Failed to create user');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">Add Person</h2>

        <div className="flex gap-1 mb-4 bg-surface-container-low rounded-xl p-1">
          <button
            onClick={() => setMode('search')}
            className={`flex-1 text-sm font-medium py-1.5 rounded-lg transition-colors ${
              mode === 'search' ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant'
            }`}
          >
            Search Existing
          </button>
          <button
            onClick={() => setMode('create')}
            className={`flex-1 text-sm font-medium py-1.5 rounded-lg transition-colors ${
              mode === 'create' ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant'
            }`}
          >
            Create New User
          </button>
        </div>

        {mode === 'search' ? (
          <>
            <p className="hint mb-3">Search by email for an existing account.</p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="name@example.com"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn-secondary flex-shrink-0" onClick={handleSearch} disabled={searching}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
              {searched && !searching && results.length === 0 && (
                <p className="text-sm text-on-surface-variant text-center py-4">
                  No matching accounts found. Try &quot;Create New User&quot; instead.
                </p>
              )}
              {results.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-surface-container-low"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={profile.full_name} email={profile.email} avatarUrl={profile.avatar_url} size={32} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {profile.full_name ?? 'Unnamed'}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">{profile.email}</p>
                    </div>
                  </div>
                  <button
                    className="btn-primary flex-shrink-0 text-xs py-1.5"
                    onClick={() => handleAdd(profile)}
                    disabled={addingId === profile.id}
                  >
                    {addingId === profile.id ? 'Adding…' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="hint mb-3">
              Creates their account — no email is sent. They log into the app directly; access to an
              event is granted the moment you add them to it (use the Events column on the People page
              or the event&apos;s Members tab).
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="label">Email *</label>
                <input
                  className="input"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label className="label">Organisation Role</label>
                <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {ORG_ROLES.map((r) => (
                    <option key={r} value={r}>{ORG_ROLE_LABELS[r] ?? r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button className="btn-primary" onClick={handleCreateUser} disabled={creating}>
                {creating ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </>
        )}

        <div className="flex justify-end mt-6 pt-4 border-t border-outline-variant">
          <button className="btn-secondary" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
