/**
 * Feature 024 — event time zones.
 *
 * Every Bendie event can carry an IANA time zone (`events.timezone`, e.g.
 * `Africa/Nairobi`). The attendee app reads each event's local date in that zone
 * for its automatic pushes, and Bendie Planner treats every event time as venue
 * wall-clock in its own `events.timezone`. So dates organisers type into the
 * Portal are read as venue time in the event's zone ("venue time").
 *
 * Pure helpers using only `Intl` — safe in the browser and in Node route handlers.
 * See `specs/024-event-timezone/research.md` (R2).
 */

/** Used when the browser can't list its zones (very old browsers). */
const FALLBACK_TIME_ZONES = [
  'Africa/Abidjan', 'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Cairo', 'Africa/Dar_es_Salaam', 'Africa/Johannesburg',
  'Africa/Kampala', 'Africa/Kigali', 'Africa/Lagos', 'Africa/Lusaka', 'Africa/Nairobi', 'Africa/Windhoek',
  'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/New_York', 'America/Sao_Paulo', 'America/Toronto',
  'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Kolkata', 'Asia/Riyadh', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London',
  'Europe/Madrid', 'Europe/Paris', 'Europe/Rome', 'Europe/Zurich', 'Indian/Mauritius', 'Pacific/Auckland', 'UTC',
];

let cachedList: string[] | null = null;

/** Every selectable IANA zone, sorted, always including `UTC`. */
export function listTimeZones(): string[] {
  if (cachedList) return cachedList;
  let zones: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supported === 'function') zones = supported('timeZone');
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = FALLBACK_TIME_ZONES;
  // The detected zone is always offered: a browser can report its own zone under an alias its
  // list doesn't contain, and the pre-filled value must never fail "choose from the list".
  const detected = detectTimeZone();
  cachedList = Array.from(new Set([...zones, 'UTC', ...(detected ? [detected] : [])])).sort();
  return cachedList;
}

/** True when `name` is a zone this runtime understands (any IANA name or alias). */
export function isValidTimeZone(name: unknown): name is string {
  if (typeof name !== 'string' || !name || name.length > 64) return false;
  // IANA names only (`Africa/Nairobi`, `UTC`, `Etc/GMT+3`). Newer runtimes also accept raw offsets
  // such as `+03:00`, which the Bendie brief says the database must not receive.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(name)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** True when `name` is one of the names offered by the picker (FR-003). */
export function isListedTimeZone(name: unknown): name is string {
  return typeof name === 'string' && listTimeZones().includes(name);
}

/** The organiser's computer time zone, or null if it can't be detected. */
export function detectTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInZone(instant: Date, timeZone: string): Parts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const get = (type: string) => Number(formatter.formatToParts(instant).find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Nairobi: +180). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** "UTC+03:00", "UTC-05:00", "UTC" — the zone's offset now (or at `at`). */
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  if (!isValidTimeZone(timeZone)) return '';
  const minutes = offsetMinutes(at, timeZone);
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/**
 * Venue wall-clock → stored instant. `local` is `YYYY-MM-DD` (start of that day)
 * or `YYYY-MM-DDTHH:mm` (a `datetime-local` value). Returns an ISO string, or
 * null when the input or zone is invalid. Two passes keep it right across
 * daylight-saving changes.
 */
export function zonedLocalToUtcIso(local: string, timeZone: string): string | null {
  const match = LOCAL_PATTERN.exec(local.trim());
  if (!match || !isValidTimeZone(timeZone)) return null;
  const [, y, mo, d, h = '00', mi = '00'] = match;
  const wallClockAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (Number.isNaN(wallClockAsUtc)) return null;
  let instant = wallClockAsUtc - offsetMinutes(new Date(wallClockAsUtc), timeZone) * 60000;
  instant = wallClockAsUtc - offsetMinutes(new Date(instant), timeZone) * 60000;
  return new Date(instant).toISOString();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Stored instant → venue wall-clock as a `datetime-local` value (`YYYY-MM-DDTHH:mm`). */
export function utcIsoToZonedLocal(iso: string | null | undefined, timeZone: string): string {
  if (!iso || !isValidTimeZone(timeZone)) return '';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  const p = partsInZone(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Stored instant → the venue's calendar date (`YYYY-MM-DD`), or null. */
export function zonedDateOf(iso: string | null | undefined, timeZone: string): string | null {
  const local = utcIsoToZonedLocal(iso, timeZone);
  return local ? local.slice(0, 10) : null;
}

/** True for the database rejecting a zone name (`events_timezone_valid`, check violation 23514). */
export function isTimeZoneConstraintError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return /events_timezone_valid/i.test(message) || (error.code === '23514' && /timezone/i.test(message));
}

/** The user-facing message for a rejected zone (FR-014). */
export const TIME_ZONE_REJECTED_MESSAGE = 'That time zone isn’t recognised. Choose another from the list.';
