import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { runWithConcurrency } from '@/lib/csvImport';

type BulkUserInput = { email: string; fullName?: string };
type BulkUserResult = { email: string; id?: string; error?: string };

/**
 * Batch version of /api/admin/create-user for CSV bulk import.
 * Auth/admin check happens ONCE here, not once per user, unlike calling the
 * single-user route in a loop would require — that's the whole point of this
 * route existing separately for imports of hundreds of rows.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const users: unknown = body?.users;

  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ error: 'users array is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll() {
          // Read-only route — no session refresh needed here.
        },
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await authClient
    .from('profiles')
    .select('global_role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.global_role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY — bulk user creation is not configured.' },
      { status: 500 }
    );
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const inputs: BulkUserInput[] = users
    .filter((u): u is Record<string, unknown> => typeof u === 'object' && u !== null)
    .map((u) => ({
      email: typeof u.email === 'string' ? u.email.trim() : '',
      fullName: typeof u.fullName === 'string' ? u.fullName.trim() : undefined,
    }));

  const results = await runWithConcurrency<BulkUserInput, BulkUserResult>(
    inputs,
    10,
    async (input) => {
      if (!input.email) return { email: input.email, error: 'Email is required' };

      // Same silent, no-email account provisioning as /api/admin/create-user —
      // these accounts sign in via the Evently-App's event-access codes, not
      // email/password here.
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: input.email,
        email_confirm: true,
        user_metadata: input.fullName ? { full_name: input.fullName } : undefined,
      });

      if (createError || !created?.user) {
        return { email: input.email, error: createError?.message ?? 'Failed to create user' };
      }

      if (input.fullName) {
        await adminClient.from('profiles').update({ full_name: input.fullName }).eq('id', created.user.id);
      }

      return { email: input.email, id: created.user.id };
    },
    (input, _index, error) => ({
      email: input.email,
      error: error instanceof Error ? error.message : 'Unexpected error while creating this user',
    })
  );

  return NextResponse.json({ results });
}
