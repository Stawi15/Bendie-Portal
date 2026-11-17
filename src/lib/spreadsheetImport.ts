/**
 * Feature 023 — Smart Spreadsheet Import.
 *
 * Reads CSV and Excel (.xlsx) files into the same `{ headers, rows }` shape the
 * shared `CsvImportModal` already uses, and suggests which source column goes
 * to which template field. Everything here runs in the browser; nothing is sent
 * over the network (spec FR-018).
 *
 * Ported from the unmerged Codex branch `codex/ux-foundations-smart-import`
 * (commit 45a2a91), with the corrections recorded in
 * `specs/023-smart-spreadsheet-import/research.md`:
 *   R2 — a heading that equals a template key ignoring case is an exact match;
 *   R3 — source columns that aren't mapped pass through unchanged;
 *   R4 — CSV parsing is exactly today's `parseCsvFile` (no new checks or limits);
 *   R5 — Excel dates/times are converted from their UTC parts (no day shift,
 *        time-only cells become HH:MM);
 *   R6 — Excel rows keep their real worksheet row number.
 */
import { parseCsvFile, validateHeaders, type ColumnSpec, type ParsedCsv } from './csvImport';

/** Excel only (research R4): CSV and pasted rows keep today's behaviour. */
export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 5_000;

/** How many leading rows are searched for the heading row of an Excel sheet. */
const HEADER_SEARCH_ROWS = 25;
/** Minimum similarity for an automatic suggestion; weaker matches stay unmatched (FR-010). */
const SUGGESTION_THRESHOLD = 0.6;

export type ParsedSheet = ParsedCsv & {
  name: string;
  /** Excel only: the real worksheet row of each entry in `rows` (same length). */
  rowNumbers?: number[];
};

export type ParsedWorkbook = { filename: string; sheets: ParsedSheet[] };

export type MappingConfidence = 'exact' | 'suggested' | 'manual' | 'unmapped';

export type ColumnMapping = {
  targetKey: string;
  sourceHeader: string | null;
  confidence: MappingConfidence;
};

export type SpreadsheetImportErrorCode =
  | 'unsupported'
  | 'legacy_excel'
  | 'too_large'
  | 'empty'
  | 'duplicate_headers'
  | 'too_many_rows'
  | 'unreadable';

/** A failure whose `message` is safe and meant to be shown to the user (FR-019). */
export class SpreadsheetImportError extends Error {
  constructor(
    public readonly code: SpreadsheetImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SpreadsheetImportError';
  }
}

// ---------------------------------------------------------------------------
// Header matching
// ---------------------------------------------------------------------------

const TOKEN_ALIASES: Record<string, string> = {
  'e-mail': 'email',
  mail: 'email',
  mobile: 'phone',
  telephone: 'phone',
  tel: 'phone',
  organisation: 'organization',
  attendee: 'participant',
  attendee_name: 'participant',
  speaker_name: 'speaker',
};

/** Lower-cases, splits camelCase/snake_case/punctuation into words and folds common variants. */
export function normalizeHeader(value: string): string {
  const withWordBreaks = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return withWordBreaks
    .toLowerCase()
    .trim()
    .replace(/\be[\s-]?mail\b/g, 'email')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => TOKEN_ALIASES[token] ?? token)
    .join(' ');
}

function tokens(value: string): Set<string> {
  return new Set(normalizeHeader(value).split(' ').filter(Boolean));
}

function similarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** True when the heading is the template key itself, ignoring case and surrounding spaces (research R2). */
function isExactKey(header: string, column: ColumnSpec): boolean {
  return sameText(header, column.key);
}

function scoreHeader(header: string, column: ColumnSpec): number {
  if (isExactKey(header, column)) return 1;
  if (sameText(header, column.label)) return 0.99;
  if (column.aliases?.some((alias) => sameText(header, alias))) return 0.98;

  const candidates = [column.key, column.label, ...(column.aliases ?? [])];
  const normalizedHeader = normalizeHeader(header);
  if (candidates.some((candidate) => normalizedHeader === normalizeHeader(candidate))) return 0.96;
  return Math.max(...candidates.map((candidate) => similarity(header, candidate)));
}

