'use client';

import { useEffect, useRef, useState } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/lib/supabaseClient';
import { uploadOrganizationAsset, deleteOrganizationAsset, type OrganizationAsset } from '@/lib/assetUpload';
import toast from 'react-hot-toast';

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AssetsPage() {
  const { organizationId, loading: orgLoading } = useOrganization();
  const { user } = useAuth();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<OrganizationAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAssets = async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('organization_assets')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load assets');
    else setAssets((data ?? []) as OrganizationAsset[]);
    setLoading(false);
  };

  useEffect(() => {
    if (orgLoading) return;
    fetchAssets();
  }, [organizationId, orgLoading]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !organizationId) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      const { error } = await uploadOrganizationAsset(organizationId, file, user?.id ?? null);
      if (error) toast.error(`${file.name}: ${error}`);
      else successCount++;
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
      fetchAssets();
    }
  };

  const handleDelete = async (asset: OrganizationAsset) => {
    const ok = await confirm({
      title: 'Delete asset',
      message: `Delete "${asset.name}"? This cannot be undone, and any Hero & Branding fields currently using this image will break.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setDeletingId(asset.id);
    const { error } = await deleteOrganizationAsset(asset);
    setDeletingId(null);

    if (error) toast.error(error);
    else {
      toast.success('Asset deleted');
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    }
  };

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success('URL copied');
  };

  return (
    <div>
      <div className="mb-lg flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Assets</h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            A shared library for organisation-wide media and files. Upload images here, then pick them from
            the Hero &amp; Branding tab on any event.
          </p>
        </div>
        <div className="flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !organizationId}
          >
            <span className="material-symbols-outlined text-lg">upload</span>
            {uploading ? 'Uploading…' : 'Upload Assets'}
          </button>
        </div>
      </div>

      {loading || orgLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-surface-container-low rounded-[20px] animate-pulse" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow flex flex-col items-center text-center py-20 px-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <span className="material-symbols-outlined text-primary text-3xl">inventory_2</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-2">No assets yet</h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
            Upload logos, banners, and other images here to reuse them across your events&apos; Hero &amp; Branding
            settings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden group"
            >
              <div className="h-28 bg-surface-container-low flex items-center justify-center overflow-hidden">
                <img src={asset.url} alt={asset.name} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-on-surface truncate" title={asset.name}>
                  {asset.name}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">{formatSize(asset.size_bytes)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    title="Copy URL"
                    className="text-xs text-primary font-medium flex items-center gap-1"
                    onClick={() => handleCopyUrl(asset.url)}
                  >
                    <span className="material-symbols-outlined text-sm">content_copy</span>
                    <span className="hidden sm:inline">Copy URL</span>
                  </button>
                  <button
                    title="Delete"
                    className="text-xs text-error font-medium flex items-center gap-1 ml-auto"
                    onClick={() => handleDelete(asset)}
                    disabled={deletingId === asset.id}
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    <span className="hidden sm:inline">{deletingId === asset.id ? 'Deleting…' : 'Delete'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
