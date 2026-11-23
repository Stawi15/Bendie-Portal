import { describe, expect, it } from 'vitest';
import { initialRightPanelState as init, rightPanelReducer as r } from './rightPanel';

describe('rightPanelReducer', () => {
  it('cannot open with nothing registered (030 default)', () => {
    expect(r(init, { type: 'toggle' })).toBe(init);
    expect(r(init, { type: 'open', id: 'x' })).toBe(init);
  });
  it('opens, toggles and closes registered content', () => {
    const s1 = r(init, { type: 'register', id: 'details' });
    const s2 = r(s1, { type: 'toggle' });
    expect(s2.openId).toBe('details');
    expect(r(s2, { type: 'toggle' }).openId).toBeNull();
    expect(r(s2, { type: 'close' }).openId).toBeNull();
    expect(r(s1, { type: 'open', id: 'details' }).openId).toBe('details');
  });
  it('closes when the open content unregisters', () => {
    const open = r(r(init, { type: 'register', id: 'a' }), { type: 'open', id: 'a' });
    const s = r(open, { type: 'unregister', id: 'a' });
    expect(s).toEqual({ registered: [], openId: null });
  });
  it('does not register the same id twice', () => {
    const s = r(r(init, { type: 'register', id: 'a' }), { type: 'register', id: 'a' });
    expect(s.registered).toEqual(['a']);
  });
});
