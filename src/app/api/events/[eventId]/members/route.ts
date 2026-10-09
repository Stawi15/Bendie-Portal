import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { EVENT_MEMBER_ROLES } from '@/lib/eventMemberRoles';
import { ensureAccountByEmail, ensureOrgMember, normalizeEmail, normalizeFullName } from '@/lib/accountProvisioning';

/**
 * Feature 017 — ensure a person (by email) is on this event's single roster.
 * Contract: specs/017-client-admin-team-setup/contracts/event-members.md.
 *
 * Organization-scoped privileged route (constitution v1.1.0, Principle II):
 * the service-role client is used only after the caller is authorized for
 * THIS event's organization, resolved server-side from events.organization_id.
 *
 * Used by Planner "Add team member", Bendie "Invite new attendee" and the
 * event spreadsheet import. Grants no product access itself — the browser
 * runs the existing follow-ups (current-event pointer, Bendie access code,
 * Feature 008 Planner Enable/Save) afterwards.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

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

  // Read through the caller's own client: an event they cannot see is "not found".
  const { data: event } = await authClient.from('events').select('id, organization_id').eq('id', eventId).maybeSingle();
  if (!event) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  // Reused deliberately: its rule — platform admin, or owner/admin of the
  // event's OWN organization (resolved from events.organization_id) — is
  // exactly this route's rule, including for Bendie invites. Nothing about
  // it is Planner-specific here.
  if (!(await canAdministerPlannerPermissions(eventId, user.id, authClient))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const fullName = normalizeFullName(body?.fullName);
  const eventRole = body?.eventRole;
  if (!email || fullName === null || !(EVENT_MEMBER_ROLES as readonly string[]).includes(eventRole)) {
    return NextResponse.json(
      { error: 'invalid_request', message: 'A valid email, a name of at most 200 characters and a valid event role are required.' },
      { status: 400 }
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('events/[eventId]/members: missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'backend_error', message: 'Adding people is not configured on this server.' }, { status: 500 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const account = await ensureAccountByEmail(admin, email, fullName);
  if ('error' in account) {
    return NextResponse.json({ email, failedStep: 'account', error: account.error });
  }

  const organization = await ensureOrgMember(admin, event.organization_id, account.userId);
  if (typeof organization !== 'string') {
    return NextResponse.json({ email, userId: account.userId, account: account.account, failedStep: 'organization', error: organization.error });
  }

  const { error: insertError } = await admin
    .from('event_members')
    .insert({ event_id: eventId, user_id: account.userId, organization_id: event.organization_id, role: eventRole });

  if (insertError && insertError.code !== '23505') {
    console.error('events/[eventId]/members: event_members insert failed', insertError);
    return NextResponse.json({
      email,
      userId: account.userId,
      account: account.account,
      organization,
      failedStep: 'event',
      error: 'Could not add them to the event — try again',
    });
  }

  // An existing roster row keeps its role (spec FR-012); report what it is.
  let roleOnEvent: string = eventRole;
  if (insertError) {
    const { data: existing } = await admin
      .from('event_members')
      .select('role')
      .eq('event_id', eventId)
      .eq('user_id', account.userId)
      .maybeSingle();
    roleOnEvent = existing?.role ?? eventRole;
  }

  return NextResponse.json({
    userId: account.userId,
    email,
    account: account.account,
    organization,
    event: insertError ? 'already_member' : 'added',
    eventRole: roleOnEvent,
  });
}
