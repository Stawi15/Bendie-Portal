import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EMPTY_SPEAKER_INPUT,
  NO_SPEAKER_FILTERS,
  SPEAKER_CSV_SAMPLES,
  SPEAKER_EMAIL_INVALID,
  SPEAKER_NAME_REQUIRED,
  addSpeakerFromAttendee,
  applySpeakerFilters,
  attendeeSpeakerPayload,
  createSpeaker,
  importSpeakerRow,
  matchesSearch,
  mergeSpeakerSessions,
  normaliseSpeakerInput,
  parseSpeakerCsvRow,
  speakerGroups,
  speakerSortValue,
  updateSpeaker,
  validateSpeaker,
  type Speaker,
} from './speakers';

const sp = (o: Partial<Speaker>): Speaker => ({
  id: o.id ?? 'x',
  full_name: null,
  email: null,
  job_title: null,
  organization: null,
  bio: null,
  avatar_url: null,
  facilitator_group: null,
  role_type: 'speaker',
  linkedin_url: null,
  expertise: null,
  display_order: 0,
  claim_status: 'unclaimed',
  ...o,
});

/** Minimal chainable stub that records what a query would write. */
function stubClient(opts: { existing?: unknown; error?: unknown } = {}) {
  const calls: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] =
    [];
  const client = {
    from(table: string) {
      const call = {
        table,
        op: 'select',
        payload: undefined as unknown,
        filters: [] as [string, unknown][],
      };
      calls.push(call);
      const chain: Record<string, unknown> = {
        select() {
          return chain;
        },
        insert(p: unknown) {
          call.op = 'insert';
          call.payload = p;
          return chain;
        },
        update(p: unknown) {
          call.op = 'update';
          call.payload = p;
          return chain;
        },
        delete() {
          call.op = 'delete';
          return chain;
        },
        eq(k: string, v: unknown) {
          call.filters.push([k, v]);
          return chain;
        },
        order() {
          return chain;
        },
        single: async () => ({ data: { id: 'new' }, error: opts.error ?? null }),
        maybeSingle: async () => ({ data: opts.existing ?? null, error: opts.error ?? null }),
        then(res: (v: unknown) => unknown) {
          return Promise.resolve({ data: null, error: opts.error ?? null }).then(res);
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('validateSpeaker', () => {
  it('requires a name (trimmed) with the original message', () => {
    expect(validateSpeaker({ full_name: '  ', email: '' })).toEqual({
      full_name: SPEAKER_NAME_REQUIRED,
    });
    expect(SPEAKER_NAME_REQUIRED).toBe('Enter the speaker’s name.');
  });
  it('checks email format only when present, with the original message', () => {
    expect(validateSpeaker({ full_name: 'A', email: 'bad' })).toEqual({
      email: SPEAKER_EMAIL_INVALID,
    });
    expect(validateSpeaker({ full_name: 'A', email: ' a@b.co ' })).toEqual({});
    expect(validateSpeaker({ full_name: 'A', email: '' })).toEqual({});
  });
});

describe('normaliseSpeakerInput', () => {
  it('turns empty strings into null, defaults the role and keeps the name as typed', () => {
    const n = normaliseSpeakerInput({ ...EMPTY_SPEAKER_INPUT, full_name: ' Jane ', role_type: '' });
    expect(n.full_name).toBe(' Jane ');
    expect(n.email).toBeNull();
    expect(n.bio).toBeNull();
    expect(n.role_type).toBe('speaker');
  });
});

describe('search, filters, groups and sort', () => {
  const list = [
    sp({
      id: '1',
      full_name: 'Zoe',
      organization: 'Acme',
      facilitator_group: 'Keynote',
      display_order: 2,
      claim_status: 'claimed',
    }),
    sp({
      id: '2',
      full_name: 'adam',
      email: 'adam@x.io',
      facilitator_group: 'Breakout',
      role_type: 'presenter',
      display_order: 0,
    }),
    sp({ id: '3', full_name: 'Mia', job_title: 'CTO', expertise: 'AI', display_order: 1 }),
  ];
  it('searches the six fields, case-insensitively', () => {
    expect(matchesSearch(list[1], 'ADAM@')).toBe(true);
    expect(matchesSearch(list[2], 'cto')).toBe(true);
    expect(matchesSearch(list[2], 'ai')).toBe(true);
    expect(matchesSearch(list[0], 'acme')).toBe(true);
    expect(matchesSearch(list[0], 'keyn')).toBe(true);
    expect(matchesSearch(list[0], 'nothing')).toBe(false);
  });
  it('filters by group, role and not-claimed, combined with search', () => {
    expect(
      applySpeakerFilters(list, '', { ...NO_SPEAKER_FILTERS, group: 'Keynote' }).map((s) => s.id)
    ).toEqual(['1']);
    expect(
      applySpeakerFilters(list, '', { ...NO_SPEAKER_FILTERS, role: 'presenter' }).map((s) => s.id)
    ).toEqual(['2']);
    expect(
      applySpeakerFilters(list, '', { ...NO_SPEAKER_FILTERS, unclaimedOnly: true }).map((s) => s.id)
    ).toEqual(['2', '3']);
    expect(
      applySpeakerFilters(list, 'mia', { ...NO_SPEAKER_FILTERS, unclaimedOnly: true }).map(
        (s) => s.id
      )
    ).toEqual(['3']);
  });
  it('lists the groups present, alphabetically', () => {
    expect(speakerGroups(list)).toEqual(['Breakout', 'Keynote']);
  });
  it('gives sort values with empties as undefined and claimed first', () => {
    expect(speakerSortValue(list[1], 'full_name')).toBe('adam');
    expect(speakerSortValue(list[1], 'organization')).toBeUndefined();
    expect(speakerSortValue(sp({ organization: '   ' }), 'organization')).toBeUndefined();
    expect(
      speakerSortValue(list[0], 'claim_status')! < speakerSortValue(list[1], 'claim_status')!
    ).toBe(true);
  });
});

describe('spreadsheet rows', () => {
  it('parses the template samples and the old header', () => {
    const r = parseSpeakerCsvRow(SPEAKER_CSV_SAMPLES[1], 0);
    expect(r.errors).toEqual([]);
    expect(r.data?.facilitator_group).toBe('Breakout Sessions');
    expect(r.data?.role_type).toBe('presenter');
    expect(
      parseSpeakerCsvRow({ full_name: 'A', facilitator_group: 'Old' }, 0).data?.facilitator_group
    ).toBe('Old');
  });
  it('rejects a missing name and an unknown role', () => {
    expect(parseSpeakerCsvRow({ full_name: '', role_type: 'host' }, 3).errors).toEqual([
      'full_name is required',
      'role_type must be one of: speaker, presenter',
    ]);
  });
  it('imports with display order = count + row index and no rowIndex column', async () => {
    const { client, calls } = stubClient();
    const parsed = parseSpeakerCsvRow({ full_name: 'A' }, 2).data!;
    await importSpeakerRow(client, 'ev', parsed, 5 + 2);
    expect(calls[0].payload).toMatchObject({ event_id: 'ev', full_name: 'A', display_order: 7 });
    expect(calls[0].payload).not.toHaveProperty('rowIndex');
  });
});

describe('writes keep the pre-031 payloads', () => {
  it('createSpeaker inserts the normalised fields at the given display order', async () => {
    const { client, calls } = stubClient();
    await createSpeaker(
      client,
      'ev',
      { ...EMPTY_SPEAKER_INPUT, full_name: 'Jane', email: 'j@x.io' },
      4
    );
    expect(calls[0].payload).toEqual({
      event_id: 'ev',
      full_name: 'Jane',
      email: 'j@x.io',
      job_title: null,
      organization: null,
      bio: null,
      avatar_url: null,
      facilitator_group: null,
      role_type: 'speaker',
      linkedin_url: null,
      expertise: null,
      display_order: 4,
    });
  });
  it('updateSpeaker never sends display_order', async () => {
    const { client, calls } = stubClient();
    await updateSpeaker(client, 'id1', { ...EMPTY_SPEAKER_INPUT, full_name: 'Jane' });
    expect(calls[0].payload).not.toHaveProperty('display_order');
    expect(calls[0].filters).toEqual([['id', 'id1']]);
  });
  it('the Attendees add inserts exactly what it always did, once', async () => {
    const m = {
      user_id: 'u1',
      profiles: { full_name: 'Ann', email: 'a@x.io', job_title: 'PM', avatar_url: null },
    };
    const now = new Date('2026-11-24T10:00:00Z');
    expect(attendeeSpeakerPayload('ev', m, now)).toEqual({
      event_id: 'ev',
      user_id: 'u1',
      full_name: 'Ann',
      email: 'a@x.io',
      job_title: 'PM',
      avatar_url: null,
      claim_status: 'claimed',
      claimed_at: '2026-11-24T10:00:00.000Z',
    });
    const fresh = stubClient();
    expect(await addSpeakerFromAttendee(fresh.client, 'ev', m)).toEqual({
      created: true,
      error: null,
    });
    expect(fresh.calls.map((c) => c.op)).toEqual(['select', 'insert']);
    const already = stubClient({ existing: { id: 'f1' } });
    expect(await addSpeakerFromAttendee(already.client, 'ev', m)).toEqual({
      created: false,
      error: null,
    });
    expect(already.calls.map((c) => c.op)).toEqual(['select']);
  });
});

describe('mergeSpeakerSessions', () => {
  it('de-duplicates lead and linked sessions and sorts by start, untimed last', () => {
    const a = { id: 'a', title: 'A', starts_at: '2027-03-10T09:00:00Z', ends_at: null };
    const b = { id: 'b', title: 'B', starts_at: '2027-03-10T08:00:00Z', ends_at: null };
    const c = { id: 'c', title: 'C', starts_at: null, ends_at: null };
    expect(mergeSpeakerSessions([a, c], [a, b]).map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });
});
