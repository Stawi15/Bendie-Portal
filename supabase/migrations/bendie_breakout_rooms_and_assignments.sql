-- Bendie Breakout Rooms (Feature 021) -- durable breakout rooms, saved attendee room assignments,
-- and agenda-session editing for organisation owners/admins.
--
-- Why this migration exists:
-- Breakout rooms lived only as JSON on agenda_sessions.breakout_rooms with editor-made ids; the
-- attendee app held an attendee's room pick in memory only, so organisers could never see who goes
-- where, rooms had no capacity, and CSV could not create rooms or assignments
-- (specs/021-bendie-breakout-rooms/spec.md).
--
-- What it does:
--   A. is_event_org_admin(ev_id) + INSERT/UPDATE/DELETE policies on agenda_sessions for owners/admins
--      of the event's organisation (FR-033; until now only platform admins could write sessions).
--      Adds agenda_sessions.breakout_mode.
--   B. Tables agenda_breakout_rooms, agenda_breakout_room_items, agenda_breakout_assignments.
--   C. Row-level security (organisers manage; attendees read rooms and only their own assignment).
--   D. Triggers. agenda_sessions.breakout_rooms is now DERIVED from the tables by
--      rebuild_breakout_rooms_json(), so the released attendee app (which reads that JSON through
--      agenda_sessions_summary) keeps working unchanged. A guard refuses direct changes to the JSON.
--   E. save_breakout_rooms(): atomic room save for the Portal editor and the rooms CSV.
--   F. choose_breakout_room() (race-safe attendee pick with mode + capacity rules) and
--      get_breakout_room_availability() (counts only, never identities) for the attendee app.
--   G. Idempotent backfill of the existing JSON rooms into the tables (legacy ids kept).
--
-- Headcount rule (everywhere): only assignments of members whose current role is 'attendee' count.
-- Additive only: no existing column or policy is changed or removed.

