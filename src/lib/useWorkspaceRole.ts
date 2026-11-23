'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserEventRole, getUserOrgRole } from '@/lib/portalAuth';
import { roleLabel } from '@/lib/workspaceContext';

/*
 * Feature 030 — the user's role label for the context strip (research R4).
 * Stawi admins need no read. Otherwise: the user's own organisation role (one
 * read per organisation, cached in memory for the session) and their event
 * role (one read per event, cached). The user id comes from `useAuth`, so no
 * extra Auth request is made. Display only: never used for access.
 */

const orgRoleCache = new Map<string, Promise<string | null>>();
const eventRoleCache = new Map<string, Promise<string | null>>();

function cached(
  cache: Map<string, Promise<string | null>>,
  key: string,
  load: () => Promise<string | null>
) {
  let p = cache.get(key);
  if (!p) {
    p = load();
    cache.set(key, p);
  }
  return p;
}

export function useWorkspaceRole(
  organizationId: string | null | undefined,
  eventId: string | null | undefined
) {
  const { isGlobalAdmin, user } = useAuth();
  const userId = user?.id ?? null;
  const [roles, setRoles] = useState<{
    key: string;
    orgRole: string | null;
    eventRole: string | null;
  } | null>(null);
  const key = `${userId}:${organizationId ?? ''}:${eventId ?? ''}`;

  useEffect(() => {
    if (isGlobalAdmin || !userId || !organizationId) return;
    let cancelled = false;
    Promise.all([
      cached(orgRoleCache, `${userId}:${organizationId}`, () =>
        getUserOrgRole(organizationId, userId)
      ),
      eventId
        ? cached(eventRoleCache, `${userId}:${eventId}`, () => getUserEventRole(eventId, userId))
        : Promise.resolve(null),
    ]).then(([orgRole, eventRole]) => {
      if (!cancelled) setRoles({ key, orgRole, eventRole });
    });
    return () => {
      cancelled = true;
    };
  }, [isGlobalAdmin, userId, organizationId, eventId, key]);

  if (isGlobalAdmin)
    return {
      label: roleLabel({ isGlobalAdmin: true, orgRole: null, eventRole: null }),
      loading: false,
    };
  if (!roles || roles.key !== key) return { label: null, loading: true };
  return {
    label: roleLabel({ isGlobalAdmin: false, orgRole: roles.orgRole, eventRole: roles.eventRole }),
    loading: false,
  };
}
