import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { runWithConcurrency } from '@/lib/csvImport';
import { ensureAccountByEmail } from '@/lib/accountProvisioning';
import { readCallerProfile } from '@/lib/callerProfile';

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

  const { data: profile } = await readCallerProfile(user.id);

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

      // Feature 027 (C1): existing accounts are resolved here with the service role —
      // the People page can no longer look emails up from the browser. Same silent,
      // no-email provisioning as /api/admin/create-user for new ones; an existing
      // account's name is left unchanged, as before.
      const outcome = await ensureAccountByEmail(adminClient, input.email, input.fullName ?? '');
      if ('error' in outcome) return { email: input.email, error: outcome.error };
      return { email: input.email, id: outcome.userId };
    },
    (input, _index, error) => ({
      email: input.email,
      error: error instanceof Error ? error.message : 'Unexpected error while creating this user',
    })
  );

  return NextResponse.json({ results });
}
