'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import type { Database } from '@/types/database';

type Organization = Database['public']['Tables']['organizations']['Row'];

type CreateOrganizationModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (organization: Organization) => void;
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

export function CreateOrganizationModal({ open, onClose, onCreated }: CreateOrganizationModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    onClose();
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugTouched(true);
    setSlug(slugify(e.target.value));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Organisation name is required'); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        slug: slug.trim() || null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    setSaving(false);

    if (error) {
      if (error.code === '23505') toast.error('That slug is already taken — try a different one.');
      else toast.error(error.message);
      return;
    }

    toast.success('Organisation created');
    onCreated(data);
    setName('');
    setSlug('');
    setSlugTouched(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">New Organisation</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Organisation name *</label>
            <input className="input" value={name} onChange={handleNameChange} placeholder="e.g. Old Mutual" />
          </div>
          <div>
            <label className="label">Slug</label>
            <input className="input font-mono text-sm" value={slug} onChange={handleSlugChange} placeholder="old-mutual" />
            <p className="hint">Used in URLs — auto-generated from the name, but you can override it.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create Organisation'}
          </button>
        </div>
      </div>
    </div>
  );
}
