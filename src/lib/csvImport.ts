import Papa from 'papaparse';

export type ColumnSpec = {
  key: string;
  label: string;
  required?: boolean;
};

export type RowResult<T> = {
  rowIndex: number;
  raw: Record<string, string>;
  data?: T;
  errors: string[];
};

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      transform: (value) => value.trim(),
      complete: (result) => {
        resolve({ headers: result.meta.fields ?? [], rows: result.data });
      },
      error: (error) => reject(error),
    });
  });
}

/**
 * Feature 016 Data Entry UX pass — "Paste from spreadsheet." Parses raw text
 * pasted from Excel/Google Sheets (tab-separated) or a comma-separated block,
 * converging on the exact same `ParsedCsv` shape `parseCsvFile` produces so
 * every existing `parseRow`/`validateHeaders`/`CsvImportModal` consumer works
 * completely unchanged regardless of which entry path produced the rows.
 * `delimiter: ''` asks PapaParse to auto-detect tab vs. comma per its own
 * standard heuristic — deliberately not a bespoke parser.
 */
export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    delimiter: '',
    transformHeader: (h) => h.trim(),
    transform: (value) => value.trim(),
  });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

/** Case-insensitive/trimmed header matching. Returns the labels of any required columns missing from the CSV. */
export function validateHeaders(headers: string[], columns: ColumnSpec[]): string[] {
  const normalized = new Set(headers.map((h) => h.toLowerCase().trim()));
  return columns.filter((c) => c.required && !normalized.has(c.key.toLowerCase())).map((c) => c.label);
}

/** Case-insensitive lookup of a raw CSV row's value by column key, regardless of the exact header casing supplied. */
export function getField(raw: Record<string, string>, key: string): string {
  const foundKey = Object.keys(raw).find((k) => k.toLowerCase().trim() === key.toLowerCase());
  return foundKey ? (raw[foundKey] ?? '').trim() : '';
}

/** Builds a downloadable CSV template Blob from a column spec + example rows. */
export function buildCsvTemplate(columns: ColumnSpec[], sampleRows: Record<string, string>[]): Blob {
  const csv = Papa.unparse({
    fields: columns.map((c) => c.key),
    data: sampleRows.map((row) => columns.map((c) => row[c.key] ?? '')),
  });
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}

export function downloadCsvTemplate(filename: string, columns: ColumnSpec[], sampleRows: Record<string, string>[]) {
  const blob = buildCsvTemplate(columns, sampleRows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const TRUE_VALUES = new Set(['true', 'yes', '1']);
const FALSE_VALUES = new Set(['false', 'no', '0', '']);

/** Feature 016 CSV coverage expansion — a shared true/false/blank parser for the several new optional boolean columns (isFeatured, isExhibitor, ...). Blank means "not specified" (ok, defaults handled by the caller); anything else unrecognized is reported as `ok: false` so callers can surface a validation error rather than silently guessing. */
export function parseFlexibleBoolean(value: string): { ok: true; value: boolean | null } | { ok: false } {
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return { ok: true, value: null };
  if (TRUE_VALUES.has(normalized)) return { ok: true, value: true };
  if (FALSE_VALUES.has(normalized)) return { ok: true, value: false };
  return { ok: false };
}

/** Parses a date/time string leniently (accepts "YYYY-MM-DD HH:mm" as well as ISO "YYYY-MM-DDTHH:mm"). Returns null if unparseable. */
export function parseFlexibleDate(value: string): Date | null {
  if (!value.trim()) return null;
  const direct = new Date(value);
  if (!isNaN(direct.getTime())) return direct;
  const withT = new Date(value.replace(' ', 'T'));
  return isNaN(withT.getTime()) ? null : withT;
}

/**
 * Runs async work over a list with a max concurrency, preserving input order
 * in the results. Every current caller (CsvImportModal's row import,
 * members/page.tsx's bulk org-add/team-assign) already treats a per-item
 * failure as partial success — a failed row/member is reported individually,
 * the batch as a whole keeps going — so a worker that *throws* (rather than
 * returning its own failure value) is caught here and routed through
 * onWorkerError instead of rejecting the whole Promise.all, which would
 * otherwise abort every remaining item and leave the caller's loading state
 * stuck with no result. onWorkerError lets each caller produce a same-shaped
 * R representing that one item's failure, exactly as it already does for a
 * non-throwing failure.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onWorkerError: (item: T, index: number, error: unknown) => R
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    try {
      results[index] = await worker(items[index], index);
    } catch (error) {
      console.error('runWithConcurrency: worker threw', error);
      results[index] = onWorkerError(items[index], index, error);
    }
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}
