-- ============================================================
-- Sets up the Activity Log tab, which has never actually worked:
-- event_content_audit_log doesn't exist yet (migration 005 never
-- got applied for it, only event_photos did), and nothing in the
-- application code writes audit entries -- the page has always
-- just been reading from a table that was never there.
--
-- This creates the table plus generic triggers on every
-- event-scoped content table so mutations are logged
-- automatically, without any application code changes needed.
-- ============================================================

CREATE TABLE public.event_content_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  table_name text NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])),
  row_id text,
  diff jsonb,
  actor_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_content_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT event_content_audit_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT event_content_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_event_content_audit_log_event_id_created_at
  ON public.event_content_audit_log(event_id, created_at DESC);

ALTER TABLE public.event_content_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can view all audit log entries"
  ON public.event_content_audit_log
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "System can insert audit log entries"
  ON public.event_content_audit_log
  FOR INSERT
  WITH CHECK (true);

GRANT SELECT ON public.event_content_audit_log TO authenticated;

-- ── Generic trigger for tables with a direct id + event_id ──────
CREATE OR REPLACE FUNCTION public.log_content_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_row_id text;
  v_diff jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
    v_row_id := OLD.id::text;
    v_diff := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    v_event_id := NEW.event_id;
    v_row_id := NEW.id::text;
    v_diff := to_jsonb(NEW);
  ELSE
    v_event_id := NEW.event_id;
    v_row_id := NEW.id::text;
    SELECT jsonb_object_agg(o.key, jsonb_build_object('old', o.old_val, 'new', n.new_val))
      INTO v_diff
      FROM jsonb_each(to_jsonb(OLD)) AS o(key, old_val)
      JOIN jsonb_each(to_jsonb(NEW)) AS n(key, new_val) USING (key)
      WHERE o.old_val IS DISTINCT FROM n.new_val;
  END IF;

  IF v_event_id IS NOT NULL AND (TG_OP != 'UPDATE' OR v_diff IS NOT NULL) THEN
    INSERT INTO public.event_content_audit_log (event_id, table_name, action, row_id, diff, actor_user_id)
    VALUES (v_event_id, TG_TABLE_NAME, TG_OP, v_row_id, v_diff, auth.uid());
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Dedicated trigger for event_members (composite key, no id) ──
CREATE OR REPLACE FUNCTION public.log_event_members_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_diff jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.event_content_audit_log (event_id, table_name, action, row_id, diff, actor_user_id)
    VALUES (OLD.event_id, 'event_members', TG_OP, OLD.user_id::text, to_jsonb(OLD), auth.uid());
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.event_content_audit_log (event_id, table_name, action, row_id, diff, actor_user_id)
    VALUES (NEW.event_id, 'event_members', TG_OP, NEW.user_id::text, to_jsonb(NEW), auth.uid());
  ELSE
    SELECT jsonb_object_agg(o.key, jsonb_build_object('old', o.old_val, 'new', n.new_val))
      INTO v_diff
      FROM jsonb_each(to_jsonb(OLD)) AS o(key, old_val)
      JOIN jsonb_each(to_jsonb(NEW)) AS n(key, new_val) USING (key)
      WHERE o.old_val IS DISTINCT FROM n.new_val;
    IF v_diff IS NOT NULL THEN
      INSERT INTO public.event_content_audit_log (event_id, table_name, action, row_id, diff, actor_user_id)
      VALUES (NEW.event_id, 'event_members', TG_OP, NEW.user_id::text, v_diff, auth.uid());
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Dedicated trigger for events itself (id is the event id) ────
CREATE OR REPLACE FUNCTION public.log_event_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_diff jsonb;
BEGIN
  SELECT jsonb_object_agg(o.key, jsonb_build_object('old', o.old_val, 'new', n.new_val))
    INTO v_diff
    FROM jsonb_each(to_jsonb(OLD)) AS o(key, old_val)
    JOIN jsonb_each(to_jsonb(NEW)) AS n(key, new_val) USING (key)
    WHERE o.old_val IS DISTINCT FROM n.new_val;

  IF v_diff IS NOT NULL THEN
    INSERT INTO public.event_content_audit_log (event_id, table_name, action, row_id, diff, actor_user_id)
    VALUES (NEW.id, 'events', 'UPDATE', NEW.id::text, v_diff, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- ── Attach triggers ───────────────────────────────────────────
CREATE TRIGGER trg_audit_facilitators AFTER INSERT OR UPDATE OR DELETE ON public.facilitators FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_agenda_sessions AFTER INSERT OR UPDATE OR DELETE ON public.agenda_sessions FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_activities AFTER INSERT OR UPDATE OR DELETE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_faqs AFTER INSERT OR UPDATE OR DELETE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_emergency_contacts AFTER INSERT OR UPDATE OR DELETE ON public.emergency_contacts FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_support_contacts AFTER INSERT OR UPDATE OR DELETE ON public.support_contacts FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_games AFTER INSERT OR UPDATE OR DELETE ON public.games FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_event_interest_options AFTER INSERT OR UPDATE OR DELETE ON public.event_interest_options FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_posts AFTER INSERT OR UPDATE OR DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.log_content_change();
CREATE TRIGGER trg_audit_event_members AFTER INSERT OR UPDATE OR DELETE ON public.event_members FOR EACH ROW EXECUTE FUNCTION public.log_event_members_change();
CREATE TRIGGER trg_audit_events AFTER UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.log_event_change();
