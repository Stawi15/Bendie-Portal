import { NextResponse } from 'next/server';
import { errorResponse, listUnconnectedPlannerOrgs, requirePlatformAdmin } from '@/lib/orgProductsAdminServer';

/**
 * Feature 022 — Planner organisations a platform admin can connect: not linked to any Portal
 * organisation and not Stawi's own (contracts/admin-organizations-api.md).
 */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const plannerOrganizations = await listUnconnectedPlannerOrgs(auth.authClient);
    return NextResponse.json({ plannerOrganizations });
  } catch (error) {
    return errorResponse(error as Error, 'Couldn’t load Planner organisations.');
  }
}
