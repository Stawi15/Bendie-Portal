import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';

// Live-verified shapes (all_flights_combined_table): despite the name,
// departuretime/arrivaltime are plain time-only text ("17:00:00" or "06:45"),
// never a date — date_time is the only column that actually carries the
// flight's date. The old code sliced departuretime as if it might be a full
// timestamp, which on real data produced the time string itself where a date
// was expected. One rule now: date always comes from date_time alone, time
// always comes from the typed depart_time column (falling back to the
// legacy departuretime text only if depart_time is null) — never mixed.
function toShortTime(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function toDateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

type TravelRow = {
  user_id: string;
  event_id: string;
  type: 'flight' | 'other';
  title: string | null;
  boarding_time: string | null;
  date: string | null;
  travel_time: string | null;
  pickup_location: string | null;
  source_planner_key: string;
  synced_from_planner_at: string;
};

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

  // Feature 004: see the identical guard/comment in planner-push-agenda's
  // route — an active event_planner_links row no longer implies Bendie
  // usage. This route's destination (attendee_travel_details, surfaced on
  // a 'bendie'-classified tab) has no Bendie-side attendee experience to
  // receive pulled travel data for a Planner-only event.
  const { data: bendieProduct } = await authClient
    .from('event_products')
    .select('product_key')
    .eq('event_id', eventId)
    .eq('product_key', 'bendie')
    .maybeSingle();

  if (!bendieProduct) {
    return NextResponse.json({ error: 'This event does not use Bendie — there is nothing to pull travel data into.' }, { status: 400 });
  }

  let planner;
  try {
    planner = getPlannerAdminClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const [{ data: flights, error: flightsError }, { data: hotels, error: hotelsError }] = await Promise.all([
    planner
      .from('all_flights_combined_table')
      .select('record_id,flight,departuretime,date_time,depart_time,passenger_id')
      .eq('event_id', link.planner_event_id),
    planner
      .from('hotel_bookings')
      .select('booking_id,hotel_name,room_number,check_in_date,check_out_date,passenger_id')
      .eq('event_id', link.planner_event_id),
  ]);

  // A failed query must never be treated as "nothing to pull" — that would
  // report a false success (pulled: 0) instead of telling the admin the
  // integration itself failed. Bug found during review after T033.
  if (flightsError || hotelsError) {
    const message = flightsError?.message ?? hotelsError?.message ?? 'Failed to read travel data from Bendie Planner';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const passengerIds = Array.from(
    new Set([...(flights ?? []).map((f) => f.passenger_id), ...(hotels ?? []).map((h) => h.passenger_id)].filter(
      (id): id is number => id !== null && id !== undefined
    ))
  );

  let passengers: { passenger_id: number; full_name: string; email: string | null }[] = [];
  if (passengerIds.length > 0) {
    const { data, error: passengersError } = await planner
      .from('passengers')
      .select('passenger_id,full_name,email')
      .in('passenger_id', passengerIds);
    if (passengersError) {
      return NextResponse.json({ error: passengersError.message }, { status: 502 });
    }
    passengers = data ?? [];
  }

  const passengerById = new Map(passengers.map((p) => [p.passenger_id, p]));

  // Event-scoped matching (not a global Portal search) — only members of
  // *this* linked event are candidates.
  const { data: eventMembers, error: eventMembersError } = await authClient
    .from('event_members')
    .select('user_id,profiles!event_members_user_id_fkey(email)')
    .eq('event_id', eventId);

  if (eventMembersError) {
    return NextResponse.json({ error: eventMembersError.message }, { status: 500 });
  }

  const userIdByEmail = new Map<string, string>();
  for (const m of (eventMembers ?? []) as unknown as { user_id: string; profiles: { email: string | null } | null }[]) {
    if (m.profiles?.email) userIdByEmail.set(m.profiles.email.toLowerCase(), m.user_id);
  }

  const rows: TravelRow[] = [];
  const unmatchedEmails: string[] = [];
  const now = new Date().toISOString();

  for (const f of flights ?? []) {
    const passenger = f.passenger_id !== null ? passengerById.get(f.passenger_id) : undefined;
    const userId = passenger?.email ? userIdByEmail.get(passenger.email.toLowerCase()) : undefined;
    if (!userId) {
      // A passenger with no email on file is just as unmatched as one whose
      // email doesn't resolve — both must be skipped AND reported (FR-022).
      // Bug found live during T033: this previously only reported the
      // latter case, silently dropping no-email passengers from the count.
      unmatchedEmails.push(passenger?.email ?? `${passenger?.full_name ?? 'Unknown passenger'} (no email on file)`);
      continue;
    }
    rows.push({
      user_id: userId,
      event_id: eventId,
      type: 'flight',
      title: f.flight,
      boarding_time: toShortTime(f.depart_time) ?? toShortTime(f.departuretime),
      date: toDateOnly(f.date_time),
      travel_time: null,
      pickup_location: null,
      source_planner_key: `flight:${f.passenger_id}:${f.record_id}`,
      synced_from_planner_at: now,
    });
  }

  for (const h of hotels ?? []) {
    const passenger = passengerById.get(h.passenger_id);
    const userId = passenger?.email ? userIdByEmail.get(passenger.email.toLowerCase()) : undefined;
    if (!userId) {
      unmatchedEmails.push(passenger?.email ?? `${passenger?.full_name ?? 'Unknown passenger'} (no email on file)`);
      continue;
    }
    rows.push({
      user_id: userId,
      event_id: eventId,
      type: 'other',
      title: h.hotel_name,
      boarding_time: null,
      date: h.check_in_date,
      travel_time: h.check_in_date && h.check_out_date ? `${h.check_in_date} – ${h.check_out_date}` : null,
      pickup_location: h.room_number ? `${h.hotel_name ?? ''} · Room ${h.room_number}`.trim() : h.hotel_name,
      source_planner_key: `hotel:${h.passenger_id}:${h.booking_id}`,
      synced_from_planner_at: now,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, pulled: 0, unmatched: unmatchedEmails.length, unmatchedEmails });
  }

  // The two restrictive RLS policies on attendee_travel_details block any
  // client-authenticated INSERT/UPDATE of a Planner-sourced row (source_planner_key
  // IS NOT NULL) by design — this write MUST use the Portal service-role
  // client, never the authenticated admin client, or every one of these
  // upserts would fail (plan.md's Remaining Technical Risks).
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }
  const portalAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: upsertError } = await portalAdmin
    .from('attendee_travel_details')
    .upsert(rows, { onConflict: 'event_id,source_planner_key' });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    pulled: rows.length,
    unmatched: unmatchedEmails.length,
    unmatchedEmails: unmatchedEmails.length > 0 ? unmatchedEmails : undefined,
  });
}
