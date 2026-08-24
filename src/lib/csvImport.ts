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

/** Parses a date/time string leniently (accepts "YYYY-MM-DD HH:mm" as well as ISO "YYYY-MM-DDTHH:mm"). Returns null if unparseable. */
export function parseFlexibleDate(value: string): Date | null {
  if (!value.trim()) return null;
  const direct = new Date(value);
  if (!isNaN(direct.getTime())) return direct;
  const withT = new Date(value.replace(' ', 'T'));
  return isNaN(withT.getTime()) ? null : withT;
}

/** Runs async work over a list with a max concurrency, preserving input order in the results. */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    results[index] = await worker(items[index], index);
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}
