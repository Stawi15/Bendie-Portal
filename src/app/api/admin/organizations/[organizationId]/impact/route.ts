import { NextRequest, NextResponse } from 'next/server';
import { isProductKey } from '@/lib/orgProductsAdmin';
import { computeImpact, errorResponse, requirePlatformAdmin } from '@/lib/orgProductsAdminServer';

/**
 * Feature 022 — what pausing a product affects (research R9), plus whether Planner enforces its
 * organisation switch yet (plannerEnforcementLive, analysis I1).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const { organizationId } = await params;
  const product = request.nextUrl.searchParams.get('product');
  if (!isProductKey(product)) return NextResponse.json({ error: 'Unknown product.' }, { status: 400 });
  try {
    return NextResponse.json(await computeImpact(auth.authClient, organizationId, product));
  } catch (error) {
    return errorResponse(error as Error, 'Couldn’t work out what this affects.');
  }
}
