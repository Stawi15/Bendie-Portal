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
 * Get all events accessible to the current user.
 * Global admins (profiles.global_role = 'admin') see ALL events.
 */
export async function getAccessibleEvents(): Promise<
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

    if (!profile || profile.global_role !== 'admin') return [];

    // Global admins see all events, ordered by most recent
    const { data, error } = await supabase
      .from('events')
      .select('id, name, status, starts_at')
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

    const { data, error } = await supabase
      .from('organization_members')
      .select('organizations(id,name,slug,created_by,created_at,updated_at)')
      .eq('user_id', user.id);

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