-- ===========================================================================================
-- A. Organisation admins may edit agenda sessions (FR-033) + breakout mode
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.is_event_org_admin(ev_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1
    from public.events e
    where e.id = ev_id
      and public.is_organization_admin(e.organization_id, auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_event_org_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_event_org_admin(uuid) TO authenticated;

-- Restrictive agenda_sessions_event_scope_* policies still apply (they require event membership,
-- which organisation admins always hold on their organisation's events via the
-- zz_organization_admin_event_membership* guard chain).
DROP POLICY IF EXISTS agenda_sessions_insert_org_admin ON public.agenda_sessions;
CREATE POLICY agenda_sessions_insert_org_admin ON public.agenda_sessions
  FOR INSERT TO authenticated
  WITH CHECK (event_id IS NOT NULL AND public.is_event_org_admin(event_id));

DROP POLICY IF EXISTS agenda_sessions_update_org_admin ON public.agenda_sessions;
CREATE POLICY agenda_sessions_update_org_admin ON public.agenda_sessions
  FOR UPDATE TO authenticated
  USING (event_id IS NOT NULL AND public.is_event_org_admin(event_id))
  WITH CHECK (event_id IS NOT NULL AND public.is_event_org_admin(event_id));

DROP POLICY IF EXISTS agenda_sessions_delete_org_admin ON public.agenda_sessions;
CREATE POLICY agenda_sessions_delete_org_admin ON public.agenda_sessions
  FOR DELETE TO authenticated
  USING (event_id IS NOT NULL AND public.is_event_org_admin(event_id));

ALTER TABLE public.agenda_sessions
  ADD COLUMN IF NOT EXISTS breakout_mode text NOT NULL DEFAULT 'attendee_choice';

ALTER TABLE public.agenda_sessions DROP CONSTRAINT IF EXISTS agenda_sessions_breakout_mode_check;
ALTER TABLE public.agenda_sessions
  ADD CONSTRAINT agenda_sessions_breakout_mode_check
  CHECK (breakout_mode IN ('attendee_choice', 'organizer_assigns', 'preassigned_switchable'));

-- ===========================================================================================
-- B. Tables
-- ===========================================================================================

CREATE TABLE IF NOT EXISTS public.agenda_breakout_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agenda_sessions(id) ON DELETE CASCADE,
  event_id uuid,
  legacy_key text,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  location text CHECK (location IS NULL OR char_length(location) <= 200),
  facilitator_id uuid REFERENCES public.facilitators(id) ON DELETE SET NULL,
  facilitator_name text CHECK (facilitator_name IS NULL OR char_length(facilitator_name) <= 200),
  capacity integer CHECK (capacity IS NULL OR capacity >= 1),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_breakout_rooms_id_session_key UNIQUE (id, session_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS agenda_breakout_rooms_session_name_key
  ON public.agenda_breakout_rooms (session_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS agenda_breakout_rooms_event_idx ON public.agenda_breakout_rooms (event_id);

CREATE TABLE IF NOT EXISTS public.agenda_breakout_room_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.agenda_breakout_rooms(id) ON DELETE CASCADE,
  event_id uuid,
  legacy_key text,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  starts_at timestamptz,
  ends_at timestamptz,
  location text CHECK (location IS NULL OR char_length(location) <= 200),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_breakout_room_items_time_order
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS agenda_breakout_room_items_room_idx ON public.agenda_breakout_room_items (room_id);
CREATE INDEX IF NOT EXISTS agenda_breakout_room_items_event_idx ON public.agenda_breakout_room_items (event_id);

CREATE TABLE IF NOT EXISTS public.agenda_breakout_assignments (
  session_id uuid NOT NULL REFERENCES public.agenda_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  room_id uuid NOT NULL,
  event_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('attendee', 'organizer', 'csv')),
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id),
  CONSTRAINT agenda_breakout_assignments_room_fkey
    FOREIGN KEY (room_id, session_id) REFERENCES public.agenda_breakout_rooms(id, session_id) ON DELETE CASCADE,
  CONSTRAINT agenda_breakout_assignments_member_fkey
    FOREIGN KEY (event_id, user_id) REFERENCES public.event_members(event_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agenda_breakout_assignments_room_idx ON public.agenda_breakout_assignments (room_id);
CREATE INDEX IF NOT EXISTS agenda_breakout_assignments_member_idx ON public.agenda_breakout_assignments (event_id, user_id);

REVOKE ALL ON public.agenda_breakout_rooms, public.agenda_breakout_room_items, public.agenda_breakout_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.agenda_breakout_rooms, public.agenda_breakout_room_items, public.agenda_breakout_assignments
  TO authenticated;

-- ===========================================================================================
-- C. Row-level security
-- Organiser predicate: event host/organizer/admin, owner/admin of the event's organisation, or
-- platform admin.
-- ===========================================================================================

ALTER TABLE public.agenda_breakout_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_breakout_room_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_breakout_assignments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  organiser text := '(public.is_event_host_or_organizer(event_id) OR public.is_event_org_admin(event_id) OR public.portal_is_global_admin())';
  scope text := '(public.is_event_member(event_id) OR public.portal_is_global_admin())';
BEGIN
  FOREACH t IN ARRAY ARRAY['agenda_breakout_rooms', 'agenda_breakout_room_items'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_member', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING %s', t || '_select_member', t, scope);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_organizer', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK %s', t || '_insert_organizer', t, organiser);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_organizer', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING %s WITH CHECK %s', t || '_update_organizer', t, organiser, organiser);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_organizer', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING %s', t || '_delete_organizer', t, organiser);
  END LOOP;

  -- Assignments: an attendee reads only their own row; organisers read and write all rows of the
  -- event. Attendees never write directly -- only through choose_breakout_room().
  EXECUTE 'DROP POLICY IF EXISTS agenda_breakout_assignments_select ON public.agenda_breakout_assignments';
  EXECUTE format('CREATE POLICY agenda_breakout_assignments_select ON public.agenda_breakout_assignments FOR SELECT TO authenticated USING (user_id = auth.uid() OR %s)', organiser);
  EXECUTE 'DROP POLICY IF EXISTS agenda_breakout_assignments_insert_organizer ON public.agenda_breakout_assignments';
  EXECUTE format('CREATE POLICY agenda_breakout_assignments_insert_organizer ON public.agenda_breakout_assignments FOR INSERT TO authenticated WITH CHECK %s', organiser);
  EXECUTE 'DROP POLICY IF EXISTS agenda_breakout_assignments_update_organizer ON public.agenda_breakout_assignments';
  EXECUTE format('CREATE POLICY agenda_breakout_assignments_update_organizer ON public.agenda_breakout_assignments FOR UPDATE TO authenticated USING %s WITH CHECK %s', organiser, organiser);
  EXECUTE 'DROP POLICY IF EXISTS agenda_breakout_assignments_delete_organizer ON public.agenda_breakout_assignments';
  EXECUTE format('CREATE POLICY agenda_breakout_assignments_delete_organizer ON public.agenda_breakout_assignments FOR DELETE TO authenticated USING %s', organiser);

  -- Restrictive event scope, mirroring agenda_sessions_event_scope_*_restrictive.
  FOREACH t IN ARRAY ARRAY['agenda_breakout_rooms', 'agenda_breakout_room_items', 'agenda_breakout_assignments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_event_scope_select_restrictive', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING %s', t || '_event_scope_select_restrictive', t, scope);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_event_scope_insert_restrictive', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK %s', t || '_event_scope_insert_restrictive', t, scope);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_event_scope_update_restrictive', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING %s WITH CHECK %s', t || '_event_scope_update_restrictive', t, scope, scope);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_event_scope_delete_restrictive', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING %s', t || '_event_scope_delete_restrictive', t, scope);
  END LOOP;
END $$;

-- ===========================================================================================
-- D. Triggers and the derived JSON
-- ===========================================================================================

-- Rebuilds agenda_sessions.breakout_rooms from the tables in the shape the released attendee app
-- reads: [{id, name, description, facilitator_name, agenda: [{id, title, description, starts_at,
-- ends_at, location}]}], blanks as '' and times as UTC ISO with milliseconds (JS toISOString).
CREATE OR REPLACE FUNCTION public.rebuild_breakout_rooms_json(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_json jsonb;
begin
  if p_session_id is null then
    return;
  end if;

  select jsonb_agg(x.room order by x.display_order, x.created_at, x.id)
    into v_json
  from (
    select r.display_order, r.created_at, r.id,
      jsonb_build_object(
        'id', coalesce(r.legacy_key, r.id::text),
        'name', r.name,
        'description', coalesce(r.description, ''),
        'facilitator_name', coalesce(f.full_name, r.facilitator_name, ''),
        'agenda', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(i.legacy_key, i.id::text),
              'title', i.title,
              'description', coalesce(i.description, ''),
              'starts_at', coalesce(to_char(i.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''),
              'ends_at', coalesce(to_char(i.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''),
              'location', coalesce(i.location, '')
            )
            order by i.display_order, i.created_at, i.id)
          from public.agenda_breakout_room_items i
          where i.room_id = r.id
        ), '[]'::jsonb)
      ) as room
    from public.agenda_breakout_rooms r
    left join public.facilitators f on f.id = r.facilitator_id
    where r.session_id = p_session_id
  ) x;

  perform set_config('app.breakout_rebuild', '1', true);
  update public.agenda_sessions
     set breakout_rooms = v_json
   where id = p_session_id
     and breakout_rooms is distinct from v_json;
  perform set_config('app.breakout_rebuild', '', true);
end;
$$;

REVOKE ALL ON FUNCTION public.rebuild_breakout_rooms_json(uuid) FROM PUBLIC, anon, authenticated;

-- The JSON is derived: refuse a direct change to it (e.g. from a Portal page that still writes it).
-- A save that leaves it unchanged is allowed.
CREATE OR REPLACE FUNCTION public.agenda_sessions_guard_breakout_rooms()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if coalesce(current_setting('app.breakout_rebuild', true), '') = '1' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.breakout_rooms is not null and new.breakout_rooms <> '[]'::jsonb)
     or (tg_op = 'UPDATE' and new.breakout_rooms is distinct from old.breakout_rooms) then
    raise exception 'Breakout rooms are now edited with the room editor. Reload the page and try again.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_agenda_sessions_guard_breakout_rooms ON public.agenda_sessions;
