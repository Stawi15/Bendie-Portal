import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Feature 032 — how many players hold each Connects card in an event.
 * `connect_hands` is readable per player only, so the count needs the service
 * role. Authorised first, per request, with the same database rules as the
 * photo-game content policies: event host/organiser, organisation admin or
 * Stawi admin. Returns only counts (no player ids).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

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
          // Read-only handler: no session refresh.
        },
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const [host, orgAdmin, globalAdmin] = await Promise.all([
    authClient.rpc('is_event_host_or_organizer', { ev_id: eventId, uid: user.id }),
    authClient.rpc('is_event_org_admin', { ev_id: eventId }),
    authClient.rpc('portal_is_global_admin'),
  ]);
  if (!(host.data === true || orgAdmin.data === true || globalAdmin.data === true)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
  const { data, error } = await admin
    .from('connect_hands')
    .select('question_id')
    .eq('event_id', eventId)
    .limit(10000);
  if (error) {
    console.error('photo-games/hands: connect_hands read failed', error);
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.question_id] = (counts[row.question_id] ?? 0) + 1;
  return NextResponse.json({ counts });
}