/**
 * One mapping per template field. Exact key matches are taken first, so a
 * heading that IS another field's key can never be claimed by an earlier
 * field; the remaining headings are then suggested best-score-first across all
 * fields. Each heading is used at most once.
 */
export function suggestColumnMappings(headers: string[], columns: ColumnSpec[]): ColumnMapping[] {
  const available = new Set(headers);
  const byKey = new Map<string, ColumnMapping>();

  for (const column of columns) {
    const exact = [...available].find((header) => isExactKey(header, column));
    if (exact !== undefined) {
      available.delete(exact);
      byKey.set(column.key, { targetKey: column.key, sourceHeader: exact, confidence: 'exact' });
    }
  }

  const candidates = columns
    .filter((column) => !byKey.has(column.key))
    .flatMap((column, columnOrder) =>
      [...available].map((header, headerOrder) => ({ column, header, score: scoreHeader(header, column), columnOrder, headerOrder }))
    )
    .filter((candidate) => candidate.score >= SUGGESTION_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.columnOrder - b.columnOrder || a.headerOrder - b.headerOrder);

  for (const { column, header } of candidates) {
    if (byKey.has(column.key) || !available.has(header)) continue;
    available.delete(header);
    byKey.set(column.key, { targetKey: column.key, sourceHeader: header, confidence: 'suggested' });
  }

  return columns.map((column) => byKey.get(column.key) ?? { targetKey: column.key, sourceHeader: null, confidence: 'unmapped' });
}

/**
 * Research R2: the matching step is skipped (rows go to the screen exactly as
 * today) only when every required key is present AND no extra heading looks
 * like a template field the file doesn't already cover.
 */
export function needsColumnReview(headers: string[], columns: ColumnSpec[], mappings: ColumnMapping[]): boolean {
  if (validateHeaders(headers, columns).length > 0) return true;
  return mappings.some(
    (mapping) => mapping.confidence === 'suggested' && mapping.sourceHeader !== null && !columns.some((c) => isExactKey(mapping.sourceHeader as string, c))
  );
}

/** Source headings assigned to more than one template field (FR-012). */
export function findDuplicateSources(mappings: ColumnMapping[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { sourceHeader } of mappings) {
    if (!sourceHeader) continue;
    if (seen.has(sourceHeader)) duplicates.add(sourceHeader);
    seen.add(sourceHeader);
  }
  return [...duplicates];
}

/** Required template fields with no source column (FR-012). */
export function unmatchedRequired(columns: ColumnSpec[], mappings: ColumnMapping[]): ColumnSpec[] {
  return columns.filter((column) => column.required && !mappings.find((m) => m.targetKey === column.key)?.sourceHeader);
}

/**
 * Research R3: each row gets every mapped template key with its source value,
 * plus every source column that wasn't used, under its original heading — so a
 * screen that reads a column outside its template still finds it. A leftover
 * heading equal to a template key (ignoring case) is dropped so it can't shadow
 * the mapped value through `getField`'s case-insensitive lookup.
 *
 * Key order: mapped template keys first, in template order, then the passed-through
 * columns — so the row's "first value" (used to label rows in messages and the
 * error report) is its identifying field, not an extra notes column (T032, FR-017).
 */
export function applyColumnMappings(rows: Record<string, string>[], mappings: ColumnMapping[], columns: ColumnSpec[]): Record<string, string>[] {
  const sourceFor = new Map(mappings.filter((m) => m.sourceHeader).map((m) => [m.targetKey, m.sourceHeader as string]));
  const mapped = columns.filter((c) => sourceFor.has(c.key)).map((c) => ({ targetKey: c.key, sourceHeader: sourceFor.get(c.key) as string }));
  const usedSources = new Set(mapped.map((m) => m.sourceHeader));
  const templateKeys = columns.map((c) => c.key.toLowerCase());

  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const m of mapped) out[m.targetKey] = row[m.sourceHeader] ?? '';
    for (const [header, value] of Object.entries(row)) {
      if (usedSources.has(header) || templateKeys.includes(header.trim().toLowerCase())) continue;
      out[header] = value;
    }
    return out;
  });
}

