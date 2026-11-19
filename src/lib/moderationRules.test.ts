import { describe, expect, it } from 'vitest';
import { MODERATION_ACTIONS, actionAppliesTo, normalizeNote, statusAfterAction, validateRemovalEventIds } from './moderationRules';

describe('actionAppliesTo', () => {
  it('limits post and comment actions to post reports', () => {
    for (const a of ['hide_post', 'unhide_post', 'hide_comment', 'unhide_comment'] as const) {
      expect(actionAppliesTo(a, 'post')).toBe(true);
      expect(actionAppliesTo(a, 'message')).toBe(false);
      expect(actionAppliesTo(a, 'profile')).toBe(false);
    }
  });

  it('limits delete_message to message reports', () => {
    expect(actionAppliesTo('delete_message', 'message')).toBe(true);
    expect(actionAppliesTo('delete_message', 'post')).toBe(false);
    expect(actionAppliesTo('delete_message', 'profile')).toBe(false);
  });

  it('allows removal and the decisions on every report type', () => {
    for (const a of ['remove_from_events', 'dismiss', 'mark_reviewed'] as const) {
      for (const t of ['post', 'message', 'profile'] as const) expect(actionAppliesTo(a, t)).toBe(true);
    }
  });
});

describe('statusAfterAction', () => {
  it('marks content actions as actioned', () => {
    for (const a of ['hide_post', 'hide_comment', 'delete_message', 'remove_from_events'] as const) expect(statusAfterAction(a)).toBe('actioned');
  });

  it('maps the decisions', () => {
    expect(statusAfterAction('dismiss')).toBe('dismissed');
    expect(statusAfterAction('mark_reviewed')).toBe('reviewed');
  });

  it('leaves the status alone when un-hiding (an undo)', () => {
    expect(statusAfterAction('unhide_post')).toBeNull();
    expect(statusAfterAction('unhide_comment')).toBeNull();
  });

  it('covers every action', () => {
    for (const a of MODERATION_ACTIONS) expect(statusAfterAction(a) === null || typeof statusAfterAction(a) === 'string').toBe(true);
  });
});

describe('validateRemovalEventIds', () => {
  const memberOf = ['e1', 'e2', 'e3'];

  it('needs at least one event', () => {
    expect(validateRemovalEventIds(undefined, memberOf)).toBe('empty');
    expect(validateRemovalEventIds([], memberOf)).toBe('empty');
    expect(validateRemovalEventIds(['', 5, null], memberOf)).toBe('empty');
  });

  it('refuses any event the person is not in', () => {
    expect(validateRemovalEventIds(['e1', 'other-event'], memberOf)).toBe('not_member');
  });

  it('de-duplicates valid ids', () => {
    expect(validateRemovalEventIds(['e2', 'e2', 'e1'], memberOf)).toEqual(['e2', 'e1']);
  });
});

describe('normalizeNote', () => {
  it('trims, caps at 1,000 characters and drops blanks', () => {
    expect(normalizeNote('  spam account  ')).toBe('spam account');
    expect(normalizeNote('   ')).toBeNull();
    expect(normalizeNote(42)).toBeNull();
    expect(normalizeNote('x'.repeat(1200))).toHaveLength(1000);
  });
});
