import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { syncStaffMemberToPlanner } from '@/lib/plannerStaffSync';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  const userId = typeof body?.userId === 'string' ? body.userId : '';

  if (!eventId || !userId) {
    return NextResponse.json({ error: 'eventId and userId are required' }, { status: 400 });
  }

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
          // Read/write via RLS as the verified admin — no session refresh needed here.
        },
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

  // event_members.planner_synced_at/planner_sync_status/planner_sync_error/
  // planner_assignment_id are system-managed Bendie Planner integration
  // state (Feature 003 F-NEW-1 correction) -- `authenticated` no longer
  // holds UPDATE/INSERT privilege on these four columns at all (see
  // supabase/migrations/event_members_planner_metadata_update_privilege_fix.sql),
  // so writing them via the caller's own authClient would now fail outright.
  // This route already verified portal_is_global_admin() above via
  // authClient before reaching this point, so using the Portal service-role
  // client here changes no authorization behavior -- it mirrors the
  // identical, already-established pattern in the sibling
  // /api/admin/planner-pull-travel route for the same class of
  // system-managed-field problem on attendee_travel_details.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }
  const portalAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Extracted to src/lib/plannerStaffSync.ts (Feature 004) so this route and
  // the event-creation flow's own auto-sync of a staff-eligible creator call
  // the exact same implementation rather than drifting apart. This route's
  // only remaining job is its own authentication/authorization check above
  // and constructing the service-role client — behavior is otherwise
  // byte-for-byte identical to before this extraction. The only caller of
  // this route (members/page.tsx's syncToPlanner) is fire-and-forget and
  // never reads plannerProfileId/plannerAssignmentId from the response, so
  // the simplified {ok,status,reason} shape below is a safe, behavior-
  // preserving simplification, not a breaking change.
  const result = await syncStaffMemberToPlanner({ authClient, portalAdmin, eventId, userId });
  return NextResponse.json(result);
}
