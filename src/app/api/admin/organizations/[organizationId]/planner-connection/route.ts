import { NextRequest, NextResponse } from 'next/server';
import { parsePlannerConnectionBody } from '@/lib/orgProductsAdmin';
import { createPlannerOrg, deletePlannerOrg, errorResponse, listUnconnectedPlannerOrgs, requirePlatformAdmin } from '@/lib/orgProductsAdminServer';

/**
 * Feature 022 — connect an organisation that has no Planner connection yet to an existing Planner
 * organisation, or to a new one created with its name. Read-only once set (FR-007).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const { authClient, userId } = auth;
  const { organizationId } = await params;

  const parsed = parsePlannerConnectionBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: org } = await authClient.from('organizations').select('id,name,slug').eq('id', organizationId).maybeSingle();
  if (!org) return NextResponse.json({ error: 'Organisation not found.' }, { status: 404 });

  const { data: existing } = await authClient.from('organization_planner_links').select('planner_organization_id').eq('organization_id', organizationId).maybeSingle();
  if (existing) return NextResponse.json({ error: 'This organisation is already connected to Bendie Planner.' }, { status: 409 });

  let plannerOrg: { id: number; name: string };
  let created = false;
  try {
    if (parsed.value.mode === 'new') {
      plannerOrg = await createPlannerOrg(org.name, org.slug);
      created = true;
    } else {
      const wanted = parsed.value.plannerOrganizationId;
      const match = (await listUnconnectedPlannerOrgs(authClient)).find((o) => o.id === wanted);
      if (!match) return NextResponse.json({ error: 'That Planner organisation is already connected or doesn’t exist.' }, { status: 409 });
      plannerOrg = { id: match.id, name: match.name };
    }
  } catch (error) {
    return errorResponse(error as Error, 'Couldn’t prepare the Planner organisation.');
  }

  const { error } = await authClient.from('organization_planner_links').insert({
    organization_id: organizationId,
    planner_organization_id: plannerOrg.id,
    planner_organization_name: plannerOrg.name,
    linked_by: userId,
  });
  if (error) {
    if (created) await deletePlannerOrg(plannerOrg.id).catch(() => undefined);
    if (error.code === '23505') return NextResponse.json({ error: 'That Planner organisation or this organisation is already connected.' }, { status: 409 });
    return errorResponse(error, 'The Planner connection couldn’t be saved.');
  }
  return NextResponse.json({ plannerOrganization: plannerOrg });
}
