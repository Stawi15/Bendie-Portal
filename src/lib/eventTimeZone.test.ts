import { describe, expect, it } from 'vitest';
import {
  isListedTimeZone,
  isTimeZoneConstraintError,
  isValidTimeZone,
  listTimeZones,
  utcIsoToZonedLocal,
  utcOffsetLabel,
  zonedDateOf,
  zonedLocalToUtcIso,
} from './eventTimeZone';

describe('zone lists and validation', () => {
  it('lists common zones and always includes UTC', () => {
    const zones = listTimeZones();
    expect(zones).toContain('Africa/Nairobi');
    expect(zones).toContain('America/New_York');
    expect(zones).toContain('UTC');
  });

  it('validates names', () => {
    expect(isValidTimeZone('Africa/Kigali')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(isValidTimeZone('+03:00')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isListedTimeZone('Africa/Kigali')).toBe(true);
    expect(isListedTimeZone('africa/kigali')).toBe(false);
  });

  it('labels offsets', () => {
    expect(utcOffsetLabel('Africa/Nairobi')).toBe('UTC+03:00');
    expect(utcOffsetLabel('UTC')).toBe('UTC');
    expect(utcOffsetLabel('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe('UTC-05:00');
    expect(utcOffsetLabel('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe('UTC-04:00');
    expect(utcOffsetLabel('Asia/Kolkata')).toBe('UTC+05:30');
  });
});

describe('venue time conversion', () => {
  it('converts a Nairobi wall-clock time and back', () => {
    expect(zonedLocalToUtcIso('2026-11-20T09:00', 'Africa/Nairobi')).toBe('2026-11-20T06:00:00.000Z');
    expect(utcIsoToZonedLocal('2026-11-20T06:00:00.000Z', 'Africa/Nairobi')).toBe('2026-11-20T09:00');
  });

  it('treats a date-only value as the start of that day in the zone (FR-006)', () => {
    expect(zonedLocalToUtcIso('2026-11-20', 'America/New_York')).toBe('2026-11-20T05:00:00.000Z');
    expect(zonedLocalToUtcIso('2026-11-20', 'Africa/Nairobi')).toBe('2026-11-19T21:00:00.000Z');
    // ...and that instant is still 20 Nov in the venue's zone.
    expect(zonedDateOf('2026-11-19T21:00:00.000Z', 'Africa/Nairobi')).toBe('2026-11-20');
    expect(zonedDateOf('2026-11-20T05:00:00.000Z', 'America/New_York')).toBe('2026-11-20');
  });

  it('is correct on daylight-saving change-over days', () => {
    // London clocks go forward 29 Mar 2026 01:00 GMT -> 02:00 BST.
    expect(zonedLocalToUtcIso('2026-03-29T09:00', 'Europe/London')).toBe('2026-03-29T08:00:00.000Z');
    expect(zonedLocalToUtcIso('2026-03-28T09:00', 'Europe/London')).toBe('2026-03-28T09:00:00.000Z');
    // New York clocks go back 1 Nov 2026 02:00 EDT -> 01:00 EST.
    expect(zonedLocalToUtcIso('2026-11-01T09:00', 'America/New_York')).toBe('2026-11-01T14:00:00.000Z');
    expect(zonedLocalToUtcIso('2026-10-31T09:00', 'America/New_York')).toBe('2026-10-31T13:00:00.000Z');
    expect(utcIsoToZonedLocal('2026-11-01T14:00:00.000Z', 'America/New_York')).toBe('2026-11-01T09:00');
  });

  it('round-trips every hour of a DST day', () => {
    for (let h = 3; h < 24; h += 1) {
      const local = `2026-03-08T${String(h).padStart(2, '0')}:30`;
      const iso = zonedLocalToUtcIso(local, 'America/New_York');
      expect(utcIsoToZonedLocal(iso, 'America/New_York')).toBe(local);
    }
  });

  it('rejects bad input', () => {
    expect(zonedLocalToUtcIso('20/11/2026', 'Africa/Nairobi')).toBeNull();
    expect(zonedLocalToUtcIso('2026-11-20', 'Mars/Base')).toBeNull();
    expect(utcIsoToZonedLocal(null, 'Africa/Nairobi')).toBe('');
    expect(utcIsoToZonedLocal('not a date', 'Africa/Nairobi')).toBe('');
    expect(zonedDateOf(undefined, 'UTC')).toBeNull();
  });
});

describe('isTimeZoneConstraintError', () => {
  it('recognises the database rejecting a zone', () => {
    expect(isTimeZoneConstraintError({ code: '23514', message: 'new row for relation "events" violates check constraint "events_timezone_valid"' })).toBe(true);
    expect(isTimeZoneConstraintError({ code: '23514', message: 'invalid timezone' })).toBe(true);
  });
  it('ignores unrelated errors that mention timezone', () => {
    expect(isTimeZoneConstraintError({ code: '42501', message: 'permission denied for column timezone' })).toBe(false);
    expect(isTimeZoneConstraintError(null)).toBe(false);
  });
});
