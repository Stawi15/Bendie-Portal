import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPortalAdminClient } from '@/lib/orgProductsAdminServer';
import { readCallerProfile } from '@/lib/callerProfile';

/**
 * Feature 028 (US3): the event Gallery is read through the service role, because Bendie
 * now hides a blocked author's posts from whoever blocked them — organisers and Stawi
 * admins included — which would leave those photos unmoderatable in the Portal.
 *
 * These routes re-apply exactly the access the `posts` RLS gave the Gallery page before:
 * - read: Stawi admins see every post; other event members see visible posts and their own;
 * - hide / delete: Stawi admins, or the post's author (`posts_update_own` / `posts_delete_own`).
 */
export type GalleryCaller = {
  authClient: SupabaseClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  userId: string;
  isPlatformAdmin: boolean;
};

export async function resolveGalleryCaller(eventId: string): Promise<GalleryCaller | NextResponse> {
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  const cookieStore = await cookies();
  const authClient: SupabaseClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // No session refresh needed for these handlers.
      },
    },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  let admin;
  try {
    admin = getPortalAdminClient();
  } catch (err) {
    console.error('gallery: missing service role', err);
    return NextResponse.json({ error: 'backend_error', message: 'The gallery isn’t configured on this server.' }, { status: 500 });
  }

  const { data: profile } = await readCallerProfile(user.id);
  const isPlatformAdmin = profile?.global_role === 'admin';
  if (!isPlatformAdmin) {
    // Same rule as the `posts_event_scope_*` RLS: you must be a member of the event.
    const { data: membership, error } = await admin.from('event_members').select('user_id').eq('event_id', eventId).eq('user_id', user.id).maybeSingle();
    if (error) {
      console.error('gallery: membership check failed', error);
      return NextResponse.json({ error: 'backend_error', message: 'We couldn’t check your access. Try again.' }, { status: 500 });
    }
    if (!membership) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }
  return { authClient, admin, userId: user.id, isPlatformAdmin };
}