CREATE TRIGGER trg_agenda_sessions_guard_breakout_rooms
  BEFORE INSERT OR UPDATE OF breakout_rooms ON public.agenda_sessions
  FOR EACH ROW EXECUTE FUNCTION public.agenda_sessions_guard_breakout_rooms();

CREATE OR REPLACE FUNCTION public.agenda_breakout_rooms_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_event uuid;
  v_fac_event uuid;
begin
  select s.event_id into v_event from public.agenda_sessions s where s.id = new.session_id;
  new.event_id := v_event;
  new.name := btrim(new.name);
  if new.facilitator_id is not null then
    select f.event_id into v_fac_event from public.facilitators f where f.id = new.facilitator_id;
    if v_fac_event is distinct from v_event then
      raise exception 'The facilitator must be a speaker of this event.' using errcode = '22023';
    end if;
    new.facilitator_name := null;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.agenda_breakout_room_items_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  select r.event_id into new.event_id from public.agenda_breakout_rooms r where r.id = new.room_id;
  new.title := btrim(new.title);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.agenda_breakout_rooms_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.rebuild_breakout_rooms_json(old.session_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.session_id is distinct from old.session_id) then
    perform public.rebuild_breakout_rooms_json(new.session_id);
  end if;
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.agenda_breakout_room_items_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_session uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    -- NULL when the room itself is being deleted; the room's own trigger rebuilds then.
    select r.session_id into v_session from public.agenda_breakout_rooms r where r.id = old.room_id;
    perform public.rebuild_breakout_rooms_json(v_session);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.room_id is distinct from old.room_id) then
    select r.session_id into v_session from public.agenda_breakout_rooms r where r.id = new.room_id;
    perform public.rebuild_breakout_rooms_json(v_session);
  end if;
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.agenda_breakout_assignments_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_event uuid;
begin
  select s.event_id into v_event from public.agenda_sessions s where s.id = new.session_id;
  if v_event is null then
    raise exception 'This session does not belong to an event.' using errcode = '22023';
  end if;
  new.event_id := v_event;

  if not exists (
    select 1 from public.event_members em
    where em.event_id = v_event and em.user_id = new.user_id and em.role = 'attendee'
  ) then
    raise exception 'Only attendees of this event can be placed in a room.' using errcode = '22023';
  end if;

  if new.source = 'attendee' and new.user_id is distinct from auth.uid() then
    raise exception 'Only the attendee can make their own room choice.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.room_id = old.room_id then
    -- Same room: nothing really changed (e.g. a re-uploaded file) -- keep who/when/source.
    new.source := old.source;
    new.assigned_by := old.assigned_by;
    new.assigned_at := old.assigned_at;
  else
    new.assigned_by := auth.uid();
    new.assigned_at := now();
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_agenda_breakout_rooms_before_write ON public.agenda_breakout_rooms;
CREATE TRIGGER trg_agenda_breakout_rooms_before_write
  BEFORE INSERT OR UPDATE ON public.agenda_breakout_rooms
  FOR EACH ROW EXECUTE FUNCTION public.agenda_breakout_rooms_before_write();

