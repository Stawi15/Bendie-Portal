import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import { FULL_ACCESS_PORTAL_ROLES, defaultFlagsForPortalRole } from '@/lib/plannerPermissionPresets';

const STAFF_ROLES = ['host', 'organizer', 'admin', 'facilitator', 'staff', 'speaker'];

// '%'/'_' are wildcard characters to Postgres LIKE/ILIKE, and both are legal
// in a real email's local part. Escaping them turns ilike into an exact,
// case-insensitive comparison instead of a pattern match — no separate
// citext/lower() column exists on Planner's profiles.email to compare
// against instead, so this is the minimal fix that doesn't touch Portal's
// own broader email-case policy at all.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// Planner's profiles.email has a live UNIQUE constraint, and auth.users.email
// is enforced unique by Supabase Auth itself (users_email_partial_key) — so a
// duplicate-email createUser() failure (code: 'email_exists', live-verified)
// is a deterministic, recoverable signal that a concurrent request already
// won this identity, not a genuine failure. Recovering means re-fetching by
// the same exact-match query, with a short bounded retry since the winner's
// own explicit profiles insert (no auth-seed trigger exists on Planner) may
// not have landed yet at the exact instant the loser's createUser rejects.
export async function findOrCreatePlannerProfile(
  planner: ReturnType<typeof getPlannerAdminClient>,
  email: string,
  fullName: string | null
): Promise<{ id: string } | { error: string }> {
  const pattern = escapeLikePattern(email);

  const { data: existing } = await planner.from('profiles').select('id').ilike('email', pattern).maybeSingle();
  if (existing) return { id: existing.id };

  const { data: created, error: createError } = await planner.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createError || !created?.user) {
    // A clean 'email_exists' is the common shape of "someone else won this
    // race," but live-verified under real concurrent load (6 simultaneous
    // requests), Planner's Auth API can also surface a noisier/opaque
    // transient error for the exact same underlying race — not just that
    // one clean code. A cheap re-fetch recovers the correct outcome either
    // way, so it's attempted on any createUser failure, not gated on a
    // specific error code; only if recovery also finds nothing is the
    // original error treated as genuine and reported.
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      const { data: winner } = await planner.from('profiles').select('id').ilike('email', pattern).maybeSingle();
      if (winner) return { id: winner.id };
    }
    return { error: createError?.message || 'Failed to create a Bendie Planner account' };
  }

  const { error: profileInsertError } = await planner.from('profiles').insert({
    id: created.user.id,
    email,
    full_name: fullName,
  });

  if (profileInsertError) {
    return { error: `Bendie Planner account created, but the profile record failed: ${profileInsertError.message}` };
  }

  return { id: created.user.id };
}

// Behavior-identical refactor (Feature 008 research.md R6): the role
// classification and flag shapes themselves now live in
// plannerPermissionPresets.ts as the single canonical
// FULL_ACCESS_PORTAL_ROLES/VIEWER_FLAGS/MANAGER_FLAGS, so Feature 008's own
// "Enable" initial defaults can never drift from what this function has
// always produced. access_role is derived the same way it always was.
function roleToPlannerFlags(portalRole: string) {
  const fullAccess = FULL_ACCESS_PORTAL_ROLES.has(portalRole);
  return {
    access_role: fullAccess ? 'admin' : 'member',
    ...defaultFlagsForPortalRole(portalRole),
  };
}

export type StaffSyncOutcome = { ok: true; status: 'succeeded' | 'failed' | 'skipped'; reason?: string };

/**
 * Shared staff-sync logic (Feature 001), extracted so both
 * /api/admin/planner-sync-member (an admin manually re-syncing a member)
 * and Feature 004's event-creation flow (auto-syncing a staff-eligible
 * creator on a newly provisioned Planner/Both event) call the exact same
 * implementation rather than two copies drifting apart. Behavior is
 * byte-for-byte the same as the route this was extracted from.
 *
 * Callers are responsible for their own authorization check before calling
 * this — it performs no auth of its own, matching every other privileged
 * helper in this codebase (see src/lib/plannerAdmin.ts's own convention).
 *
 * `authClient`/`portalAdmin` are deliberately untyped (no <Database>
 * generic), matching this codebase's existing convention for every
 * service-role/Planner-touching client.
 */
