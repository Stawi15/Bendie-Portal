import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';

export async function GET(_request: NextRequest) {
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

  let planner;
  try {
    planner = getPlannerAdminClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const { data: plannerEvents, error: plannerError } = await planner
    .from('events')
    .select('event_id,event_title,location,start_date,end_date,organization_id')
    .order('start_date', { ascending: false });

  if (plannerError) {
    return NextResponse.json({ error: plannerError.message }, { status: 502 });
  }

  // Flat, unscoped by organization (spec decision #4) — but each entry is
  // annotated with whether it's already actively linked to a Portal event,
  // so the picker can mark it unavailable instead of silently offering a
  // selection that FR-004 would only reject.
  const { data: activeLinks } = await authClient
    .from('event_planner_links')
    .select('planner_event_id')
    .eq('is_active', true);

  const linkedPlannerEventIds = new Set((activeLinks ?? []).map((l) => l.planner_event_id));

  const events = (plannerEvents ?? []).map((e) => ({
    ...e,
    is_actively_linked: linkedPlannerEventIds.has(e.event_id),
  }));

  return NextResponse.json({ events });
}
