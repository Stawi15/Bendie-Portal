import { describe, expect, it } from 'vitest';
import { EVENT_SECTIONS } from './eventSectionMeta';
import { EVENT_AREA_LABELS, EVENT_AREA_ORDER, groupSectionsByArea } from './eventAreas';

describe('event areas', () => {
  it('gives every one of the 32 sections exactly one known area', () => {
    expect(EVENT_SECTIONS).toHaveLength(32);
    for (const s of EVENT_SECTIONS) expect(Object.keys(EVENT_AREA_LABELS)).toContain(s.area);
  });

  it('matches the data-model counts (2/4/6/3/5/10 + 2 utilities)', () => {
    const count = (a: string) => EVENT_SECTIONS.filter((s) => s.area === a).length;
    expect(EVENT_AREA_ORDER.map(count)).toEqual([2, 4, 6, 3, 5, 10]);
    expect(count('utility')).toBe(2);
  });

  it('groups in sidebar order, drops empty areas and separates utilities', () => {
    const pick = (...keys: string[]) => EVENT_SECTIONS.filter((s) => keys.includes(s.key));
    const { areas, utilities } = groupSectionsByArea(
      pick('news', 'dashboard', 'activity-log', 'basics')
    );
    expect(areas.map((a) => a.area)).toEqual(['overview', 'setup', 'content']);
    expect(utilities.map((s) => s.key)).toEqual(['activity-log']);
  });
});
