/**
 * Feature 016 (reliability pass) — turn technical Supabase/Postgres/network
 * failures into messages a non-technical event manager can act on.
 *
 * Deliberately small: a handful of well-known failure classes, a safe generic
 * fallback, and the raw error always logged for developers. Never returns SQL,
 * table, constraint, RLS-policy or stack details to the UI.
 */

type ErrorLike = { message?: string | null; code?: string | null; details?: string | null; status?: number } | string | null | undefined;

// Neutral on purpose: this is shared by saves, deletes and loads.
const GENERIC = "That didn't go through. Try again — if it keeps happening, refresh the page.";

function describe(err: ErrorLike): { message: string; code: string } {
  if (!err) return { message: '', code: '' };
  if (typeof err === 'string') return { message: err, code: '' };
  return { message: err.message ?? '', code: err.code ?? '' };
}

/** Returns the friendly message for a known technical failure, or null when the error isn't recognised. */
export function knownErrorMessage(err: ErrorLike): string | null {
  const { message, code } = describe(err);
  const m = message.toLowerCase();

  if (code === '23505' || m.includes('duplicate key') || m.includes('already exists')) {
    return 'This has already been added — check the existing entries before adding it again.';
  }
  if (code === '42501' || m.includes('row-level security') || m.includes('permission denied') || m.includes('not authorized') || m.includes('forbidden')) {
    return "You don't have permission to make this change.";
  }
  if (code === '23502' || m.includes('null value in column')) {
    return 'A required field is missing. Fill in the required fields and try again.';
  }
  if (code === '23503' || m.includes('foreign key')) {
    return 'This refers to something that no longer exists. Refresh the page and try again.';
  }
  if (code === '23514' || m.includes('violates check constraint')) {
    return "One of the values isn't allowed here. Check the options you selected and try again.";
  }
  if (code === '22P02' || code === '22007' || code === '22008' || m.includes('invalid input syntax') || m.includes('invalid input value')) {
    return "One of the values isn't in the right format (for example a date, time or number). Check it and try again.";
  }
  if (code === '22001' || m.includes('value too long')) {
    return 'One of the values is too long. Shorten it and try again.';
  }
  if (m.includes('jwt expired') || m.includes('refresh token') || m.includes('not authenticated') || m.includes('auth session missing')) {
    return 'Your session has expired. Sign in again and retry.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed') || m.includes('load failed')) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }
  return null;
}

/**
 * Friendly message for any failure. Known classes get specific guidance;
 * anything else gets `fallback` (default: a neutral "That didn't go through…").
 * The raw error is logged so developers still see what happened.
 */
export function friendlyError(err: ErrorLike, fallback: string = GENERIC): string {
  const known = knownErrorMessage(err);
  if (err) console.error('[portal]', err);
  return known ?? fallback;
}
