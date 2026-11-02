import { NextRequest, NextResponse } from 'next/server';
import { isProductKey, parseProductSwitchBody } from '@/lib/orgProductsAdmin';
import {
  errorResponse,
  isPlannerEnforcementLive,
  requirePlatformAdmin,
  setPlannerOrgActive,
} from '@/lib/orgProductsAdminServer';

/**
 * Feature 022 — switch a product on (upgrade / resume) or off (pause) for an organisation, with
 * the optional Planner app-access pause. Stale requests are refused (research R8); pausing app
 * access is refused until the Planner enforcement SQL is installed (analysis I1). History rows come
 * from the organization_products / organization_planner_links audit triggers.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ organizationId: string; product: string }> }) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const { authClient, userId } = auth;
  const { organizationId, product } = await params;
  if (!isProductKey(product)) return NextResponse.json({ error: 'Unknown product.' }, { status: 400 });

  const parsed = parseProductSwitchBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { active, expectedActive, pausePlannerAppAccess } = parsed.value;

  const { data: org } = await authClient.from('organizations').select('id').eq('id', organizationId).maybeSingle();
  if (!org) return NextResponse.json({ error: 'Organisation not found.' }, { status: 404 });

  const { data: link } = await authClient
    .from('organization_planner_links')
    .select('planner_organization_id,planner_app_paused_at')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (product === 'planner' && active && !link) {
    return NextResponse.json({ error: 'Connect a Planner organisation first.' }, { status: 400 });
  }
  if (!active && pausePlannerAppAccess && product === 'planner' && !(await isPlannerEnforcementLive())) {
    return NextResponse.json({ error: 'Planner app access can’t be paused yet — the Planner update hasn’t been installed.' }, { status: 409 });
  }

  const stale = () => NextResponse.json({ error: 'This product was changed by someone else — reload and try again.' }, { status: 409 });

  // Switch the product row (insert when it was never included; otherwise compare-and-set).
  if (expectedActive === null) {
    if (!active) return stale();
    const { error } = await authClient
      .from('organization_products')
      .insert({ organization_id: organizationId, product_key: product, is_active: true, enabled_by: userId });
    if (error) return error.code === '23505' ? stale() : errorResponse(error, 'The product couldn’t be switched on.');
  } else {
    const { data, error } = await authClient
      .from('organization_products')
      .update({ is_active: active })
      .eq('organization_id', organizationId)
      .eq('product_key', product)
      .eq('is_active', expectedActive)
      .select('product_key');
    if (error) return errorResponse(error, 'The product couldn’t be changed.');
    if (!data || data.length === 0) return stale();
  }

  let plannerAppPaused = !!link?.planner_app_paused_at;
  if (product === 'planner' && link) {
    try {
      if (active && link.planner_app_paused_at) {
        // Resuming Planner always resumes Planner app access (FR-011).
        await setPlannerOrgActive(link.planner_organization_id, true);
        await authClient.from('organization_planner_links').update({ planner_app_paused_at: null, planner_app_paused_by: null }).eq('organization_id', organizationId);
        plannerAppPaused = false;
      } else if (!active && pausePlannerAppAccess && !link.planner_app_paused_at) {
        await setPlannerOrgActive(link.planner_organization_id, false);
        await authClient
          .from('organization_planner_links')
          .update({ planner_app_paused_at: new Date().toISOString(), planner_app_paused_by: userId })
          .eq('organization_id', organizationId);
        plannerAppPaused = true;
      }
    } catch (error) {
      // Keep the Portal and Planner consistent: undo the product switch if the Planner step failed.
      await authClient.from('organization_products').update({ is_active: !active }).eq('organization_id', organizationId).eq('product_key', product);
      return errorResponse(error as Error, 'Bendie Planner couldn’t be updated, so nothing was changed.');
    }
  }

  return NextResponse.json({ product, state: active ? 'active' : 'paused', plannerAppPaused });
}
