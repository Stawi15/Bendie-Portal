import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';

function dateKeyOf(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function timeOf(iso: string) {
  return new Date(iso).toISOString().slice(11, 16);
}

function dayLabelOf(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
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
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: callerProfile } = await authClient.from('profiles').select('global_role').eq('id', user.id).single();
  if (!callerProfile || callerProfile.global_role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: link } = await authClient
    .from('event_planner_links')
    .select('planner_event_id,is_active')
    .eq('event_id', eventId)
    .maybeSingle();

  if (!link || !link.is_active) {
    return NextResponse.json({ error: 'This event is not linked to Bendie Planner' }, { status: 400 });
  }

  // Feature 004: an active event_planner_links row no longer implies the
  // event uses Bendie -- it now also exists for Planner-only events, which
  // have no Bendie-side agenda content to push at all. This route's whole
  // purpose is moving Bendie-side content to Planner, so it additionally
  // requires 'bendie' in event_products; a Planner-only event is rejected
  // here rather than silently no-op'ing on an empty agenda. This does not
  // change behavior for any event that already has 'bendie' in
  // event_products (every event linked before Feature 004 shipped, via
  // Feature 002's backfill).
  const { data: bendieProduct } = await authClient
    .from('event_products')
    .select('product_key')
    .eq('event_id', eventId)
    .eq('product_key', 'bendie')
    .maybeSingle();

  if (!bendieProduct) {
    return NextResponse.json({ error: 'This event does not use Bendie — there is no agenda to synchronize.' }, { status: 400 });
  }

  const { data: sessions, error: sessionsError } = await authClient
    .from('agenda_sessions')
    .select('id,title,description,starts_at,ends_at,location,block_type,display_order,planner_agenda_item_id')
    .eq('event_id', eventId)
    .order('starts_at');

  if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 400 });

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, pushed: 0, failed: 0 });
  }

  // Separate flat queries joined in code — matches the existing agenda page's
  // established pattern, not a nested PostgREST embed (architecture-validation
  // correction: an embedded select shape was never actually used/verified
  // anywhere in this codebase).
  const sessionIds = sessions.map((s) => s.id);
  const [{ data: speakerRows }, { data: facilitators }] = await Promise.all([
    authClient.from('agenda_session_speakers').select('session_id,facilitator_id,speaker_type').in('session_id', sessionIds),
    authClient.from('facilitators').select('id,full_name').eq('event_id', eventId),
  ]);

  const facilitatorNameById = new Map((facilitators ?? []).map((f) => [f.id, f.full_name]));
  const speakersBySession = new Map<string, { facilitator_id: string; speaker_type: string }[]>();
  for (const row of speakerRows ?? []) {
    const list = speakersBySession.get(row.session_id) ?? [];
    list.push(row);
    speakersBySession.set(row.session_id, list);
  }

  // Same UTC-date-slice grouping key the existing agenda page uses for its
  // date sidebar (dateKeyOf), not its locale-display formatting.
  const distinctDates = Array.from(new Set(sessions.map((s) => dateKeyOf(s.starts_at)))).sort((a, b) => a.localeCompare(b));
  const dayNumberByDate = new Map(distinctDates.map((d, i) => [d, i + 1]));

  let planner;
  try {
    planner = getPlannerAdminClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const session of sessions) {
    const dateKey = dateKeyOf(session.starts_at);
    const speakers = speakersBySession.get(session.id) ?? [];
    const speakerNames = speakers
      .map((sp) => facilitatorNameById.get(sp.facilitator_id))
      .filter((name): name is string => Boolean(name));
    const host = speakers.find((sp) => sp.speaker_type === 'host');
    const hostName = host ? facilitatorNameById.get(host.facilitator_id) ?? null : null;

    const row = {
      event_id: link.planner_event_id,
      source_portal_session_id: session.id,
      day_number: dayNumberByDate.get(dateKey) ?? null,
      day_label: dayLabelOf(dateKey),
      agenda_date: dateKey,
      start_at: session.starts_at,
      end_at: session.ends_at,
      start_time: timeOf(session.starts_at),
      end_time: timeOf(session.ends_at),
      item_title: session.title,
      description: session.description,
      speakers: speakerNames.length > 0 ? speakerNames.join(', ') : null,
      mc: hostName,
      room_name: session.location,
      item_type: session.block_type,
      sort_order: session.display_order,
      is_parallel: false,
      source_document: 'bendie-portal',
    };

    // event_id + source_portal_session_id is the durable cross-system
    // identity (UNIQUE constraint on Planner's side, added alongside this
    // change) — a database-backed upsert against it means a retry after a
    // lost INSERT response rediscovers and updates the already-created row
    // instead of blindly inserting a second one. This replaces the old
    // "trust planner_agenda_item_id" branch, which had no way to recover
    // from that exact lost-response case. Existing Planner-native rows
    // (source_portal_session_id IS NULL) are never matched by this upsert,
    // since Postgres never treats NULL as equal to session.id.
    const { data: upserted, error } = await planner
      .from('event_agenda_items')
      .upsert(row, { onConflict: 'event_id,source_portal_session_id' })
      .select('agenda_item_id')
      .single();

    if (error || !upserted) {
      failed += 1;
      errors.push(`${session.title}: ${error?.message ?? 'upsert failed'}`);
      continue;
    }
    pushed += 1;
    await authClient
      .from('agenda_sessions')
      .update({ planner_agenda_item_id: upserted.agenda_item_id, planner_synced_at: new Date().toISOString() })
      .eq('id', session.id);
  }

  return NextResponse.json({ ok: true, pushed, failed, errors: errors.length > 0 ? errors : undefined });
}
