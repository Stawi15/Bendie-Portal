'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';
import { Avatar } from '@/components/portal/Avatar';
import { FormModal } from '@/components/portal/FormModal';
import { friendlyError } from '@/lib/userFacingError';
import { useAuth } from '@/contexts/AuthContext';

export type ProfileFormValues = {
  full_name: string;
  email: string;
  phone: string;
  job_title: string;
  avatar_url: string;
  bio: string;
};

type EditProfileModalProps = {
  open: boolean;
  userId: string | null;
  initial: ProfileFormValues;
  onClose: () => void;
  onSaved: () => void;
  /**
   * Feature 019 — the organisation the person is being edited in. A client org
   * admin cannot update another user's `profiles` row from the browser (RLS: own
   * row or platform admin only), so their edits of colleagues go through
   * PATCH /api/organizations/[organizationId]/people/[userId] instead.
   */
  organizationId?: string | null;
};

export function EditProfileModal({ open, userId, initial, onClose, onSaved, organizationId }: EditProfileModalProps) {
  const { user, isGlobalAdmin } = useAuth();
  const [form, setForm] = useState<ProfileFormValues>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  if (!open || !userId) return null;

  const set = (field: keyof ProfileFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const editingSelf = user?.id === userId;
  // Email matches accounts across the Portal and Planner — only Stawi changes other people's.
  const canEditEmail = isGlobalAdmin || editingSelf;

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);

    if (!isGlobalAdmin && !editingSelf) {
      if (!organizationId) {
        setSaving(false);
        toast.error('Could not determine this person’s organisation — refresh and try again');
        return;
      }
      try {
        const res = await fetch(`/api/organizations/${organizationId}/people/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: form.full_name,
            phone: form.phone,
            job_title: form.job_title,
            avatar_url: form.avatar_url,
            bio: form.bio,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.message ?? 'Could not save — try again');
          return;
        }
      } catch {
        toast.error('Could not save — check your connection and try again');
        return;
      } finally {
        setSaving(false);
      }
      toast.success('Profile updated');
      onSaved();
      onClose();
      return;
    }

    const { data: updatedRows, error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        job_title: form.job_title.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        bio: form.bio.trim() || null,
      })
      .eq('id', userId)
      .select('id');
    setSaving(false);

    if (error) { toast.error(friendlyError(error)); return; }
    // RLS can filter an UPDATE to 0 rows without an error — never report a save that didn't happen.
    if (!updatedRows?.length) { toast.error('You don’t have permission to edit this profile'); return; }
    toast.success('Profile updated');
    onSaved();
    onClose();
  };

  return (
    <FormModal open={open} onClose={onClose} title="Edit Profile" maxWidthClassName="max-w-md">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={form.full_name} email={form.email} avatarUrl={form.avatar_url} size={48} />
            <div className="flex-1">
              <label className="label">Avatar URL</label>
              <input className="input" value={form.avatar_url} onChange={set('avatar_url')} placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="label">Full Name *</label>
            <input className="input" value={form.full_name} onChange={set('full_name')} placeholder="Jane Smith" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" disabled={!canEditEmail} />
            <p className="hint">
              {canEditEmail
                ? 'Contact email shown across the portal — this doesn\u2019t change their sign-in credentials.'
                : 'Only Stawi can change someone\u2019s email — it is how their account is matched across the Portal and Bendie Planner.'}
            </p>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+254 700 000000" />
          </div>
          <div>
            <label className="label">Job Title</label>
            <input className="input" value={form.job_title} onChange={set('job_title')} placeholder="Head of Product" />
          </div>
          <div>
            <label className="label">Bio</label>
            <textarea className="input h-20 resize-none" value={form.bio} onChange={set('bio')} placeholder="Short biography..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
          </div>
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-outline-variant">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
    </FormModal>
  );
}
