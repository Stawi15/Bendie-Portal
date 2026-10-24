import Papa from 'papaparse';
import { parseCsvFile, type ColumnSpec, type ParsedCsv } from './csvImport';

export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 5_000;

export type ParsedSheet = ParsedCsv & { name: string };
export type ParsedWorkbook = { filename: string; sheets: ParsedSheet[] };

export type ColumnMapping = {
  targetKey: string;
  sourceHeader: string | null;
  confidence: 'exact' | 'suggested' | 'unmapped';
};

export class SpreadsheetImportError extends Error {
  constructor(
    public readonly code:
      | 'unsupported'
      | 'legacy_excel'
      | 'too_large'
      | 'empty'
      | 'duplicate_headers'
      | 'too_many_rows'
      | 'unreadable',
    message: string
  ) {
    super(message);
    this.name = 'SpreadsheetImportError';
  }
}

const TOKEN_ALIASES: Record<string, string> = {
  'e-mail': 'email',
  mail: 'email',
  mobile: 'phone',
  telephone: 'phone',
  organisation: 'organization',
  attendee: 'participant',
  attendee_name: 'participant',
  speaker_name: 'speaker',
};

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

function scoreHeader(header: string, column: ColumnSpec): number {
  if (header.trim() === column.key) return 1;
  if (header.trim().toLowerCase() === column.key.toLowerCase()) return 0.97;
  if (header.trim().toLowerCase() === column.label.toLowerCase()) return 0.99;
  if (column.aliases?.some((alias) => header.trim().toLowerCase() === alias.toLowerCase()))
    return 0.98;

  const normalizedHeader = normalizeHeader(header);
  const candidates = [column.key, column.label, ...(column.aliases ?? [])];
  if (candidates.some((candidate) => normalizedHeader === normalizeHeader(candidate))) return 0.96;
  return Math.max(...candidates.map((candidate) => similarity(header, candidate)));
}

