import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  const plannerEventId =
    typeof body?.plannerEventId === 'number' ? body.plannerEventId : null;
  const plannerEventTitle =
    typeof body?.plannerEventTitle === 'string' ? body.plannerEventTitle : null;

  if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });

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
          // Read-only auth check — no session refresh needed here.
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

  if (plannerEventId === null) {
    // Unlink — soft-deactivate, never delete the row (keeps history, and
    // never touches anything already pushed/pulled under the prior link).
    const { error } = await authClient
      .from('event_planner_links')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('event_id', eventId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, linked: false });
  }

  // Link (or re-link to a different Planner event) — an UPDATE of the
  // existing row if one exists, since event_id is the primary key.
  const { error } = await authClient.from('event_planner_links').upsert(
    {
      event_id: eventId,
      planner_event_id: plannerEventId,
      planner_event_title: plannerEventTitle,
      is_active: true,
      linked_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'event_id' }
  );

  if (error) {
    // 23505 here means the partial unique index on (planner_event_id) WHERE
    // is_active = true was violated — i.e. that Planner event is already
    // actively linked to a *different* Portal event (spec FR-004). An
    // inactive prior link never trips this, by design.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This Bendie Planner event is already linked to a different Portal event.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, linked: true });
}
