import 'server-only';
import { escapeLikePattern } from '@/lib/plannerStaffSync';

/**
 * Feature 017 — shared account resolution for the organization-scoped
 * people routes (/api/organizations/[organizationId]/people and
 * /api/events/[eventId]/members). Server-only: every function here takes the
 * Portal service-role client, so callers MUST have authorized the request
 * first (constitution v1.1.0, Principle II). Results carry ids and flags only
 * — never another organization's memberships or roles (spec FR-008).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_FULL_NAME_LENGTH = 200;

/** Trimmed, lower-cased email, or null when it is not a plausible address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

/** Trimmed full name, '' when absent, or null when longer than allowed. */
export function normalizeFullName(raw: unknown): string | null {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name.length > MAX_FULL_NAME_LENGTH ? null : name;
}

async function findProfileIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('id').ilike('email', escapeLikePattern(email)).maybeSingle();
  return data?.id ?? null;
}

/**
 * Reuses the account for this email, or creates one silently — no password
 * and no email sent, exactly like /api/admin/create-user (spec FR-006); the
 * person signs in for the first time via "Forgot password".
 *
 * Concurrent requests for the same new email: one createUser wins and the
 * other fails (email_exists, or a noisier transient error). The loser
 * recovers by re-looking-up with a short bounded backoff — the same approach
 * as findOrCreatePlannerProfile in plannerStaffSync.ts — so exactly one
 * account results (SC-004).
 */
export async function ensureAccountByEmail(
  admin: AdminClient,
  email: string,
  fullName: string
): Promise<{ userId: string; account: 'created' | 'existing' } | { error: string }> {
  const existingId = await findProfileIdByEmail(admin, email);
  if (existingId) return { userId: existingId, account: 'existing' };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createError || !created?.user) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      const winnerId = await findProfileIdByEmail(admin, email);
      if (winnerId) return { userId: winnerId, account: 'existing' };
    }
    console.error('ensureAccountByEmail: createUser failed', createError);
    return { error: 'Could not create the account — try again' };
  }

  // The on-signup trigger creates the profiles row; make sure it carries the
  // name we were given regardless of whether the trigger read the metadata.
  if (fullName) {
    await admin.from('profiles').update({ full_name: fullName }).eq('id', created.user.id);
  }

  return { userId: created.user.id, account: 'created' };
}

/**
 * Ensures an organization membership exists. Always role 'member' (spec
 * FR-004); an existing membership — whatever its role — is left untouched.
 */
export async function ensureOrgMember(
  admin: AdminClient,
  organizationId: string,
  userId: string
): Promise<'added' | 'already_member' | { error: string }> {
  const { error } = await admin
    .from('organization_members')
    .insert({ organization_id: organizationId, user_id: userId, role: 'member' });

  if (!error) return 'added';
  if (error.code === '23505') return 'already_member';
  console.error('ensureOrgMember: insert failed', error);
  return { error: 'Could not add them to the organisation — try again' };
}