export function suggestColumnMappings(headers: string[], columns: ColumnSpec[]): ColumnMapping[] {
  const available = new Set(headers);
  return columns.map((column) => {
    const ranked = [...available]
      .map((header) => ({ header, score: scoreHeader(header, column) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.6) {
      return { targetKey: column.key, sourceHeader: null, confidence: 'unmapped' };
    }
    available.delete(best.header);
    return {
      targetKey: column.key,
      sourceHeader: best.header,
      confidence: best.score === 1 ? 'exact' : 'suggested',
    };
  });
}

export function applyColumnMappings(
  rows: Record<string, string>[],
  mappings: ColumnMapping[]
): Record<string, string>[] {
  return rows.map((row) =>
    Object.fromEntries(
      mappings
        .filter((mapping): mapping is ColumnMapping & { sourceHeader: string } =>
          Boolean(mapping.sourceHeader)
        )
        .map((mapping) => [mapping.targetKey, row[mapping.sourceHeader] ?? ''])
    )
  );
}

function assertUniqueHeaders(headers: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (seen.has(normalized)) duplicates.add(header);
    seen.add(normalized);
  }
  if (duplicates.size > 0) {
    throw new SpreadsheetImportError(
      'duplicate_headers',
      `Rename the duplicate column${duplicates.size === 1 ? '' : 's'} before continuing: ${[...duplicates].join(', ')}.`
    );
  }
}

function assertRows(rows: Record<string, string>[]) {
  if (rows.length === 0) {
    throw new SpreadsheetImportError(
      'empty',
      'No data rows were found. Include a header row and at least one row of data.'
    );
  }
  if (rows.length > MAX_SPREADSHEET_ROWS) {
    throw new SpreadsheetImportError(
      'too_many_rows',
      `This sheet has ${rows.length.toLocaleString()} rows. Split it into files of ${MAX_SPREADSHEET_ROWS.toLocaleString()} rows or fewer.`
    );
  }
}

export function validateSpreadsheetTable(headers: string[], rows: Record<string, string>[]): void {
  assertUniqueHeaders(headers.filter(Boolean));
  assertRows(rows);
}

async function parseCsv(file: File): Promise<ParsedWorkbook> {
  try {
    const parsed = await parseCsvFile(file);
    const headers = parsed.headers.filter(Boolean);
    validateSpreadsheetTable(headers, parsed.rows);
    return { filename: file.name, sheets: [{ name: 'CSV data', headers, rows: parsed.rows }] };
  } catch (error) {
    if (error instanceof SpreadsheetImportError) throw error;
    throw new SpreadsheetImportError(
      'unreadable',
      'We could not read that CSV. Save it again as UTF-8 CSV and retry.'
    );
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const cell = value as { result?: unknown; text?: string; richText?: Array<{ text: string }> };
    if (cell.result !== undefined) return cellText(cell.result);
    if (cell.richText)
      return cell.richText
        .map((part) => part.text)
        .join('')
        .trim();
    if (cell.text) return cell.text.trim();
  }
  return String(value).trim();
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedWorkbook> {
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new SpreadsheetImportError(
      'too_large',
      'This file is larger than 10 MB. Remove unused sheets or split the data, then try again.'
    );
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') return parseCsv(file);
  if (extension === 'xls') {
    throw new SpreadsheetImportError(
      'legacy_excel',
      'Legacy .xls files are not supported. In Excel, save the file as .xlsx or CSV, then try again.'
    );
  }
  if (extension !== 'xlsx') {
    throw new SpreadsheetImportError('unsupported', 'Choose a CSV or Excel (.xlsx) file.');
  }

  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const bytes = new Uint8Array(await file.arrayBuffer());
    await workbook.xlsx.load(bytes as never);

    const sheets: ParsedSheet[] = [];
    workbook.eachSheet((worksheet) => {
      const candidates: Array<{ row: number; values: string[] }> = [];
      for (let rowNumber = 1; rowNumber <= Math.min(25, worksheet.rowCount); rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values = Array.from(
          { length: Math.max(row.cellCount, worksheet.columnCount) },
          (_, index) => cellText(row.getCell(index + 1).value)
        );
        if (values.some(Boolean)) candidates.push({ row: rowNumber, values });
      }
      const headerCandidate =
        candidates.find((candidate) => candidate.values.filter(Boolean).length >= 2) ??
        candidates[0];
      if (!headerCandidate) return;

      const headers = headerCandidate.values.map((value) => value.trim());
      const activeColumns = headers
        .map((header, index) => ({ header, index }))
        .filter((entry) => entry.header.length > 0);
      const activeHeaders = activeColumns.map((entry) => entry.header);
      assertUniqueHeaders(activeHeaders);

      const rows: Record<string, string>[] = [];
      for (
        let rowNumber = headerCandidate.row + 1;
        rowNumber <= worksheet.rowCount;
        rowNumber += 1
      ) {
        const row = worksheet.getRow(rowNumber);
        const record = Object.fromEntries(
          activeColumns.map(({ header, index }) => [header, cellText(row.getCell(index + 1).value)])
        );
        if (Object.values(record).some(Boolean)) rows.push(record);
      }
      if (rows.length > 0) {
        assertRows(rows);
        sheets.push({ name: worksheet.name, headers: activeHeaders, rows });
      }
    });

    if (sheets.length === 0) {
      throw new SpreadsheetImportError(
        'empty',
        'No populated worksheet was found. Add a header row and at least one data row.'
      );
    }
    return { filename: file.name, sheets };
  } catch (error) {
    if (error instanceof SpreadsheetImportError) throw error;
    console.error('[spreadsheet import]', error);
    throw new SpreadsheetImportError(
      'unreadable',
      'We could not open this workbook. If it is password-protected, remove the password or save it as CSV first.'
    );
  }
}

export function downloadCsv(filename: string, headers: string[], rows: Record<string, string>[]) {
  const csv = Papa.unparse({
    fields: headers,
    data: rows.map((row) => headers.map((header) => row[header] ?? '')),
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
