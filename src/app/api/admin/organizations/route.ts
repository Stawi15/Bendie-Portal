import { NextRequest, NextResponse } from 'next/server';
import { parseCreateOrganizationBody } from '@/lib/orgProductsAdmin';
import {
  createPlannerOrg,
  deletePlannerOrg,
  errorResponse,
  listUnconnectedPlannerOrgs,
  requirePlatformAdmin,
} from '@/lib/orgProductsAdminServer';

/**
 * Feature 022 — create an organisation with its products and (for Planner) its Planner connection.
 * The Portal part runs in admin_create_organization (one transaction, caller's session); a Planner
 * organisation created here is deleted again if that fails (contracts/admin-organizations-api.md).
 */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const { authClient } = auth;

  const parsed = parseCreateOrganizationBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { name, slug, products, planner } = parsed.value;

  let plannerOrg: { id: number; name: string } | null = null;
  let createdPlannerOrg = false;
  try {
    if (planner?.mode === 'new') {
      plannerOrg = await createPlannerOrg(name, slug);
      createdPlannerOrg = true;
    } else if (planner?.mode === 'existing') {
      const available = await listUnconnectedPlannerOrgs(authClient);
      const match = available.find((o) => o.id === planner.plannerOrganizationId);
      if (!match) return NextResponse.json({ error: 'That Planner organisation is already connected or doesn’t exist.' }, { status: 409 });
      plannerOrg = { id: match.id, name: match.name };
    }
  } catch (error) {
    return errorResponse(error as Error, 'Couldn’t prepare the Planner organisation.');
  }

  const { data: organizationId, error } = await authClient.rpc('admin_create_organization', {
    p_name: name,
    p_slug: slug,
    p_products: products,
    p_planner_organization_id: plannerOrg?.id ?? null,
    p_planner_organization_name: plannerOrg?.name ?? null,
  });

  if (error) {
    if (createdPlannerOrg && plannerOrg) await deletePlannerOrg(plannerOrg.id).catch(() => undefined);
    if (error.code === '23505') {
      const message = /planner_organization/.test(error.message ?? '')
        ? 'That Planner organisation is already connected to another organisation.'
        : 'That slug is already taken — try a different one.';
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return errorResponse(error, 'The organisation couldn’t be created.');
  }

  const { data: organization } = await authClient.from('organizations').select('id,name,slug,created_by,created_at,updated_at').eq('id', organizationId).maybeSingle();
  return NextResponse.json({ organization }, { status: 201 });
}

