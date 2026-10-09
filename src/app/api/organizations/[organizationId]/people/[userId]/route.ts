import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 019 (US1) — edit a person's profile on behalf of their organisation.
 *
 * `profiles` UPDATE is only allowed on your own row or for platform admins, so
 * a client org admin's edit of a colleague silently changed nothing. This
 * organisation-scoped privileged route (constitution v1.1.0, Principle II)
 * authorises: platform admin, or an owner/admin of the route's organisation
 * editing a member of that same organisation who is not a platform admin.
 * `email` is used to match accounts across the Portal and Planner, so only
 * platform admins may change it.
 */
const LIMITS: Record<string, number> = { full_name: 200, phone: 500, job_title: 500, avatar_url: 500, bio: 2000, email: 320 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ organizationId: string; userId: string }> }) {
  const { organizationId, userId } = await params;

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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: 'backend_error', message: 'Editing people is not configured on this server.' }, { status: 500 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const [{ data: caller }, { data: callerMembership }, { data: target }, { data: targetMembership }] = await Promise.all([
    admin.from('profiles').select('global_role').eq('id', user.id).maybeSingle(),
    admin.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle(),
    admin.from('profiles').select('id, global_role').eq('id', userId).maybeSingle(),
    admin.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle(),
  ]);
  const callerIsPlatformAdmin = caller?.global_role === 'admin';
  const callerIsOrgAdmin = callerMembership?.role === 'owner' || callerMembership?.role === 'admin';
  if (!callerIsPlatformAdmin && !callerIsOrgAdmin) return NextResponse.json({ error: 'forbidden', message: 'Only organisation admins can edit people.' }, { status: 403 });
  if (!target || (!targetMembership && !callerIsPlatformAdmin)) return NextResponse.json({ error: 'not_found', message: 'That person is not in this organisation.' }, { status: 404 });
  if (target.global_role === 'admin' && !callerIsPlatformAdmin) {
    return NextResponse.json({ error: 'forbidden', message: 'Stawi staff profiles can only be edited by Stawi.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_request', message: 'Malformed request body.' }, { status: 400 });
  const patch: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(body as Record<string, unknown>)) {
    if (!(key in LIMITS)) return NextResponse.json({ error: 'invalid_request', message: `Unsupported field: ${key}.` }, { status: 400 });
    if (key === 'email' && !callerIsPlatformAdmin) {
      return NextResponse.json({ error: 'forbidden', message: 'Only Stawi can change someone’s email.' }, { status: 403 });
    }
    if (raw !== null && typeof raw !== 'string') return NextResponse.json({ error: 'invalid_request', message: `${key} must be text.` }, { status: 400 });
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value.length > LIMITS[key]) return NextResponse.json({ error: 'invalid_request', message: `${key.replace('_', ' ')} is too long.` }, { status: 400 });
    patch[key] = value || null;
  }
  if ('full_name' in patch && !patch.full_name) return NextResponse.json({ error: 'invalid_request', message: 'Name is required.' }, { status: 400 });
  if (patch.email && !EMAIL_RE.test(patch.email)) return NextResponse.json({ error: 'invalid_request', message: 'Enter a valid email address.' }, { status: 400 });
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { data: updated, error } = await admin.from('profiles').update(patch).eq('id', userId).select('id').maybeSingle();
  if (error || !updated) {
    console.error('organizations/[organizationId]/people/[userId]: update failed', error);
    return NextResponse.json({ error: 'backend_error', message: 'Could not save — try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
