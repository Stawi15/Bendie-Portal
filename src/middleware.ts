import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirects must carry forward any refreshed session cookies written onto
  // `response` above — otherwise a token refresh that coincides with a
  // redirect silently drops the new session, bouncing a logged-in admin
  // through /auth/login and back to /portal on the next request.
  const redirectTo = (pathname: string) => {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = pathname;
    const redirectResponse = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  };

  // Redirect unauthenticated users away from protected routes
  if (!user && request.nextUrl.pathname.startsWith('/portal')) {
    return redirectTo('/auth/login');
  }

  // Checking profiles.global_role / organization_members on every single
  // navigation adds a network round-trip on top of getUser() above, on every
  // click, across the whole app. This is purely a UX-gate cache: real data
  // access is still fully governed by RLS (portal_is_global_admin(),
  // is_organization_member(), event_members, etc. all read the live DB value
  // directly), so a stale cache here can never grant actual data access to
  // any resource — worst case it just delays a demotion/membership-removal
  // from taking effect in the *Portal shell admission* UI by up to
  // CACHE_TTL_MS. It must never be treated as authorization evidence for any
  // specific organization, event, or product — every resource-level check
  // (getAccessibleOrganizations, getAccessibleEvents, requireEventWorkspaceAccess,
  // RLS) re-derives its answer live, independent of this cache.
  const ROLE_CACHE_COOKIE = 'portal_role_cache';
  const ORG_MEMBERSHIP_CACHE_COOKIE = 'portal_org_membership_cache';
  const CACHE_TTL_MS = 60_000;

  const getCachedRole = (userId: string): string | null => {
    const raw = cookieStore.get(ROLE_CACHE_COOKIE)?.value;
    if (!raw) return null;
    const [cachedUserId, cachedRole, expiresAtStr] = raw.split(':');
    if (cachedUserId !== userId || Date.now() >= Number(expiresAtStr)) return null;
    return cachedRole;
  };

  const cacheRole = (userId: string, role: string) => {
    response.cookies.set(ROLE_CACHE_COOKIE, `${userId}:${role}:${Date.now() + CACHE_TTL_MS}`, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: CACHE_TTL_MS / 1000,
    });
  };

  const getRole = async (userId: string): Promise<string | null> => {
    const cached = getCachedRole(userId);
    if (cached) return cached;
    const { data: profile } = await supabase.from('profiles').select('global_role').eq('id', userId).single();
    const role = profile?.global_role ?? null;
    if (role) cacheRole(userId, role);
    return role;
  };

  const getCachedHasOrgMembership = (userId: string): boolean | null => {
    const raw = cookieStore.get(ORG_MEMBERSHIP_CACHE_COOKIE)?.value;
    if (!raw) return null;
    const [cachedUserId, cachedHas, expiresAtStr] = raw.split(':');
    if (cachedUserId !== userId || Date.now() >= Number(expiresAtStr)) return null;
    return cachedHas === '1';
  };

  const cacheHasOrgMembership = (userId: string, has: boolean) => {
    response.cookies.set(ORG_MEMBERSHIP_CACHE_COOKIE, `${userId}:${has ? '1' : '0'}:${Date.now() + CACHE_TTL_MS}`, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: CACHE_TTL_MS / 1000,
    });
  };

  const getHasOrgMembership = async (userId: string): Promise<boolean> => {
    const cached = getCachedHasOrgMembership(userId);
    if (cached !== null) return cached;
    const { data } = await supabase.from('organization_members').select('organization_id').eq('user_id', userId).limit(1);
    const has = !!data && data.length > 0;
    cacheHasOrgMembership(userId, has);
    return has;
  };

  // Portal admission (Feature 003): platform admins are admitted as before;
  // authenticated customers are admitted only if they hold at least one live
  // organization_members row, otherwise they land on a safe no-organization/
  // no-access page rather than /unauthorized (they are not doing anything
  // wrong -- they simply have no organization yet). /portal/no-access itself
  // must stay reachable regardless of membership, or a zero-membership user
  // could never reach the page explaining why.
  if (user && request.nextUrl.pathname.startsWith('/portal') && request.nextUrl.pathname !== '/portal/no-access') {
    const role = await getRole(user.id);
    if (role !== 'admin') {
      const hasMembership = await getHasOrgMembership(user.id);
      if (!hasMembership) {
        return redirectTo('/portal/no-access');
      }
    }
  }

  // Redirect authenticated admins away from auth pages
  if (user && request.nextUrl.pathname.startsWith('/auth')) {
    const role = await getRole(user.id);
    if (role === 'admin') {
      return redirectTo('/portal');
    }
  }

  return response;
}

export const config = {
  matcher: ['/portal/:path*', '/auth/:path*'],
};
