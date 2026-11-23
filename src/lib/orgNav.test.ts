import { describe, expect, it } from 'vitest';
import { orgBreadcrumbTrail } from './orgNav';

const labels = (p: string) => orgBreadcrumbTrail(p).map((c) => c.label);

describe('orgBreadcrumbTrail', () => {
  it('uses the v2 sidebar wording', () => {
    expect(labels('/portal/assets')).toEqual(['Library']);
    expect(labels('/portal/activity-log')).toEqual(['Activity']);
    expect(labels('/portal/teams')).toEqual(['People', 'Teams']);
    expect(labels('/portal/planner/events')).toEqual(['Events']);
  });
  it('shows nothing extra on Home (any product)', () => {
    expect(labels('/portal')).toEqual([]);
    expect(labels('/portal/bendie')).toEqual([]);
    expect(labels('/portal/planner/')).toEqual([]);
  });
  it('never shows a raw id', () => {
    const trail = orgBreadcrumbTrail(
      '/portal/admin/organisations/5e5e0000-0000-4000-8000-000000000001'
    );
    expect(trail).toEqual([
      { label: 'Organisations', href: '/portal/admin/organisations' },
      { label: 'Organisation details' },
    ]);
    expect(labels('/portal/something-new/5e5e0000-0000-4000-8000-000000000001')).toEqual([
      'Something new',
    ]);
  });
});
