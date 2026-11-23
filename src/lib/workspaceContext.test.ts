import { describe, expect, it } from 'vitest';
import {
  PLANNER_SCOPE_NOTE,
  roleLabel,
  visibilityLines,
  visibilitySentence,
} from './workspaceContext';

describe('visibilitySentence', () => {
  it('describes draft as not public', () => {
    expect(visibilitySentence('draft')).toMatch(/^Draft · not public/);
  });
  it.each(['published', 'active'])('describes %s as public in the attendee app', (s) => {
    expect(visibilitySentence(s)).toMatch(/^Public in the attendee app/);
  });
  it.each(['completed', 'archived'])('describes %s as a past, non-public event', (s) => {
    expect(visibilitySentence(s)).toMatch(/^Not public · past event/);
  });
  it('treats unknown or missing status as draft', () => {
    expect(visibilitySentence(null)).toBe(visibilitySentence('draft'));
    expect(visibilitySentence('weird')).toBe(visibilitySentence('draft'));
  });
  it('adds the Planner scope note only when the event has Planner', () => {
    expect(visibilityLines('draft', false)).toHaveLength(1);
    expect(visibilityLines('draft', true)).toEqual([
      visibilitySentence('draft'),
      PLANNER_SCOPE_NOTE,
    ]);
  });
});

describe('roleLabel', () => {
  it('puts Stawi admin first', () => {
    expect(roleLabel({ isGlobalAdmin: true, orgRole: 'owner', eventRole: 'host' })).toBe(
      'Stawi admin'
    );
  });
  it('puts organisation owner/admin above event roles', () => {
    expect(roleLabel({ isGlobalAdmin: false, orgRole: 'owner', eventRole: 'staff' })).toBe(
      'Organisation owner'
    );
    expect(roleLabel({ isGlobalAdmin: false, orgRole: 'admin', eventRole: 'host' })).toBe(
      'Organisation admin'
    );
  });
  it('uses the event role for ordinary organisation members', () => {
    expect(roleLabel({ isGlobalAdmin: false, orgRole: 'member', eventRole: 'organizer' })).toBe(
      'Event organiser'
    );
    expect(roleLabel({ isGlobalAdmin: false, orgRole: 'staff', eventRole: 'staff' })).toBe(
      'Event staff'
    );
  });
  it('falls back to organisation member', () => {
    expect(roleLabel({ isGlobalAdmin: false, orgRole: 'member', eventRole: null })).toBe(
      'Organisation member'
    );
    expect(roleLabel({ isGlobalAdmin: false, orgRole: null, eventRole: undefined })).toBe(
      'Organisation member'
    );
  });
});