export async function syncStaffMemberToPlanner(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalAdmin: any;
  eventId: string;
  userId: string;
}): Promise<StaffSyncOutcome> {
  const { authClient, portalAdmin, eventId, userId } = params;

  // event_planner_links is admin-only RLS (`portal_is_global_admin()` only —
  // see plannerEventProvisioning.ts's own use of this table). This helper is
  // also called from Feature 004's event-creation flow with the ORIGINAL
  // (non-platform-admin) caller's authClient, so this read must go through
  // portalAdmin — an authClient read here silently returns no row for an
  // ordinary org owner/admin even when the event genuinely is linked,
  // wrongly skipping their sync as "not linked" (review finding, 2026-09-16,
  // same root cause as the two fixes alongside this one). A genuine query
  // failure is likewise not the same condition as "not linked" — see the
  // identical distinction already made below for the profile lookup.
  const { data: link, error: linkError } = await portalAdmin
    .from('event_planner_links')
    .select('planner_event_id,is_active')
    .eq('event_id', eventId)
    .maybeSingle();

  if (linkError) {
    console.error('syncStaffMemberToPlanner: event_planner_links lookup failed', linkError);
    return { ok: true, status: 'failed', reason: 'Could not verify this event’s Bendie Planner link — try again' };
  }

  if (!link || !link.is_active) {
    return { ok: true, status: 'skipped', reason: 'Event is not linked to Bendie Planner' };
  }

  // Corrective fix (2026-09-21, /review finding, BLOCKING): planner_permissions_configured_at
  // deliberately has zero grant to the `authenticated` role (research.md R1) — reading it via
  // the caller's own authClient fails the ENTIRE select with "permission denied for table
  // event_members" (Postgres denies a query outright if it references any column the role
  // lacks privilege on; live-verified via `SET LOCAL ROLE authenticated`), not a partial/null
  // result. Discarding that error and branching only on `!member` silently treated every real
  // call as "not a member," breaking automatic sync entirely for every caller. Fixed by reading
  // through portalAdmin instead — the exact same class of fix, and the exact same reasoning,
  // already applied to the event_planner_links read immediately above. A genuine query failure
  // is likewise not the same condition as "not a member" (mirroring the identical distinction
  // already made for the link lookup above and the profile lookup below) — it is now reported
  // as a failure, not silently masqueraded as a legitimate skip.
  const { data: member, error: memberError } = await portalAdmin
    .from('event_members')
    .select('role,planner_permissions_configured_at')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberError) {
    console.error('syncStaffMemberToPlanner: event_members lookup failed', memberError);
    return { ok: true, status: 'failed', reason: 'Could not verify this event membership — try again' };
  }

  if (!member) {
    return { ok: true, status: 'skipped', reason: 'Not a member of this event' };
  }

  // Feature 008 (spec.md FR-042–FR-045, FR-036a): once an authorized manager
  // has explicitly Saved or Disabled this person's Planner permissions,
  // automatic role-derived sync must never again overwrite their
  // can_view_*/can_manage_*/access_role flags or silently reactivate
  // deliberately-disabled access. This one check is sufficient for every
  // current caller of this function (member add, CSV import, add-all-org-
  // members, assign-team, the Feature 004 event-creator auto-provision, and
  // the manual admin re-sync route) since they all funnel through here.
  if (member.planner_permissions_configured_at) {
    return { ok: true, status: 'skipped', reason: 'Planner permissions are manager-configured; automatic sync does not apply' };
  }

  if (!STAFF_ROLES.includes(member.role)) {
    return { ok: true, status: 'skipped', reason: 'Ordinary attendees do not sync to Bendie Planner' };
  }

  const { data: profile, error: profileError } = await authClient
    .from('profiles')
    .select('id,full_name,email,planner_profile_id')
    .eq('id', userId)
    .single();

  const markResult = async (status: 'succeeded' | 'failed', error?: string) => {
    await portalAdmin
      .from('event_members')
      .update({
        planner_synced_at: new Date().toISOString(),
        planner_sync_status: status,
        planner_sync_error: error ?? null,
      })
      .eq('event_id', eventId)
      .eq('user_id', userId);
  };

  // A failed lookup is not the same condition as "this member genuinely has
  // no email" — conflating the two misleads an admin troubleshooting a real
  // query failure. The raw DB error is logged server-side only; the
  // member-facing reason stays generic.
  if (profileError) {
    console.error('syncStaffMemberToPlanner: profile lookup failed', profileError);
    await markResult('failed', 'Could not read this member’s profile — try again');
    return { ok: true, status: 'failed', reason: 'Profile lookup failed' };
  }

  if (!profile?.email) {
    await markResult('failed', 'This member has no email on file');
    return { ok: true, status: 'failed', reason: 'No email on file' };
  }

  let planner;
  try {
    planner = getPlannerAdminClient();
  } catch (err) {
    await markResult('failed', (err as Error).message);
    return { ok: true, status: 'failed', reason: (err as Error).message };
  }

  let plannerProfileId = profile.planner_profile_id;

  if (!plannerProfileId) {
    const resolved = await findOrCreatePlannerProfile(planner, profile.email, profile.full_name);

    if ('error' in resolved) {
      await markResult('failed', resolved.error);
      return { ok: true, status: 'failed', reason: resolved.error };
    }

    plannerProfileId = resolved.id;
    await authClient.from('profiles').update({ planner_profile_id: plannerProfileId }).eq('id', userId);
  }

  const flags = roleToPlannerFlags(member.role);

  // event_user_assignments has a live UNIQUE (event_id, profile_id) constraint
  // (event_user_assignments_event_profile_unique) on Planner's side. A single
  // database-backed upsert against that constraint is atomic, so two
  // concurrent sync requests for the same event/profile can no longer both
  // pass a check and both insert — the second one resolves via the same
  // ON CONFLICT DO UPDATE as an ordinary re-sync, never a duplicate row.
  const { data: assignment, error: assignmentError } = await planner
    .from('event_user_assignments')
    .upsert(
      { event_id: link.planner_event_id, profile_id: plannerProfileId, ...flags, is_active: true, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,profile_id' }
    )
    .select('assignment_id')
    .single();

  if (assignmentError || !assignment) {
    const message = assignmentError?.message ?? 'Failed to create the Bendie Planner assignment';
    await markResult('failed', message);
    return { ok: true, status: 'failed', reason: message };
  }

  const assignmentId = assignment.assignment_id;

  await portalAdmin
    .from('event_members')
    .update({
      planner_assignment_id: assignmentId,
      planner_synced_at: new Date().toISOString(),
      planner_sync_status: 'succeeded',
      planner_sync_error: null,
    })
    .eq('event_id', eventId)
    .eq('user_id', userId);

  return { ok: true, status: 'succeeded' };
}
