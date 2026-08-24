-- Add missing tables for Gallery and Audit Log
-- Run this migration on your Supabase project

-- Event Photos table (Gallery) - matches DATABASE_SCHEMA.md
CREATE TABLE IF NOT EXISTS public.event_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid DEFAULT get_default_event_id(),
  image_url text NOT NULL,
  caption text,
  uploaded_by uuid,
  is_featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_photos_pkey PRIMARY KEY (id),
  CONSTRAINT event_photos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT event_photos_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE
);

-- Enable RLS on event_photos
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies for event_photos
CREATE POLICY "Event members can view event photos"
  ON public.event_photos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.event_members
      WHERE event_members.event_id = event_photos.event_id
      AND event_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Event organizers can insert event photos"
  ON public.event_photos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_members
      WHERE event_members.event_id = event_photos.event_id
      AND event_members.user_id = auth.uid()
      AND event_members.role IN ('host', 'organizer', 'admin')
    )
  );

CREATE POLICY "Photo owner or organizer can update event photos"
  ON public.event_photos
  FOR UPDATE
  USING (
    uploaded_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.event_members
      WHERE event_members.event_id = event_photos.event_id
      AND event_members.user_id = auth.uid()
      AND event_members.role IN ('host', 'organizer', 'admin')
    )
  );

CREATE POLICY "Photo owner or organizer can delete event photos"
  ON public.event_photos
  FOR DELETE
  USING (
    uploaded_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.event_members
      WHERE event_members.event_id = event_photos.event_id
      AND event_members.user_id = auth.uid()
      AND event_members.role IN ('host', 'organizer', 'admin')
    )
  );

-- Content Audit Log table
CREATE TABLE IF NOT EXISTS public.event_content_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  table_name text NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])),
  row_id text,
  old_values jsonb,
  new_values jsonb,
  changes jsonb,
  actor_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_content_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT event_content_audit_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT event_content_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create index for faster queries on event_id and created_at
CREATE INDEX IF NOT EXISTS idx_event_content_audit_log_event_id_created_at 
  ON public.event_content_audit_log(event_id, created_at DESC);

-- Enable RLS on event_content_audit_log
ALTER TABLE public.event_content_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for event_content_audit_log (read-only for event organizers)
CREATE POLICY "Event organizers can view audit log"
  ON public.event_content_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.event_members
      WHERE event_members.event_id = event_content_audit_log.event_id
      AND event_members.user_id = auth.uid()
      AND event_members.role IN ('host', 'organizer', 'admin')
    )
  );

CREATE POLICY "System can insert audit log entries"
  ON public.event_content_audit_log
  FOR INSERT
  WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_photos TO authenticated;
GRANT SELECT, INSERT ON public.event_content_audit_log TO authenticated;
