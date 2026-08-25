'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useEvent } from '@/contexts/EventContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';

const BUCKET = 'event-files';
const SIGNED_URL_TTL = 60 * 60; // 1 hour — long enough for an organizer to open/share a link

type EventFile = {
  name: string;
  size: number | null;
  mimetype: string | null;
  updatedAt: string | null;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_ ]/g, '_');
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
}

export default function EventFilesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { currentEvent } = useEvent();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<EventFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const organizationId = currentEvent?.organization_id;
  const folderPath = organizationId && eventId ? `${organizationId}/${eventId}` : null;

  const fetchFiles = async () => {
    if (!folderPath) return;
    setLoading(true);
    const { data, error } = await supabase.storage.from(BUCKET).list(folderPath, {
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      toast.error('Failed to load files');
    } else {
      setFiles(
        (data ?? [])
          .filter((f) => f.id !== null) // storage.list() returns a placeholder row for the "folder" itself when empty
          .map((f) => ({
            name: f.name,
            size: f.metadata?.size ?? null,
            mimetype: f.metadata?.mimetype ?? null,
            updatedAt: f.updated_at,
          }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    if (folderPath) fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !folderPath) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(fileList)) {
      const path = `${folderPath}/${sanitizeFileName(file.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: true, // re-uploading the same filename replaces it (e.g. an updated sponsor deck)
      });
      if (error) toast.error(`${file.name}: ${error.message}`);
      else successCount++;
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
      fetchFiles();
    }
  };

  const handleOpen = async (name: string) => {
    if (!folderPath) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${folderPath}/${name}`, SIGNED_URL_TTL);
    if (error || !data) { toast.error('Failed to generate a link for this file'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async (name: string) => {
    if (!folderPath) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${folderPath}/${name}`, SIGNED_URL_TTL);
    if (error || !data) { toast.error('Failed to generate a link for this file'); return; }
    await navigator.clipboard.writeText(data.signedUrl);
    toast.success('Link copied (expires in 1 hour)');
  };

  const handleDelete = async (name: string) => {
    if (!folderPath) return;
    const ok = await confirm({
      title: 'Delete file',
      message: `Delete "${name}"? Attendees will no longer be able to download it. This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setDeletingName(name);
    const { error } = await supabase.storage.from(BUCKET).remove([`${folderPath}/${name}`]);
    setDeletingName(null);

    if (error) toast.error(error.message);
    else {
      toast.success('File deleted');
      setFiles((prev) => prev.filter((f) => f.name !== name));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader
          sectionKey="files"
          desc={`${files.length} file${files.length !== 1 ? 's' : ''} available for attendees to download`}
        />
        <div className="flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !folderPath}
          >
            <span className="material-symbols-outlined text-lg">upload_file</span>
            {uploading ? 'Uploading…' : 'Upload File'}
          </button>
        </div>
      </div>

      <p className="hint mb-4">
        PDFs, agendas, sponsor decks, or any other document attendees should be able to view or download in the app.
        Re-uploading a file with the same name replaces it.
      </p>

      {loading ? (
        <div className="space-y-2 animate-pulse">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : files.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">folder_open</p>
          <p className="text-on-surface-variant">No files yet. Upload the first document for this event.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.name}
              className="flex items-center gap-4 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4 hover:border-primary/30 transition"
            >
              <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-neutral-600">{extensionOf(f.name)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-on-surface truncate" title={f.name}>{f.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {formatSize(f.size)}
                  {f.updatedAt && ` · ${new Date(f.updatedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  title="Open"
                  onClick={() => handleOpen(f.name)}
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                </button>
                <button
                  title="Copy link"
                  onClick={() => handleCopyLink(f.name)}
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">content_copy</span>
                </button>
                <button
                  title="Delete"
                  onClick={() => handleDelete(f.name)}
                  disabled={deletingName === f.name}
                  className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
