import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import { STAWI_PLANNER_ORG_ID, plannerSlugFrom, type ProductKey } from '@/lib/orgProductsAdmin';

/**
 * Feature 022 — shared server logic for the platform-admin /api/admin/organizations routes.
 * Portal writes use the caller's own session (`authClient`) so audit triggers record who acted;
 * the Planner project is reached only through its service-role client, after the platform-admin
 * check (Constitution II/IV).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuthClient = any;

/** Cookie-session client + platform-admin check. Returns the client and user, or a 401/403 response. */
export async function requirePlatformAdmin(): Promise<{ authClient: AuthClient; userId: string } | NextResponse> {
  const cookieStore = await cookies();
  const authClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // Read-only auth check — no session refresh needed here.
      },
    },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profile } = await authClient.from('profiles').select('global_role').eq('id', user.id).maybeSingle();
  if (!profile || profile.global_role !== 'admin') return NextResponse.json({ error: 'Only platform admins can do this.' }, { status: 403 });
  return { authClient, userId: user.id };
}

/** Portal service-role client — only for privilege-restricted columns (Planner provisioning status). */
export function getPortalAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Server is missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export class PlannerUnavailableError extends Error {}

/** Planner organisations that are not connected to any Portal organisation (and not Stawi's own). */
export async function listUnconnectedPlannerOrgs(authClient: AuthClient): Promise<{ id: number; name: string; slug: string | null }[]> {
  const { data: links, error: linksError } = await authClient.from('organization_planner_links').select('planner_organization_id');
  if (linksError) throw linksError;
  const used = new Set<number>((links ?? []).map((l: { planner_organization_id: number }) => Number(l.planner_organization_id)));
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('organizations').select('organization_id,name,slug').order('name');
  if (error) throw new PlannerUnavailableError(error.message);
  return (data ?? [])
    .filter((o: { organization_id: number }) => o.organization_id !== STAWI_PLANNER_ORG_ID && !used.has(Number(o.organization_id)))
    .map((o: { organization_id: number; name: string; slug: string | null }) => ({ id: Number(o.organization_id), name: o.name, slug: o.slug }));
}

/** Creates an active Planner organisation; adds -2, -3… to the slug on collision (max 10 tries). */
export async function createPlannerOrg(name: string, slug: string | null): Promise<{ id: number; name: string }> {
  const planner = getPlannerAdminClient();
  const base = plannerSlugFrom(name, slug);
  for (let attempt = 1; attempt <= 10; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const { data, error } = await planner
      .from('organizations')
      .insert({ name, slug: candidate, is_active: true })
      .select('organization_id,name')
      .single();
    if (!error) return { id: Number(data.organization_id), name: data.name };
    if (error.code !== '23505') throw new PlannerUnavailableError(error.message);
  }
  throw new PlannerUnavailableError('Could not find a free Planner organisation slug.');
}

/** Compensation only: removes a Planner organisation this same request just created. */
export async function deletePlannerOrg(id: number): Promise<void> {
  const planner = getPlannerAdminClient();
  await planner.from('organizations').delete().eq('organization_id', id);
}

/** Switches the Planner organisation on/off (the enforced "Planner app access" switch). */
export async function setPlannerOrgActive(id: number, active: boolean): Promise<void> {
  const planner = getPlannerAdminClient();
  const { error } = await planner.from('organizations').update({ is_active: active, updated_at: new Date().toISOString() }).eq('organization_id', id);
  if (error) throw new PlannerUnavailableError(error.message);
}

/** True when the Planner enforcement SQL (is_org_active) is installed — see research R2 / I1. */
export async function isPlannerEnforcementLive(): Promise<boolean> {
  try {
    const planner = getPlannerAdminClient();
    const { error } = await planner.rpc('is_org_active', { p_org_id: STAWI_PLANNER_ORG_ID });
    return !error;
  } catch {
    return false;
  }
}

export type Impact = { events: number; plannerPeople: number | null; plannerAppPaused: boolean; plannerEnforcementLive: boolean };

/** What pausing a product affects (research R9). */
export async function computeImpact(authClient: AuthClient, organizationId: string, product: ProductKey): Promise<Impact> {
  const { count, error } = await authClient
    .from('event_products')
    .select('event_id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('product_key', product);
  if (error) throw error;

  const { data: link } = await authClient
    .from('organization_planner_links')
    .select('planner_organization_id,planner_app_paused_at')
    .eq('organization_id', organizationId)
    .maybeSingle();

  let plannerPeople: number | null = null;
  if (product === 'planner') {
    plannerPeople = 0;
    const { data: events } = await authClient.from('events').select('id').eq('organization_id', organizationId);
    const eventIds = (events ?? []).map((e: { id: string }) => e.id);
    const { data: links } = eventIds.length
      ? await authClient.from('event_planner_links').select('planner_event_id').in('event_id', eventIds).eq('is_active', true)
      : { data: [] };
    const plannerEventIds = (links ?? []).map((l: { planner_event_id: number }) => l.planner_event_id);
    const planner = getPlannerAdminClient();
    const people = new Set<string>();
    if (plannerEventIds.length > 0) {
      const { data: assignments, error: aError } = await planner
        .from('event_user_assignments')
        .select('profile_id')
        .in('event_id', plannerEventIds)
        .eq('is_active', true);
      if (aError) throw new PlannerUnavailableError(aError.message);
      for (const a of assignments ?? []) people.add(a.profile_id);
    }
    if (link?.planner_organization_id) {
      const { data: admins, error: adError } = await planner
        .from('profiles')
        .select('id')
        .eq('organization_id', link.planner_organization_id)
        .eq('is_org_admin', true);
      if (adError) throw new PlannerUnavailableError(adError.message);
      for (const a of admins ?? []) people.add(a.id);
    }
    plannerPeople = people.size;
  }

  return {
    events: count ?? 0,
    plannerPeople,
    plannerAppPaused: !!link?.planner_app_paused_at,
    plannerEnforcementLive: product === 'planner' ? await isPlannerEnforcementLive() : false,
  };
}

/** Explicit product-history entry for actions with no Portal row of their own (research R4). */
export async function logProductHistory(
  authClient: AuthClient,
  entry: { organizationId: string; eventId: string; diff: Record<string, unknown>; actorUserId: string }
): Promise<void> {
  // organization_audit_log.action only accepts INSERT/UPDATE/DELETE. Product switches and Planner
  // app pauses are logged by the table triggers; only "product added to an event" is written here.
  const { error } = await authClient.from('organization_audit_log').insert({
    organization_id: entry.organizationId,
    table_name: 'event_products',
    action: 'INSERT',
    row_id: entry.eventId,
    diff: entry.diff,
    actor_user_id: entry.actorUserId,
  });
  if (error) console.error('[admin/organizations] history entry not written', error.message);
}

/** Maps a Supabase error to a plain-language response for the admin routes. */
export function errorResponse(error: { code?: string; message?: string } | Error, fallback: string): NextResponse {
  if (error instanceof PlannerUnavailableError) {
    return NextResponse.json({ error: `Bendie Planner couldn’t be reached: ${error.message}` }, { status: 502 });
  }
  const e = error as { code?: string; message?: string };
  if (e.code === '42501') return NextResponse.json({ error: 'Only platform admins can do this.' }, { status: 403 });
  if (e.code === '22023') return NextResponse.json({ error: e.message ?? fallback }, { status: 400 });
  return NextResponse.json({ error: fallback }, { status: 500 });
}
