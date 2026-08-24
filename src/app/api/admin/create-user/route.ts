import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const orgRole = typeof body?.orgRole === 'string' ? body.orgRole : 'member';

  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: 'Organisation is required' }, { status: 400 });

  // Verify the caller is an authenticated global admin before doing anything
  // privileged — this route uses the service role key below, so it must
  // never trust the client without checking session + role itself.
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
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY — user invites are not configured.' },
      { status: 500 }
    );
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Attendees don't sign in with email/password here — they log into the
  // Evently-App, which issues its own event-access codes once an
  // event_members row exists for them. So this just provisions the account
  // (profiles row, via the on-signup trigger) with no password and no email
  // sent — createUser (not inviteUserByEmail) is what makes that silent.
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createError || !created?.user) {
    return NextResponse.json({ error: createError?.message ?? 'Failed to create user' }, { status: 400 });
  }

  const newUserId = created.user.id;

  // Make sure the profile carries the name we were given, regardless of
  // whether the on-signup trigger already picked it up from user metadata.
  if (fullName) {
    await adminClient.from('profiles').update({ full_name: fullName }).eq('id', newUserId);
  }

  const { error: memberError } = await adminClient
    .from('organization_members')
    .insert({ organization_id: organizationId, user_id: newUserId, role: orgRole });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  return NextResponse.json({ id: newUserId, email: created.user.email, fullName: fullName || null });
}
