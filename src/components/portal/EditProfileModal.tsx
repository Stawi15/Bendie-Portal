'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';
import { Avatar } from '@/components/portal/Avatar';
import { FormModal } from '@/components/portal/FormModal';

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
};

export function EditProfileModal({ open, userId, initial, onClose, onSaved }: EditProfileModalProps) {
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

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        job_title: form.job_title.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        bio: form.bio.trim() || null,
      })
      .eq('id', userId);
    setSaving(false);

    if (error) { toast.error(error.message); return; }
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
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" />
            <p className="hint">Contact email shown across the portal — this doesn&apos;t change their sign-in credentials.</p>
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
