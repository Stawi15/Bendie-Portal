'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { uploadOrganizationAsset, type OrganizationAsset } from '@/lib/assetUpload';
import toast from 'react-hot-toast';

type AssetPickerModalProps = {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onSelect: (url: string) => void;
};

export function AssetPickerModal({ open, organizationId, onClose, onSelect }: AssetPickerModalProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<OrganizationAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('organization_assets')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load assets');
        else setAssets((data ?? []) as OrganizationAsset[]);
        setLoading(false);
      });
  }, [open, organizationId]);

  if (!open) return null;

  const handleUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    const { data, error } = await uploadOrganizationAsset(organizationId, file, user?.id ?? null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (error || !data) {
      toast.error(error ?? 'Upload failed');
      return;
    }
    setAssets((prev) => [data, ...prev]);
    toast.success('Uploaded — selecting it now');
    onSelect(data.url);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Select an Asset</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            className="btn-secondary flex items-center gap-2 text-xs py-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <span className="material-symbols-outlined text-sm">upload</span>
            {uploading ? 'Uploading…' : 'Upload New'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px]">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-surface-container-low rounded-xl animate-pulse" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-12">
              No assets uploaded yet. Use &quot;Upload New&quot; above to add one.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => { onSelect(asset.url); onClose(); }}
                  className="border border-outline-variant rounded-xl overflow-hidden hover:border-primary transition-colors text-left"
                  title={asset.name}
                >
                  <div className="h-20 bg-surface-container-low flex items-center justify-center overflow-hidden">
                    <img src={asset.url} alt={asset.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <p className="text-xs text-on-surface-variant truncate px-2 py-1">{asset.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-outline-variant">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