DROP TRIGGER IF EXISTS trg_agenda_breakout_rooms_after_write ON public.agenda_breakout_rooms;
CREATE TRIGGER trg_agenda_breakout_rooms_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.agenda_breakout_rooms
  FOR EACH ROW EXECUTE FUNCTION public.agenda_breakout_rooms_after_write();

DROP TRIGGER IF EXISTS trg_audit_agenda_breakout_rooms ON public.agenda_breakout_rooms;
CREATE TRIGGER trg_audit_agenda_breakout_rooms
  AFTER INSERT OR UPDATE OR DELETE ON public.agenda_breakout_rooms
  FOR EACH ROW EXECUTE FUNCTION public.log_content_change();

DROP TRIGGER IF EXISTS trg_agenda_breakout_room_items_before_write ON public.agenda_breakout_room_items;
CREATE TRIGGER trg_agenda_breakout_room_items_before_write
  BEFORE INSERT OR UPDATE ON public.agenda_breakout_room_items
  FOR EACH ROW EXECUTE FUNCTION public.agenda_breakout_room_items_before_write();

DROP TRIGGER IF EXISTS trg_agenda_breakout_room_items_after_write ON public.agenda_breakout_room_items;
CREATE TRIGGER trg_agenda_breakout_room_items_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.agenda_breakout_room_items
  FOR EACH ROW EXECUTE FUNCTION public.agenda_breakout_room_items_after_write();

DROP TRIGGER IF EXISTS trg_audit_agenda_breakout_room_items ON public.agenda_breakout_room_items;
CREATE TRIGGER trg_audit_agenda_breakout_room_items
  AFTER INSERT OR UPDATE OR DELETE ON public.agenda_breakout_room_items
  FOR EACH ROW EXECUTE FUNCTION public.log_content_change();

