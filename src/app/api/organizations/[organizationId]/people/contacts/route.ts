import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readCallerProfile } from '@/lib/callerProfile';

/**
 * Feature 027 (C1 readiness): email/phone of every member of one organisation,
 * for the organisation's own lists (People, teams, pickers).
 *
 * Organisation-scoped privileged route (constitution v1.1.0, Principle II). It
 * authorises a Stawi admin, or an owner/admin of the route's organisation. That
 * is exactly the `is_organization_admin` clause of Bendie's own
 * `can_view_profile_contact`, so this route never shows a contact that Bendie's
 * rule would hide. `globalRoles` (Portal admin access) is returned to Stawi
 * admins only (spec FR-006). Anyone else gets 403 and the lists show names only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  if (!organizationId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const cookieStore = await cookies();
  const authClient: SupabaseClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // No session refresh needed for this handler.
      },
    },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const [{ data: profile }, { data: membership }] = await Promise.all([
    readCallerProfile(user.id),
    authClient.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle(),
  ]);
  const isPlatformAdmin = profile?.global_role === 'admin';
  const isOrgAdmin = membership?.role === 'owner' || membership?.role === 'admin';
  if (!isPlatformAdmin && !isOrgAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('organizations/[organizationId]/people/contacts: missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'backend_error' }, { status: 500 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: members, error: membersError } = await admin.from('organization_members').select('user_id').eq('organization_id', organizationId);
  if (membersError) {
    console.error('organizations/[organizationId]/people/contacts: members lookup failed', membersError);
    return NextResponse.json({ error: 'backend_error' }, { status: 500 });
  }
  const ids = [...new Set((members ?? []).map((m) => m.user_id as string))];
  const contacts: Record<string, { email: string | null; phone: string | null }> = {};
  const globalRoles: Record<string, string> = {};

  // Chunked so a large organisation never builds an over-long request URL.
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows, error } = await admin.from('profiles').select('id, email, phone, global_role').in('id', ids.slice(i, i + 200));
    if (error) {
      console.error('organizations/[organizationId]/people/contacts: profiles lookup failed', error);
      return NextResponse.json({ error: 'backend_error' }, { status: 500 });
    }
    for (const row of rows ?? []) {
      contacts[row.id] = { email: row.email ?? null, phone: row.phone ?? null };
      if (row.global_role) globalRoles[row.id] = row.global_role;
    }
  }

  return NextResponse.json({ contacts, globalRoles: isPlatformAdmin ? globalRoles : null });
}
