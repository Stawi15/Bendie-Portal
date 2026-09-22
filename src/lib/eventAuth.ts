import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export type ProductKey = 'bendie' | 'planner';

async function isPlatformAdmin(userId: string, client: SupabaseClient = supabase): Promise<boolean> {
  const { data } = await client.from('profiles').select('global_role').eq('id', userId).maybeSingle();
  return data?.global_role === 'admin';
}

/**
 * Event METADATA visibility only (listing/cards) — never workspace/content access.
 * True for: platform admin, org owner/admin of the event's own organization, or an
 * explicit event_members row. See requireEventWorkspaceAccess for the stricter check.
 */
export async function canViewEventMetadata(
  userId: string,
  event: { id: string; organization_id: string }
): Promise<boolean> {
  if (await isPlatformAdmin(userId)) return true;

  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) return true;

  const { data: eventMember } = await supabase
    .from('event_members')
    .select('user_id')
    .eq('event_id', event.id)
    .eq('user_id', userId)
    .maybeSingle();
  return !!eventMember;
}

/**
 * Event WORKSPACE/CONTENT access. Stricter than canViewEventMetadata: organization
 * owner/admin role is explicitly NOT sufficient on its own (F1 correction from
 * /speckit.analyze) — the caller must hold an explicit event_members row, AND the
 * event must belong to the caller's currently *selected* organization (a multi-org
 * user may legitimately hold event_members in more than one organization; the
 * selected organization must match, or access is denied even though the row exists).
 * Platform admins retain the existing cross-tenant bypass. All relationships are
 * resolved from the database — never from client-supplied organization/event claims.
 *
 * `client` (Feature 005) is an optional, defaulted Supabase client — every existing
 * call site (which passes no fourth argument) keeps using the shared browser
 * singleton unchanged. A server route can inject its own cookie-bound
 * `createServerClient` instance instead, so this exact authorization logic can be
 * reused server-side without a second, drift-prone reimplementation. Deliberately
 * typed as the plain `SupabaseClient` (no `<Database>` generic), matching this
 * codebase's existing untyped-client convention (`src/lib/supabaseClient.ts`,
 * `src/lib/plannerAdmin.ts`) rather than introducing a stricter one here.
 */
export async function requireEventWorkspaceAccess(
  eventId: string,
  userId: string,
  selectedOrganizationId: string | null,
  client: SupabaseClient = supabase
): Promise<boolean> {
  if (await isPlatformAdmin(userId, client)) return true;
  if (!selectedOrganizationId) return false;

  const { data: event, error: eventError } = await client.from('events').select('organization_id').eq('id', eventId).maybeSingle();
  if (eventError) console.error('requireEventWorkspaceAccess: events lookup failed', eventError);
  if (!event || event.organization_id !== selectedOrganizationId) return false;

  const { data: eventMember, error: memberError } = await client
    .from('event_members')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberError) console.error('requireEventWorkspaceAccess: event_members lookup failed', memberError);
  return !!eventMember;
}

/**
 * Active entitlement: organization_products.is_active = true. Row existence alone is
 * not sufficient. `client` — see requireEventWorkspaceAccess's doc comment (Feature 005).
 */
export async function isProductActiveForOrg(
  organizationId: string,
  productKey: ProductKey,
  client: SupabaseClient = supabase
): Promise<boolean> {
  const { data, error } = await client
    .from('organization_products')
    .select('is_active')
    .eq('organization_id', organizationId)
    .eq('product_key', productKey)
    .maybeSingle();
  if (error) console.error('isProductActiveForOrg: organization_products lookup failed', error);
  return data?.is_active === true;
}

/**
 * Every actively-owned product for an organization in one query (Feature 006).
 * `organization_products` alone is authoritative here — never `event_planner_links`
 * (that table is Planner counterpart infrastructure, not product entitlement) and
 * never event existence or platform-admin status. `client` — see
 * requireEventWorkspaceAccess's doc comment (Feature 005).
 *
 * Corrective fix (2026-09-17, /code-review finding F1): a Supabase read error
 * MUST NOT be reported as "zero active products" — those are genuinely
 * different conditions (FR-050), and collapsing them let a transient
 * network/RLS error masquerade as a real zero-entitlement organization and
 * silently misroute an actually-entitled user. Throws instead; every caller
 * (`useAvailableProducts`) is responsible for catching this and failing
 * closed to a neutral, non-redirecting state rather than treating it as an
 * entitlement answer.
 */
export async function getAvailableProducts(
  organizationId: string,
  client: SupabaseClient = supabase
): Promise<{ bendie: boolean; planner: boolean }> {
  const { data, error } = await client
    .from('organization_products')
    .select('product_key, is_active')
    .eq('organization_id', organizationId)
    .eq('is_active', true);
  if (error) {
    console.error('getAvailableProducts: organization_products lookup failed', error);
    throw error;
  }

  const rows = data ?? [];
  return {
    bendie: rows.some((r) => r.product_key === 'bendie'),
    planner: rows.some((r) => r.product_key === 'planner'),
  };
}

/**
 * Feature 008 — the permission-administration authority boundary, deliberately
 * narrower than (and independent of) `requireEventWorkspaceAccess`: platform
 * admin, or an organization owner/admin of the event's OWN organization
 * (resolved server-side from `events.organization_id`, never a passed-in or
 * "currently selected" organization id — same principle as
 * `requireEventWorkspaceAccess`'s own resolution). Deliberately never consults
 * `event_members.role` (host/organizer/admin/facilitator/staff/speaker/
 * attendee are all insufficient on their own, spec.md FR-006) and never any
 * Planner-side value (`can_manage_*` flags or `access_role` — FR-007/FR-028) —
 * conflating either into this check would let a Planner module manager or an
 * event-role holder grant themselves broader access merely by virtue of
 * managing that module, exactly the escalation spec.md's Locked Decision 2
 * exists to prevent. `client` — see requireEventWorkspaceAccess's doc comment
 * (Feature 005); reused identically for client-side UI gating (non-
 * authoritative) and server-side route enforcement (authoritative, re-checked
 * on every request).
 */
export async function canAdministerPlannerPermissions(
  eventId: string,
  userId: string,
  client: SupabaseClient = supabase
): Promise<boolean> {
  if (await isPlatformAdmin(userId, client)) return true;

  const { data: event, error: eventError } = await client.from('events').select('organization_id').eq('id', eventId).maybeSingle();
  if (eventError) console.error('canAdministerPlannerPermissions: events lookup failed', eventError);
  if (!event) return false;

  const { data: orgMember, error: orgMemberError } = await client
    .from('organization_members')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (orgMemberError) console.error('canAdministerPlannerPermissions: organization_members lookup failed', orgMemberError);

  return !!orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin');
}

/**
 * Product availability for an event: active organization entitlement AND a matching
 * event_products row. An inactive entitlement makes the product unavailable even if
 * a historical event_products row still exists — that row is never deleted here.
 * `client` — see requireEventWorkspaceAccess's doc comment (Feature 005).
 */
export async function isProductAvailableForEvent(
  eventId: string,
  organizationId: string,
  productKey: ProductKey,
  client: SupabaseClient = supabase
): Promise<boolean> {
  const active = await isProductActiveForOrg(organizationId, productKey, client);
  if (!active) return false;

  const { data, error } = await client
    .from('event_products')
    .select('product_key')
    .eq('event_id', eventId)
    .eq('product_key', productKey)
    .maybeSingle();
  if (error) console.error('isProductAvailableForEvent: event_products lookup failed', error);
  return !!data;
}
