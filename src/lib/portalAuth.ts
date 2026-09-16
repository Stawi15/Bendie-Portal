import { supabase } from '@/lib/supabaseClient';

/**
 * Check if user can manage a specific event
 * Requires host, organizer, or admin role
 */
export async function canManageEvent(eventId: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('event_members')
      .select('role')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .single();

    if (error || !data) return false;

    return data.role === 'host' || data.role === 'organizer' || data.role === 'admin';
  } catch (err) {
    console.error('Error checking event access:', err);
    return false;
  }
}

/**
 * Get all events accessible to the current user, scoped to `organizationId`
 * for non-admins (Feature 003 FR-007/FR-011).
 *
 * Global admins (profiles.global_role = 'admin') see ALL events, unchanged.
 *
 * For everyone else, this issues one organization-scoped query and lets RLS
 * determine which rows actually come back per caller -- an organization
 * owner/admin sees every event in the organization via the additive
 * events_select_org_admin policy (event METADATA visibility only, never
 * workspace/content access — see src/lib/eventAuth.ts), an ordinary member
 * sees only events they hold an explicit event_members row for via the
 * existing events_select_member policy. No role branching happens here:
 * branching on a client-known role would duplicate what RLS already has to
 * enforce authoritatively, and would risk trusting a stale/client-side role
 * claim instead of the database's own answer.
 */
export async function getAccessibleEvents(
  organizationId?: string | null
): Promise<
  Array<{
    id: string;
    name: string;
    status: string;
    starts_at: string | null;
  }>
> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    // Check if user is a global admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('global_role')
      .eq('id', user.id)
      .single();

    if (profile?.global_role === 'admin') {
      // Global admins see all events, ordered by most recent
      const { data, error } = await supabase
        .from('events')
        .select('id, name, status, starts_at')
        .order('starts_at', { ascending: false });

      if (error || !data) return [];
      return data;
    }

    if (!organizationId) return [];

    const { data, error } = await supabase
      .from('events')
      .select('id, name, status, starts_at')
      .eq('organization_id', organizationId)
      .order('starts_at', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch (err) {
    console.error('Error fetching accessible events:', err);
    return [];
  }
}

/**
 * Get all organisations accessible to the current user.
 * Global admins (profiles.global_role = 'admin') see ALL organisations;
 * everyone else sees only the organisations they belong to via organization_members.
 */
export async function getAccessibleOrganizations(): Promise<
  Array<{
    id: string;
    name: string;
    slug: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }>
> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profile } = await supabase
      .from('profiles')
      .select('global_role')
      .eq('id', user.id)
      .single();

    if (profile?.global_role === 'admin') {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name', { ascending: true });

      if (error || !data) return [];
      return data;
    }

    // Explicit, deterministic order on the base `organization_members` row (not the
    // embedded `organizations` object — `.order()` without `foreignTable` always
    // targets the query's own `.from()` table) — review finding: without this, this
    // query and the structurally different plain-select fallback query
    // Feature 005's `GET /api/events/[eventId]/planner-overview` route runs against
    // the same table had no shared ordering guarantee, so index [0] (used by both as
    // the "no usable saved selection" fallback) was not provably the same organization
    // in both places. `organization_id` was chosen deliberately as a pure tie-break —
    // it carries no product meaning (not join date, not name, not entitlement) — so
    // this fixes determinism only, without silently redefining "the fallback
    // organization" as "oldest membership" or any other new semantic.
    const { data, error } = await supabase
      .from('organization_members')
      .select('organizations(id,name,slug,created_by,created_at,updated_at)')
      .eq('user_id', user.id)
      .order('organization_id', { ascending: true });

    if (error || !data) return [];

    return data
      .map((row) => row.organizations)
      .filter((org): org is NonNullable<typeof org> => Boolean(org)) as unknown as Array<{
      id: string;
      name: string;
      slug: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    }>;
  } catch (err) {
    console.error('Error fetching accessible organisations:', err);
    return [];
  }
}

/**
 * Check if user has organization-level admin access
 */
export async function isOrgAdmin(organizationId: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (error || !data) return false;

    return data.role === 'owner' || data.role === 'admin';
  } catch (err) {
    console.error('Error checking org admin access:', err);
    return false;
  }
}

/**
 * Get user's role for a specific event
 */
export async function getUserEventRole(eventId: string): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('event_members')
      .select('role')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .single();

    if (error || !data) return null;

    return data.role;
  } catch (err) {
    console.error('Error fetching user event role:', err);
    return null;
  }
}

/**
 * Check if user requires MFA (has admin/organizer/host role)
 */
export async function requiresMFA(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    // Check for event-level admin roles
    const { data: eventAdmin } = await supabase
      .from('event_members')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['host', 'organizer', 'admin'])
      .limit(1)
      .single();

    // Check for org-level admin roles
    const { data: orgAdmin } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .single();

    return !!eventAdmin || !!orgAdmin;
  } catch (err) {
    console.error('Error checking MFA requirement:', err);
    return false;
  }
}
