import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/orgProductsAdminServer';
import { listReports } from '@/lib/moderation';

/** Feature 028 — the moderation queue. Stawi admins only; reads with the service role (spec FR-001, FR-002). */
export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const view = request.nextUrl.searchParams.get('status') === 'handled' ? 'handled' : 'pending';
  try {
    return NextResponse.json({ reports: await listReports(view) });
  } catch (err) {
    console.error('admin/moderation: list failed', err);
    return NextResponse.json({ error: 'backend_error', message: 'We couldn’t load the reports. Try again.' }, { status: 500 });
  }
}