/** Template-key-only rows, in template order, for the corrected CSV download (FR-016). */
export function buildCorrectedRows(rows: Record<string, string>[], columns: ColumnSpec[], mappings: ColumnMapping[]): Record<string, string>[] {
  const sourceFor = new Map(mappings.map((m) => [m.targetKey, m.sourceHeader]));
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => {
        const source = sourceFor.get(column.key);
        return [column.key, source ? (row[source] ?? '') : ''];
      })
    )
  );
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

/**
 * Headings are duplicates only when they are the same text (ignoring case and
 * surrounding spaces). Two columns that merely MEAN the same thing — "Phone" and
 * "Mobile", "Email" and "E-mail" — are different columns and both allowed; the
 * matching step lets the user pick which one goes where.
 */
function assertUniqueHeaders(headers: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const header of headers) {
    const key = header.trim().toLowerCase();
    if (seen.has(key)) duplicates.add(header);
    seen.add(key);
  }
  if (duplicates.size > 0) {
    throw new SpreadsheetImportError(
      'duplicate_headers',
      `Rename the duplicate column${duplicates.size === 1 ? '' : 's'} before continuing: ${[...duplicates].join(', ')}.`
    );
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Research R5: turns an exceljs cell value into the text the cell displays.
 * exceljs gives date cells as UTC-based `Date`s, so only UTC parts are read —
 * the calendar date never shifts with the viewer's time zone.
 *
 * `numFmt` (the cell's Excel number format) is used for percentages: a cell
 * showing `15%` stores 0.15, and is returned as `15%` (T031, FR-006). Other number
 * formats (currency, thousands separators) are returned as the plain number.
 */
export function cellText(value: unknown, numFmt?: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && numFmt && isPercentFormat(numFmt)) return formatPercent(value, numFmt);
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const hhmm = `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
    // Excel stores a time-only value as a fraction of a day from its 1899-12-30 epoch.
    const isTimeOnly = value.getUTCFullYear() === 1899 && value.getUTCMonth() === 11 && (value.getUTCDate() === 30 || value.getUTCDate() === 31);
    if (isTimeOnly) return hhmm;
    const date = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    const hasTime = value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0 || value.getUTCSeconds() !== 0;
    return hasTime ? `${date} ${hhmm}` : date;
  }
  if (typeof value === 'object') {
    const cell = value as { result?: unknown; error?: unknown; richText?: Array<{ text: string }>; text?: unknown };
    if ('error' in cell && cell.error !== undefined) return '';
    if ('result' in cell) return cellText(cell.result, numFmt);
    if (Array.isArray(cell.richText)) return cell.richText.map((part) => part.text).join('').trim();
    if (cell.text !== undefined) return cellText(cell.text);
    return '';
  }
  return String(value).trim();
}

/** A `%` outside quoted literal text (e.g. `0%`, `0.00%`; not `0 "%"` or `"Rate %"`) and outside escapes. */
function isPercentFormat(numFmt: string): boolean {
  return /%/.test(numFmt.replace(/"[^"]*"/g, '').replace(/\\./g, ''));
}

/** Formats as Excel does: value × 100 with the format's decimal places (`0.0%` → one). */
function formatPercent(value: number, numFmt: string): string {
  const firstSection = numFmt.split(';')[0].replace(/"[^"]*"/g, '');
  const decimals = firstSection.match(/\.([0#?]+)%/)?.[1].length ?? 0;
  return `${(value * 100).toFixed(decimals)}%`;
}

/** The parts of an exceljs worksheet this module reads (kept narrow so it's easy to stub in tests). */
type WorksheetLike = {
  name: string;
  rowCount: number;
  columnCount: number;
  getRow(n: number): { cellCount: number; getCell(n: number): CellLike };
};

type CellLike = { value: unknown; numFmt?: string; isMerged?: boolean; address?: string; master?: { address?: string } };

/** True for a cell covered by a merge but not its top-left cell; exceljs repeats the merged value there. */
const isMergedCopy = (cell: CellLike) => Boolean(cell.isMerged && cell.master && cell.master.address !== cell.address);

/** Reads one worksheet; returns null when it has no data rows (such sheets aren't offered — FR-004). */
export function readWorksheet(worksheet: WorksheetLike): ParsedSheet | null {
  const width = Math.max(worksheet.columnCount, 1);
  const rowValues = (rowNumber: number) => {
    const row = worksheet.getRow(rowNumber);
    return Array.from({ length: width }, (_, index) => {
      const cell = row.getCell(index + 1);
      return cellText(cell.value, cell.numFmt);
    });
  };
  /**
   * Heading candidates: like `rowValues`, but a cell that is only a merged copy counts as
   * empty. exceljs repeats a merged cell's value in every cell it covers, so without this a
   * title merged across the top ("Speaker list 2026" over A1:D1) would look like a heading row
   * of duplicate columns. Two separate cells that both say "Name" are still two headings.
   */
  const headingValues = (rowNumber: number) => {
    const row = worksheet.getRow(rowNumber);
    return Array.from({ length: width }, (_, index) => {
      const cell = row.getCell(index + 1);
      return isMergedCopy(cell) ? '' : cellText(cell.value, cell.numFmt);
    });
  };

  // FR-005: the heading row is the first of the leading rows with at least two filled cells.
  let headerRow: { row: number; values: string[] } | undefined;
  let firstNonEmpty: { row: number; values: string[] } | undefined;
  for (let r = 1; r <= Math.min(HEADER_SEARCH_ROWS, worksheet.rowCount); r += 1) {
    const values = headingValues(r);
    const filled = values.filter(Boolean).length;
    if (filled > 0 && !firstNonEmpty) firstNonEmpty = { row: r, values };
    if (filled >= 2) {
      headerRow = { row: r, values };
      break;
    }
  }
  headerRow ??= firstNonEmpty;
  if (!headerRow) return null;

  const activeColumns = headerRow.values.map((header, index) => ({ header: header.trim(), index })).filter((c) => c.header.length > 0);
  const headers = activeColumns.map((c) => c.header);
  assertUniqueHeaders(headers);

  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  for (let r = headerRow.row + 1; r <= worksheet.rowCount; r += 1) {
    const values = rowValues(r);
    const record = Object.fromEntries(activeColumns.map(({ header, index }) => [header, values[index] ?? '']));
    if (!Object.values(record).some(Boolean)) continue; // blank rows are skipped, not reported
    rows.push(record);
    rowNumbers.push(r);
  }
  if (rows.length === 0) return null;
  if (rows.length > MAX_SPREADSHEET_ROWS) {
    throw new SpreadsheetImportError(
      'too_many_rows',
      `The sheet “${worksheet.name}” has ${rows.length.toLocaleString()} rows. Split it into files of ${MAX_SPREADSHEET_ROWS.toLocaleString()} rows or fewer.`
    );
  }
  return { name: worksheet.name, headers, rows, rowNumbers };
}

/**
 * Reads a chosen file. CSV goes through today's `parseCsvFile` unchanged
 * (research R4); Excel is read with exceljs, loaded only now (research R8).
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedWorkbook> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    const { headers, rows } = await parseCsvFile(file);
    return { filename: file.name, sheets: [{ name: 'CSV data', headers, rows }] };
  }
  if (extension === 'xls') {
    throw new SpreadsheetImportError('legacy_excel', 'Legacy .xls files aren’t supported. In Excel, save the file as .xlsx or CSV, then try again.');
  }
  if (extension !== 'xlsx') {
    throw new SpreadsheetImportError('unsupported', 'Choose a CSV or Excel (.xlsx) file.');
  }
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new SpreadsheetImportError('too_large', 'This file is larger than 10 MB. Remove unused sheets or split the data, then try again.');
  }

  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const sheets: ParsedSheet[] = [];
    workbook.eachSheet((worksheet) => {
      const sheet = readWorksheet(worksheet as unknown as WorksheetLike);
      if (sheet) sheets.push(sheet);
    });
    if (sheets.length === 0) {
      throw new SpreadsheetImportError('empty', 'No sheet with data was found. Include a heading row and at least one row of data.');
    }
    return { filename: file.name, sheets };
  } catch (error) {
    if (error instanceof SpreadsheetImportError) throw error;
    console.error('[spreadsheet import]', error);
    throw new SpreadsheetImportError(
      'unreadable',
      'We couldn’t open this workbook. If it’s password-protected, remove the password or save it as CSV first.'
    );
  }
}