DROP TRIGGER IF EXISTS trg_agenda_breakout_assignments_before_write ON public.agenda_breakout_assignments;
CREATE TRIGGER trg_agenda_breakout_assignments_before_write
  BEFORE INSERT OR UPDATE ON public.agenda_breakout_assignments
  FOR EACH ROW EXECUTE FUNCTION public.agenda_breakout_assignments_before_write();

-- ===========================================================================================
-- E. save_breakout_rooms -- atomic save for the Portal editor (p_prune = true) and rooms CSV
-- (p_prune = false). Runs with the caller's row-level security.
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.save_breakout_rooms(p_session_id uuid, p_rooms jsonb, p_prune boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
declare
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_found boolean;
  v_event uuid;
  v_room jsonb;
  v_block jsonb;
  v_idx int;
  v_bidx int;
  v_name text;
  v_norm text;
  v_names text[] := '{}';
  v_ids uuid[] := '{}';
  v_room_id uuid;
  v_block_id uuid;
  v_keep_blocks uuid[];
  v_next_order int;
  v_new_count int := 0;
  v_removed int := 0;
  v_cap int;
  v_existing jsonb;
  v_incoming jsonb;
  v_rooms_out jsonb;
begin
  if p_rooms is null or jsonb_typeof(p_rooms) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'message', 'Rooms must be a list.');
  end if;

  select true, s.event_id into v_found, v_event from public.agenda_sessions s where s.id = p_session_id;
  if v_found is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'message', 'Session not found.');
  end if;
  if v_event is null then
    return jsonb_build_object('ok', false, 'reason', 'no_event');
  end if;
  if not (public.is_event_host_or_organizer(v_event) or public.is_event_org_admin(v_event) or public.portal_is_global_admin()) then
    raise exception 'You do not have permission to manage rooms for this event.' using errcode = '42501';
  end if;

  -- Validate names and resolve each listed room to an existing room (by id, else by name).
  for v_room, v_idx in select e.value, e.ordinality::int from jsonb_array_elements(p_rooms) with ordinality e loop
    v_name := btrim(coalesce(v_room->>'name', ''));
    if v_name = '' then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'message', 'Every room needs a name.');
    end if;
    if char_length(v_name) > 200 then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'message', format('Room name "%s" is longer than 200 characters.', left(v_name, 40)));
    end if;
    v_norm := lower(v_name);
    if v_norm = any(v_names) then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'message', format('Room names must be unique in a session ("%s").', v_name));
    end if;
    v_names := v_names || v_norm;

    v_room_id := null;
    if coalesce(v_room->>'id', '') ~ c_uuid then
      select r.id into v_room_id from public.agenda_breakout_rooms r
       where r.id = (v_room->>'id')::uuid and r.session_id = p_session_id;
    end if;
    if v_room_id is null then
      select r.id into v_room_id from public.agenda_breakout_rooms r
       where r.session_id = p_session_id and lower(btrim(r.name)) = v_norm;
    end if;
    if v_room_id is not null and v_room_id = any(v_ids) then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'message', format('Room "%s" is listed twice.', v_name));
    end if;
    v_ids := v_ids || v_room_id; -- NULL entries mark new rooms
  end loop;

  begin
    if p_prune then
      select count(*) into v_removed
        from public.agenda_breakout_assignments a
        join public.agenda_breakout_rooms r on r.id = a.room_id
       where r.session_id = p_session_id
         and not (r.id = any(array_remove(v_ids, null)));
      delete from public.agenda_breakout_rooms r
       where r.session_id = p_session_id
         and not (r.id = any(array_remove(v_ids, null)));
    end if;

    select coalesce(max(display_order), -1) + 1 into v_next_order
      from public.agenda_breakout_rooms where session_id = p_session_id;

    for v_room, v_idx in select e.value, e.ordinality::int from jsonb_array_elements(p_rooms) with ordinality e loop
      v_room_id := v_ids[v_idx];

      v_cap := null;
      if v_room ? 'capacity' and v_room->'capacity' <> 'null'::jsonb then
        if jsonb_typeof(v_room->'capacity') <> 'number' or (v_room->>'capacity')::numeric <> trunc((v_room->>'capacity')::numeric)
           or (v_room->>'capacity')::numeric < 1 then
          raise exception 'Capacity for "%" must be a whole number of 1 or more.', btrim(v_room->>'name') using errcode = '22023';
        end if;
        v_cap := (v_room->>'capacity')::int;
      end if;

      if v_room_id is null then
        insert into public.agenda_breakout_rooms
          (session_id, name, description, location, facilitator_id, facilitator_name, capacity, display_order)
        values (
          p_session_id,
          btrim(v_room->>'name'),
          nullif(btrim(coalesce(v_room->>'description', '')), ''),
          nullif(btrim(coalesce(v_room->>'location', '')), ''),
          nullif(v_room->>'facilitator_id', '')::uuid,
          nullif(btrim(coalesce(v_room->>'facilitator_name', '')), ''),
          v_cap,
          case when p_prune then v_idx - 1 else v_next_order + v_new_count end
        )
        returning id into v_room_id;
        v_new_count := v_new_count + 1;
      else
        update public.agenda_breakout_rooms r set
          name = btrim(v_room->>'name'),
          description = case when v_room ? 'description' then nullif(btrim(coalesce(v_room->>'description', '')), '') else r.description end,
          location = case when v_room ? 'location' then nullif(btrim(coalesce(v_room->>'location', '')), '') else r.location end,
          facilitator_id = case when v_room ? 'facilitator_id' then nullif(v_room->>'facilitator_id', '')::uuid else r.facilitator_id end,
          facilitator_name = case when v_room ? 'facilitator_name' then nullif(btrim(coalesce(v_room->>'facilitator_name', '')), '') else r.facilitator_name end,
          capacity = case when v_room ? 'capacity' then v_cap else r.capacity end,
          display_order = case when p_prune then v_idx - 1 else r.display_order end
        where r.id = v_room_id
          and (r.name, r.description, r.location, r.facilitator_id, r.facilitator_name, r.capacity, r.display_order)
              is distinct from (
                btrim(v_room->>'name'),
                case when v_room ? 'description' then nullif(btrim(coalesce(v_room->>'description', '')), '') else r.description end,
                case when v_room ? 'location' then nullif(btrim(coalesce(v_room->>'location', '')), '') else r.location end,
                case when v_room ? 'facilitator_id' then nullif(v_room->>'facilitator_id', '')::uuid else r.facilitator_id end,
                case when v_room ? 'facilitator_name' then nullif(btrim(coalesce(v_room->>'facilitator_name', '')), '') else r.facilitator_name end,
                case when v_room ? 'capacity' then v_cap else r.capacity end,
                case when p_prune then v_idx - 1 else r.display_order end
              );
      end if;

      -- Mini-agenda: replaced only when 'blocks' is given, and skipped when identical.
      if v_room ? 'blocks' then
        if jsonb_typeof(v_room->'blocks') <> 'array' then
          raise exception 'Time blocks for "%" must be a list.', btrim(v_room->>'name') using errcode = '22023';
        end if;

        select coalesce(jsonb_agg(jsonb_build_object(
                 'title', i.title, 'description', i.description, 'starts_at', i.starts_at,
                 'ends_at', i.ends_at, 'location', i.location) order by i.display_order, i.created_at, i.id), '[]'::jsonb)
          into v_existing
          from public.agenda_breakout_room_items i where i.room_id = v_room_id;

        select coalesce(jsonb_agg(jsonb_build_object(
                 'title', btrim(coalesce(b.value->>'title', '')),
                 'description', nullif(btrim(coalesce(b.value->>'description', '')), ''),
                 'starts_at', nullif(b.value->>'starts_at', '')::timestamptz,
                 'ends_at', nullif(b.value->>'ends_at', '')::timestamptz,
                 'location', nullif(btrim(coalesce(b.value->>'location', '')), '')) order by b.ordinality), '[]'::jsonb)
          into v_incoming
          from jsonb_array_elements(v_room->'blocks') with ordinality b;

        if v_existing is distinct from v_incoming then
          v_keep_blocks := '{}';
          for v_block in select b.value from jsonb_array_elements(v_room->'blocks') b loop
            if coalesce(v_block->>'id', '') ~ c_uuid then
              v_keep_blocks := v_keep_blocks || (v_block->>'id')::uuid;
            end if;
          end loop;
          delete from public.agenda_breakout_room_items i
           where i.room_id = v_room_id and not (i.id = any(v_keep_blocks));

          for v_block, v_bidx in select b.value, b.ordinality::int from jsonb_array_elements(v_room->'blocks') with ordinality b loop
            if btrim(coalesce(v_block->>'title', '')) = '' then
              raise exception 'Every time block in "%" needs a title.', btrim(v_room->>'name') using errcode = '22023';
            end if;
            v_block_id := null;
            if coalesce(v_block->>'id', '') ~ c_uuid then
              select i.id into v_block_id from public.agenda_breakout_room_items i
               where i.id = (v_block->>'id')::uuid and i.room_id = v_room_id;
            end if;
            if v_block_id is null then
              insert into public.agenda_breakout_room_items
                (room_id, title, description, starts_at, ends_at, location, display_order)
              values (
                v_room_id,
                btrim(v_block->>'title'),
                nullif(btrim(coalesce(v_block->>'description', '')), ''),
                nullif(v_block->>'starts_at', '')::timestamptz,
                nullif(v_block->>'ends_at', '')::timestamptz,
                nullif(btrim(coalesce(v_block->>'location', '')), ''),
                v_bidx - 1
              );
            else
              update public.agenda_breakout_room_items i set
                title = btrim(v_block->>'title'),
                description = nullif(btrim(coalesce(v_block->>'description', '')), ''),
                starts_at = nullif(v_block->>'starts_at', '')::timestamptz,
                ends_at = nullif(v_block->>'ends_at', '')::timestamptz,
                location = nullif(btrim(coalesce(v_block->>'location', '')), ''),
                display_order = v_bidx - 1
              where i.id = v_block_id;
            end if;
          end loop;
        end if;
      end if;
    end loop;
  exception
    when insufficient_privilege then
      raise;
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'message', 'Room names must be unique in a session.');
    when check_violation then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'message', 'A value is out of range: names up to 200 characters, block titles up to 300, descriptions up to 2000, locations up to 200, capacity 1 or more, and each block must end after it starts.');
    when others then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'message', sqlerrm);
  end;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.display_order, r.created_at), '[]'::jsonb)
    into v_rooms_out
    from public.agenda_breakout_rooms r where r.session_id = p_session_id;

  return jsonb_build_object('ok', true, 'rooms', v_rooms_out, 'removed_assignments', v_removed);
