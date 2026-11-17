import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 027 (C1 readiness): Bendie is revoking `SELECT` on `profiles.global_role`
 * and `planner_profile_id` (among others) from signed-in users. Server routes read
 * the VERIFIED caller's own row here with the service role instead.
 *
 * `userId` MUST come from `auth.getUser()` on the request's own session — never
 * from the request body or URL. Returns the same `{ data }` shape the routes'
 * previous `authClient.from('profiles')...maybeSingle()` calls had, with `data`
 * null when the row is missing, the key isn't configured, or the read fails
 * (logged), exactly as a failed user-key read behaved before.
 */
export type CallerProfile = {
  global_role: string | null;
  current_organization_id: string | null;
  planner_profile_id: string | null;
};

let cachedAdmin: SupabaseClient | null = null;

function portalServiceClient(): SupabaseClient | null {
  if (cachedAdmin) return cachedAdmin;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  cachedAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

export async function readCallerProfile(userId: string): Promise<{ data: CallerProfile | null }> {
  const admin = portalServiceClient();
  if (!admin) {
    console.error('readCallerProfile: missing SUPABASE_SERVICE_ROLE_KEY');
    return { data: null };
  }
  const { data, error } = await admin
    .from('profiles')
    .select('global_role, current_organization_id, planner_profile_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('readCallerProfile: profiles lookup failed', error);
    return { data: null };
  }
  return { data: (data as CallerProfile | null) ?? null };
}

/** Convenience for routes that only need the Stawi-admin check. */
export async function isCallerGlobalAdmin(userId: string): Promise<boolean> {
  const { data } = await readCallerProfile(userId);
  return data?.global_role === 'admin';
}
