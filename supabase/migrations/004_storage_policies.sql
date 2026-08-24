-- ============================================================
-- EVENT CONTENT PORTAL - STORAGE BUCKET SETUP
-- Run in Supabase SQL Editor AFTER creating the bucket in the UI:
--   Storage -> New Bucket -> Name: "event-assets" -> Public: ON -> Create
-- ============================================================

-- Allow global admins to upload files
CREATE POLICY "global_admins_can_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND global_role = 'admin'
    )
  );

-- Public read (bucket is public)
CREATE POLICY "public_can_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-assets');

-- Allow global admins to delete files
CREATE POLICY "global_admins_can_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND global_role = 'admin'
    )
  );

-- Allow global admins to update file metadata
CREATE POLICY "global_admins_can_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-assets'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND global_role = 'admin'
    )
  );
