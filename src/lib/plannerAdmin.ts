import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client for Bendie Planner's separate Supabase project.
 * Server-only — the `server-only` import above makes any accidental
 * client-component import fail the build, since a shared src/lib/ helper
 * (unlike the portal's own inline-per-route service-role clients) has no
 * structural guarantee otherwise. Callers remain responsible for verifying
 * the caller is a Portal global admin BEFORE calling this — it does no
 * auth of its own, matching how the portal's own service-role client is
 * only ever built after that check in create-user/bulk-create-users.
 *
 * Deliberately untyped (no <Database> generic), matching this codebase's
 * existing convention — src/lib/supabaseClient.ts and every service-role
 * client in src/app/api/admin/* are untyped too; see
 * src/types/plannerDatabase.ts for the hand-maintained column reference
 * instead of relying on generic-driven inference.
 */
export function getPlannerAdminClient() {
  const url = process.env.PLANNER_SUPABASE_URL;
  const key = process.env.PLANNER_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Server is missing PLANNER_SUPABASE_URL / PLANNER_SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
