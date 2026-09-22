import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { deactivateAssignmentForRemoval, recordAuditEntry } from '@/lib/plannerPermissions';

/**
 * Feature 008 — internal, member-removal side effect (research.md R10,
 * contracts.md). Called fire-and-forget from `EventAssignmentsDropdown.tsx`
 * at the exact moment a member is unassigned from an event, in the same
 * non-blocking style as Feature 001's existing `syncToPlanner()` call.
 *
 * Authorization deliberately matches the ACTUAL current gating of the
 * removal action itself, not `canAdministerPlannerPermissions` — live
 * inspection of `event_members`'s RLS found its only DELETE policy is
 * `portal_is_global_admin()` (no organization-owner/admin DELETE policy
 * exists today), so this route requires the same to avoid a mismatch where
 * an organization admin could trigger a Planner-side deactivation for a
 * removal that the corresponding client-side `event_members` DELETE would
 * actually be silently denied by RLS. This does not change who may remove a
 * Portal event member — it only mirrors that reality precisely.
 *
 * `userId` may or may not still have an `event_members` row by the time this
 * executes — resolution below (`profiles.planner_profile_id`,
 * `event_planner_links`) does not depend on it existing.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ eventId: string; memberId: string }> }) {
  const { eventId, memberId: userId } = await params;
  if (!eventId || !userId) return NextResponse.json({ ok: true, status: 'unavailable' });

  const cookieStore = await cookies();
  const authClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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

  const { data: callerProfile } = await authClient.from('profiles').select('global_role').eq('id', user.id).maybeSingle();
  if (callerProfile?.global_role !== 'admin') {
    return NextResponse.json({ error: 'permission_admin_denied' }, { status: 403 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('planner-permissions/deactivate-on-removal: missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  const portalAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: targetProfile, error: profileError } = await portalAdmin.from('profiles').select('planner_profile_id').eq('id', userId).maybeSingle();
  if (profileError) {
    console.error('planner-permissions/deactivate-on-removal: profile lookup failed', profileError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!targetProfile?.planner_profile_id) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const { data: activeLink, error: linkError } = await portalAdmin
    .from('event_planner_links')
    .select('planner_event_id')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .maybeSingle();
  if (linkError) {
    console.error('planner-permissions/deactivate-on-removal: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  try {
    const { deactivationConfirmed } = await deactivateAssignmentForRemoval(activeLink.planner_event_id as number, targetProfile.planner_profile_id);

    // Best-effort snapshot for the audit row — a member-removal deactivation
    // that finds no existing assignment (deactivationConfirmed: false) still
    // gets an audit entry recording the attempt, per FR-041.
    await recordAuditEntry(portalAdmin, {
      eventId,
      memberUserId: userId,
      actorUserId: user.id,
      actionType: 'access_disabled',
      beforeState: null,
      afterState: { deactivationConfirmed },
      operationId: crypto.randomUUID(),
    });

    return NextResponse.json({ ok: true, deactivationConfirmed });
  } catch (err) {
    console.error('planner-permissions/deactivate-on-removal: deactivation failed', err);
    // Never blocks or reverses the Portal-side removal (FR-041) — the caller
    // (EventAssignmentsDropdown.tsx) fires this without awaiting the result.
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}
