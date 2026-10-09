import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runWithConcurrency } from '@/lib/csvImport';
import { ensureAccountByEmail, ensureOrgMember, normalizeEmail, normalizeFullName } from '@/lib/accountProvisioning';

const MAX_PEOPLE = 500;

type PersonResult = {
  email: string;
  userId?: string;
  account?: 'created' | 'existing';
  organization?: 'added' | 'already_member';
  error?: string;
};

/**
 * Feature 017 — ensure people exist in this organisation (Organisation People
 * single add and spreadsheet import for client owners/admins).
 * Contract: specs/017-client-admin-team-setup/contracts/organization-people.md.
 *
 * Organization-scoped privileged route (constitution v1.1.0, Principle II):
 * the route's organisation is verified against the caller's own
 * organization_members row (owner/admin) or platform-admin status before the
 * service-role client is built. Membership is always created as 'member'
 * (FR-004); there is deliberately no role field. Stawi's own flows keep using
 * /api/admin/create-user and /api/admin/bulk-create-users unchanged.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
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
    authClient.from('profiles').select('global_role').eq('id', user.id).maybeSingle(),
    authClient.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle(),
  ]);
  const isPlatformAdmin = profile?.global_role === 'admin';
  const isOrgAdmin = membership?.role === 'owner' || membership?.role === 'admin';
  if (!isPlatformAdmin && !isOrgAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const people: unknown = body?.people;
  if (!Array.isArray(people) || people.length === 0 || people.length > MAX_PEOPLE) {
    return NextResponse.json({ error: 'invalid_request', message: `people must contain 1 to ${MAX_PEOPLE} entries.` }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('organizations/[organizationId]/people: missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'backend_error', message: 'Adding people is not configured on this server.' }, { status: 500 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const seen = new Set<string>();
  const results: PersonResult[] = await runWithConcurrency(people, 5, async (raw): Promise<PersonResult> => {
    const entry = raw as { email?: unknown; fullName?: unknown } | null;
    const email = normalizeEmail(entry?.email);
    const rawEmail = typeof entry?.email === 'string' ? entry.email.trim() : '';
    if (!email) return { email: rawEmail, error: 'invalid_email' };
    const fullName = normalizeFullName(entry?.fullName);
    if (fullName === null) return { email, error: 'invalid_name' };
    if (seen.has(email)) return { email, error: 'duplicate' };
    seen.add(email);

    const account = await ensureAccountByEmail(admin, email, fullName);
    if ('error' in account) return { email, error: account.error };

    const organization = await ensureOrgMember(admin, organizationId, account.userId);
    if (typeof organization !== 'string') return { email, userId: account.userId, account: account.account, error: organization.error };

    return { email, userId: account.userId, account: account.account, organization };
  }, (raw, _index, error) => {
    console.error('organizations/[organizationId]/people: unexpected error', error);
    const rawEmail = (raw as { email?: unknown } | null)?.email;
    return { email: typeof rawEmail === 'string' ? rawEmail.trim() : '', error: 'Could not add this person — try again' };
  });

  return NextResponse.json({ results });
}
