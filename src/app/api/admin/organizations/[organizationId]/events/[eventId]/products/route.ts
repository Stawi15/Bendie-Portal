import { NextRequest, NextResponse } from 'next/server';
import { isProductKey } from '@/lib/orgProductsAdmin';
import { errorResponse, getPortalAdminClient, logProductHistory, requirePlatformAdmin } from '@/lib/orgProductsAdminServer';
import { provisionPlannerEvent } from '@/lib/plannerEventProvisioning';

/**
 * Feature 022 — add a product the organisation has switched on to one of its existing events.
 * Bendie: the event_products row. Planner: the row, then the same Planner set-up that creating a
 * Planner event runs (provisionPlannerEvent), retryable through the existing retry route.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ organizationId: string; eventId: string }> }) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const { authClient, userId } = auth;
  const { organizationId, eventId } = await params;

  const body = await request.json().catch(() => null);
  const product = body?.product;
  if (!isProductKey(product)) return NextResponse.json({ error: 'Choose Bendie or Bendie Planner.' }, { status: 400 });

  const { data: event } = await authClient
    .from('events')
    .select('id,name,organization_id,planner_provisioning_status')
    .eq('id', eventId)
    .maybeSingle();
  if (!event || event.organization_id !== organizationId) return NextResponse.json({ error: 'Event not found in this organisation.' }, { status: 404 });

  const { data: entitlement } = await authClient
    .from('organization_products')
    .select('is_active')
    .eq('organization_id', organizationId)
    .eq('product_key', product)
    .maybeSingle();
  if (!entitlement?.is_active) return NextResponse.json({ error: 'Switch this product on for the organisation first.' }, { status: 400 });

  const { error: insertError } = await authClient.from('event_products').insert({ event_id: eventId, product_key: product, organization_id: organizationId, enabled_by: userId });
  if (insertError) {
    if (insertError.code === '23505') return NextResponse.json({ error: 'This event already uses that product.' }, { status: 409 });
    return errorResponse(insertError, 'The product couldn’t be added to the event.');
  }

  await logProductHistory(authClient, {
    organizationId,
    eventId,
    diff: { event_id: eventId, event_name: event.name, product_key: product },
    actorUserId: userId,
  });

  if (product === 'bendie') return NextResponse.json({ product });

  // Planner: queue and run the event's Planner set-up (privilege-restricted status column → service role).
  const portalAdmin = getPortalAdminClient();
  if (event.planner_provisioning_status !== 'succeeded') {
    await portalAdmin.from('events').update({ planner_provisioning_status: 'pending', planner_provisioning_error: null }).eq('id', eventId);
  }
  const outcome = await provisionPlannerEvent({ authClient, portalAdmin, eventId, organizationId });
  return NextResponse.json({
    product,
    plannerProvisioning: outcome.status,
    ...(outcome.status === 'failed' ? { reason: outcome.reason } : {}),
  });
}
