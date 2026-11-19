/**
 * Feature 028 — the pure moderation rules (no I/O), shared by `moderation.ts` and its tests.
 */
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'actioned';
export type ContentType = 'post' | 'message' | 'profile';
export type ModerationAction =
  | 'hide_post'
  | 'unhide_post'
  | 'hide_comment'
  | 'unhide_comment'
  | 'delete_message'
  | 'remove_from_events'
  | 'dismiss'
  | 'mark_reviewed';

export const MODERATION_ACTIONS: ModerationAction[] = ['hide_post', 'unhide_post', 'hide_comment', 'unhide_comment', 'delete_message', 'remove_from_events', 'dismiss', 'mark_reviewed'];

/** Which report types an action may be used on. `remove_from_events` and the decisions apply to every type. */
export function actionAppliesTo(action: ModerationAction, contentType: ContentType): boolean {
  switch (action) {
    case 'hide_post':
    case 'unhide_post':
    case 'hide_comment':
    case 'unhide_comment':
      return contentType === 'post';
    case 'delete_message':
      return contentType === 'message';
    default:
      return true;
  }
}

/**
 * The report's status after an action, or `null` when the status must not change:
 * un-hiding is an undo, so it leaves the report as it was.
 */
export function statusAfterAction(action: ModerationAction): ReportStatus | null {
  switch (action) {
    case 'unhide_post':
    case 'unhide_comment':
      return null;
    case 'dismiss':
      return 'dismissed';
    case 'mark_reviewed':
      return 'reviewed';
    default:
      return 'actioned';
  }
}

/**
 * The events to remove someone from: de-duplicated, and every one must be an event they're
 * currently in. Returns `'empty'` (nothing chosen), `'not_member'` (a stale or foreign id) or the list.
 */
export function validateRemovalEventIds(requested: unknown[] | undefined, memberOf: Iterable<string>): string[] | 'empty' | 'not_member' {
  const ids = [...new Set((requested ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return 'empty';
  const allowed = new Set(memberOf);
  return ids.every((id) => allowed.has(id)) ? ids : 'not_member';
}

/** A trimmed note of at most 1,000 characters, or null. */
export function normalizeNote(note: unknown): string | null {
  return typeof note === 'string' && note.trim() ? note.trim().slice(0, 1000) : null;
}
