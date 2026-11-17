import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readCallerProfile } from '@/lib/callerProfile';
import { escapeLikePattern } from '@/lib/plannerStaffSync';
import { normalizeEmail } from '@/lib/accountProvisioning';

/**
 * Feature 027 (C1 readiness): "Search existing" in Add person, for adding an
 * existing account to this organisation. The browser used to `ilike` every
 * profile's email, which C1 removes.
 *
 * - A Stawi admin gets a partial email match (at most 5 accounts), as before.
 * - An owner/admin of the route's organisation must type the full email
 *   address and gets that one account if it exists (spec FR-008). This stops
 *   the Portal from being a directory of every user's email.
 * - Anyone else gets 403.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  if (!organizationId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (!query || query.length > 320) return NextResponse.json({ error: 'invalid_request', message: 'Enter an email to search for.' }, { status: 400 });

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

  let pattern: string;
  let limit: number;
  if (isPlatformAdmin) {
    pattern = `%${escapeLikePattern(query)}%`;
    limit = 5;
  } else {
    const email = normalizeEmail(query);
    if (!email) {
      return NextResponse.json({ error: 'invalid_request', message: 'Enter their full email address.', exactOnly: true }, { status: 400 });
    }
    pattern = escapeLikePattern(email);
    limit = 1;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('organizations/[organizationId]/people/search: missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'backend_error', message: 'Search is not configured on this server.' }, { status: 500 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.from('profiles').select('id, full_name, email, avatar_url').ilike('email', pattern).limit(limit);
  if (error) {
    console.error('organizations/[organizationId]/people/search: lookup failed', error);
    return NextResponse.json({ error: 'backend_error', message: 'Search failed — try again.' }, { status: 500 });
  }
  return NextResponse.json({ results: data ?? [], exactOnly: !isPlatformAdmin });
}
