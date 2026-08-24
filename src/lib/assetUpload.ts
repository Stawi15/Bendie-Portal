import { supabase } from '@/lib/supabaseClient';

export type OrganizationAsset = {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  storage_path: string;
  file_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

const BUCKET = 'org-assets';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

export async function uploadOrganizationAsset(
  organizationId: string,
  file: File,
  uploadedBy: string | null
): Promise<{ data?: OrganizationAsset; error?: string }> {
  const storagePath = `${organizationId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) return { error: uploadError.message };

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data, error: insertError } = await supabase
    .from('organization_assets')
    .insert({
      organization_id: organizationId,
      name: file.name,
      url: publicUrlData.publicUrl,
      storage_path: storagePath,
      file_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: uploadedBy,
    })
    .select()
    .single();

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: insertError.message };
  }

  return { data: data as OrganizationAsset };
}

export async function deleteOrganizationAsset(asset: OrganizationAsset): Promise<{ error?: string }> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([asset.storage_path]);
  if (storageError) return { error: storageError.message };

  const { error: dbError } = await supabase.from('organization_assets').delete().eq('id', asset.id);
  if (dbError) return { error: dbError.message };

  return {};
}
