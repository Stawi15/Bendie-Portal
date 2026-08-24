'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

type CreateTeamModalProps = {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateTeamModal({ open, organizationId, onClose, onCreated }: CreateTeamModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Team name is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('teams').insert({
      organization_id: organizationId,
      name: name.trim(),
      description: description.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);

    if (error) { toast.error(error.message); return; }
    toast.success(`Team "${name.trim()}" created`);
    handleClose();
    onCreated();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">Create Team</h2>
        <div className="space-y-3">
          <div>
            <label className="label">Team Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Logistics Crew" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input h-20 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this team is responsible for"
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant">
          <button className="btn-secondary" onClick={handleClose}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  );
}
