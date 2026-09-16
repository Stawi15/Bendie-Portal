-- Organization & Event Access Foundation (Feature 003) -- third corrective
-- pass, R3-F2. Baseline migration bringing pre-existing authorization helper
-- functions under version control.
--
-- Discovery: is_organization_member(), is_organization_admin(),
-- is_event_member(), is_event_host_or_organizer(), is_event_manager(), and
-- is_global_admin() are referenced throughout supabase/migrations/ (RLS
-- policies, triggers) and throughout the application, but have no
-- CREATE FUNCTION anywhere in this migrations directory -- only
-- portal_is_global_admin() (006_global_admin_rls_bypass.sql) is
-- version-controlled. They must have been created directly against the live
-- database (dashboard/SQL editor) before this repository's migration history
-- began being comprehensive, predating Feature 001/002/003 entirely.
--
-- This is a real reproducibility gap: a fresh database built solely from
-- committed migrations would fail the first time any later migration (008
-- onward) references one of these functions. It also meant their actual
-- authorization logic was unverifiable from source control.
--
-- This migration does NOT change behavior. Each body below is the EXACT
-- current live definition, verified via pg_get_functiondef() immediately
-- before writing this file -- not reconstructed from memory or assumption,
-- per this corrective pass's explicit instruction. CREATE OR REPLACE is
-- idempotent and safe to apply against the current live database (it
-- replaces each function with a byte-for-byte-equivalent body) while also
-- being the correct statement for a fresh database where these functions
-- don't exist yet.
--
-- Named with a "000_" prefix so it sorts before every existing numbered
-- migration (earliest existing committed file is "003_seed_data.sql"),
-- establishing it as a true foundational baseline for a fresh environment,
-- without renaming, editing, or reordering any already-applied migration
-- file (this repository's migration-immutability rule).
--
-- KNOWN REMAINING GAP (documented, not resolved by this migration): this
-- baseline covers only the authorization helper functions Feature 003's own
-- migrations and the ones referencing them transitively depend on. It is
-- NOT a full schema baseline/squash -- tables, other functions, views, and
-- RLS policies created before this repository's migration history became
-- comprehensive are still not fully reproducible from committed migrations
-- alone (see this feature's research.md and schema-reference.md for the
-- full reproducibility audit and recommended follow-up).

CREATE OR REPLACE FUNCTION public.portal_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND global_role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_global_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.global_role::text = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_organization_member(org_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = uid
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_organization_admin(org_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = uid
      and om.role in ('owner', 'admin')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_event_member(ev_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = ev_id
      and em.user_id = uid
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_event_host_or_organizer(ev_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = ev_id
      and em.user_id = uid
      and em.role in ('host', 'organizer', 'admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_event_manager(ev_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.event_members em
    where em.event_id = ev_id
      and em.user_id = uid
      and em.role in ('host', 'organizer', 'admin')
  );
$function$;