end;
$$;

REVOKE ALL ON FUNCTION public.save_breakout_rooms(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_breakout_rooms(uuid, jsonb, boolean) TO authenticated;

-- ===========================================================================================
-- F. Attendee room choice and availability (used by the attendee app, Release 2)
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.choose_breakout_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_session uuid;
  v_capacity int;
  v_event uuid;
  v_mode text;
  v_current uuid;
  v_count int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- Lock the room: picks for the same room are serialised, so its capacity can't be overrun.
  select r.session_id, r.capacity into v_session, v_capacity
    from public.agenda_breakout_rooms r where r.id = p_room_id
    for update;
  if v_session is null then
    return jsonb_build_object('ok', false, 'reason', 'room_not_found');
  end if;

  select s.event_id, s.breakout_mode into v_event, v_mode
    from public.agenda_sessions s where s.id = v_session;
  if v_event is null then
    return jsonb_build_object('ok', false, 'reason', 'no_event');
  end if;

  if not exists (
    select 1 from public.event_members em
    where em.event_id = v_event and em.user_id = v_uid and em.role = 'attendee'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_attendee');
  end if;

  if v_mode = 'organizer_assigns' then
    return jsonb_build_object('ok', false, 'reason', 'organizer_assigns');
  end if;

  select a.room_id into v_current
    from public.agenda_breakout_assignments a
   where a.session_id = v_session and a.user_id = v_uid;
  if v_current = p_room_id then
    return jsonb_build_object('ok', true, 'session_id', v_session, 'room_id', p_room_id);
  end if;

  if v_capacity is not null then
    select count(*) into v_count
      from public.agenda_breakout_assignments a
      join public.event_members em
        on em.event_id = a.event_id and em.user_id = a.user_id and em.role = 'attendee'
     where a.room_id = p_room_id;
    if v_count >= v_capacity then
      return jsonb_build_object('ok', false, 'reason', 'room_full');
    end if;
  end if;

  insert into public.agenda_breakout_assignments (session_id, user_id, room_id, source)
  values (v_session, v_uid, p_room_id, 'attendee')
  on conflict (session_id, user_id)
  do update set room_id = excluded.room_id, source = 'attendee';

  return jsonb_build_object('ok', true, 'session_id', v_session, 'room_id', p_room_id);
end;
$$;

REVOKE ALL ON FUNCTION public.choose_breakout_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_breakout_room(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_breakout_room_availability(p_session_id uuid)
RETURNS TABLE (room_id uuid, legacy_key text, capacity integer, headcount integer, seats_left integer, is_full boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select r.id,
         r.legacy_key,
         r.capacity,
         coalesce(c.n, 0)::int,
         case when r.capacity is null then null else greatest(r.capacity - coalesce(c.n, 0), 0) end::int,
         (r.capacity is not null and coalesce(c.n, 0) >= r.capacity)
    from public.agenda_breakout_rooms r
    join public.agenda_sessions s on s.id = r.session_id
    left join lateral (
      select count(*) as n
        from public.agenda_breakout_assignments a
        join public.event_members em
          on em.event_id = a.event_id and em.user_id = a.user_id and em.role = 'attendee'
       where a.room_id = r.id
    ) c on true
   where r.session_id = p_session_id
     and (public.is_event_member(s.event_id) or public.portal_is_global_admin())
   order by r.display_order, r.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_breakout_room_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_breakout_room_availability(uuid) TO authenticated;

-- ===========================================================================================
-- G. Backfill existing JSON rooms (idempotent: skips sessions that already have room rows)
-- ===========================================================================================

DO $$
DECLARE
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  s record;
  r jsonb;
  r_ord int;
  b jsonb;
  b_ord int;
  v_room_id uuid;
  v_fac uuid;
  v_fac_name text;
BEGIN
  FOR s IN
    SELECT a.id, a.event_id, a.breakout_rooms
      FROM public.agenda_sessions a
     WHERE jsonb_typeof(a.breakout_rooms) = 'array'
       AND jsonb_array_length(a.breakout_rooms) > 0
       AND NOT EXISTS (SELECT 1 FROM public.agenda_breakout_rooms x WHERE x.session_id = a.id)
  LOOP
    FOR r, r_ord IN SELECT e.value, e.ordinality::int - 1 FROM jsonb_array_elements(s.breakout_rooms) WITH ORDINALITY e LOOP
      v_fac_name := nullif(btrim(coalesce(r->>'facilitator_name', '')), '');
      v_fac := NULL;
      IF v_fac_name IS NOT NULL AND s.event_id IS NOT NULL THEN
        SELECT CASE WHEN count(*) = 1 THEN min(f.id::text)::uuid END INTO v_fac
          FROM public.facilitators f
         WHERE f.event_id = s.event_id AND lower(btrim(f.full_name)) = lower(v_fac_name);
      END IF;

      INSERT INTO public.agenda_breakout_rooms
        (id, session_id, legacy_key, name, description, facilitator_id, facilitator_name, display_order)
      VALUES (
        CASE WHEN coalesce(r->>'id', '') ~ c_uuid THEN (r->>'id')::uuid ELSE gen_random_uuid() END,
        s.id,
        CASE WHEN coalesce(r->>'id', '') ~ c_uuid THEN NULL ELSE nullif(r->>'id', '') END,
        btrim(r->>'name'),
        nullif(btrim(coalesce(r->>'description', '')), ''),
        v_fac,
        CASE WHEN v_fac IS NULL THEN v_fac_name END,
        r_ord
      )
      RETURNING id INTO v_room_id;

      FOR b, b_ord IN SELECT e.value, e.ordinality::int - 1 FROM jsonb_array_elements(coalesce(r->'agenda', '[]'::jsonb)) WITH ORDINALITY e LOOP
        INSERT INTO public.agenda_breakout_room_items
          (id, room_id, legacy_key, title, description, starts_at, ends_at, location, display_order)
        VALUES (
          CASE WHEN coalesce(b->>'id', '') ~ c_uuid THEN (b->>'id')::uuid ELSE gen_random_uuid() END,
          v_room_id,
          CASE WHEN coalesce(b->>'id', '') ~ c_uuid THEN NULL ELSE nullif(b->>'id', '') END,
          btrim(coalesce(nullif(btrim(b->>'title'), ''), 'Breakout item')),
          nullif(btrim(coalesce(b->>'description', '')), ''),
          nullif(b->>'starts_at', '')::timestamptz,
          nullif(b->>'ends_at', '')::timestamptz,
          nullif(btrim(coalesce(b->>'location', '')), ''),
          b_ord
        );
      END LOOP;
    END LOOP;

    PERFORM public.rebuild_breakout_rooms_json(s.id);
  END LOOP;
END $$;
