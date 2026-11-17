import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  applyColumnMappings,
  buildCorrectedRows,
  cellText,
  findDuplicateSources,
  needsColumnReview,
  normalizeHeader,
  parseSpreadsheetFile,
  suggestColumnMappings,
  unmatchedRequired,
  type ColumnMapping,
} from './spreadsheetImport';
import type { ColumnSpec } from './csvImport';

const columns: ColumnSpec[] = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'email', label: 'Email address', required: true, aliases: ['E-mail'] },
  { key: 'phone', label: 'Phone number' },
];

const fileFrom = (name: string, bytes: ArrayBuffer | Uint8Array) =>
  ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes }) as unknown as File;

describe('header normalization', () => {
  it('splits camel case and punctuation and folds variants', () => {
    expect(normalizeHeader('FullName')).toBe('full name');
    expect(normalizeHeader('E-mail address')).toBe('email address');
    expect(normalizeHeader('Company / Organisation')).toBe('company organization');
    expect(normalizeHeader('Mobile')).toBe('phone');
  });
});

describe('suggestColumnMappings', () => {
  it('keeps exact template keys exact', () => {
    expect(suggestColumnMappings(['fullName', 'email'], columns).slice(0, 2)).toEqual([
      { targetKey: 'fullName', sourceHeader: 'fullName', confidence: 'exact' },
      { targetKey: 'email', sourceHeader: 'email', confidence: 'exact' },
    ]);
  });

  it('treats a heading that differs only in case or spaces as exact (research R2)', () => {
    const mappings = suggestColumnMappings(['FULLNAME', ' Email '], columns);
    expect(mappings[0]).toEqual({ targetKey: 'fullName', sourceHeader: 'FULLNAME', confidence: 'exact' });
    expect(mappings[1]).toEqual({ targetKey: 'email', sourceHeader: ' Email ', confidence: 'exact' });
  });

  it('suggests label, alias and normalized matches without reusing a source column', () => {
    expect(suggestColumnMappings(['Full Name', 'E-mail', 'Mobile number'], columns)).toEqual([
      { targetKey: 'fullName', sourceHeader: 'Full Name', confidence: 'suggested' },
      { targetKey: 'email', sourceHeader: 'E-mail', confidence: 'suggested' },
      { targetKey: 'phone', sourceHeader: 'Mobile number', confidence: 'suggested' },
    ]);
  });

  it('never lets an earlier field take a heading that is a later field’s key', () => {
    const cols: ColumnSpec[] = [
      { key: 'company_name', label: 'Company name' },
      { key: 'name', label: 'Name', required: true },
    ];
    const mappings = suggestColumnMappings(['name'], cols);
    expect(mappings).toEqual([
      { targetKey: 'company_name', sourceHeader: null, confidence: 'unmapped' },
      { targetKey: 'name', sourceHeader: 'name', confidence: 'exact' },
    ]);
  });

  it('leaves weak resemblances unmatched (FR-010)', () => {
    const cols: ColumnSpec[] = [{ key: 'company_name', label: 'Company name', required: true }];
    // "Name" shares one of two words with "company name": 0.5, below the threshold.
    expect(suggestColumnMappings(['Name'], cols)[0]).toEqual({ targetKey: 'company_name', sourceHeader: null, confidence: 'unmapped' });
  });

  it('suggests each source heading at most once, best match first', () => {
    const cols: ColumnSpec[] = [
      { key: 'phone', label: 'Phone' },
      { key: 'phone_number', label: 'Phone number' },
    ];
    const mappings = suggestColumnMappings(['Phone Number'], cols);
    expect(mappings.filter((m) => m.sourceHeader === 'Phone Number')).toHaveLength(1);
    expect(mappings[1]).toMatchObject({ targetKey: 'phone_number', sourceHeader: 'Phone Number' });
  });
});

describe('needsColumnReview (research R2)', () => {
  const review = (headers: string[]) => needsColumnReview(headers, columns, suggestColumnMappings(headers, columns));

  it('skips the step for the exact template', () => expect(review(['fullName', 'email', 'phone'])).toBe(false));
  it('skips the step when headings differ only in case', () => expect(review(['FULLNAME', 'Email'])).toBe(false));
  it('shows the step when a required key is missing', () => expect(review(['fullName'])).toBe(true));
  it('shows the step when headings are labels', () => expect(review(['Full name', 'Email address'])).toBe(true));
  it('shows the step when an extra heading resembles an unused optional field', () =>
    expect(review(['fullName', 'email', 'Mobile'])).toBe(true));
  it('skips the step when an extra heading resembles nothing (analyze U1)', () =>
    expect(review(['fullName', 'email', 'internal_ref'])).toBe(false));
});

describe('applyColumnMappings (research R3)', () => {
  it('rewrites mapped columns to template keys and passes the rest through', () => {
    const mappings = suggestColumnMappings(['Full Name', 'E-mail', 'breakout_room'], columns);
    expect(applyColumnMappings([{ 'Full Name': 'Amina Noor', 'E-mail': 'amina@example.com', breakout_room: 'Room A' }], mappings, columns)).toEqual([
      { fullName: 'Amina Noor', email: 'amina@example.com', breakout_room: 'Room A' },
    ]);
  });

  it('puts mapped template keys first, in template order, then passed-through columns (T032)', () => {
    const mappings = suggestColumnMappings(['Internal notes', 'E-mail', 'Full Name'], columns);
    const [row] = applyColumnMappings([{ 'Internal notes': 'confirmed', 'E-mail': 'a@x.com', 'Full Name': 'Amina' }], mappings, columns);
    expect(Object.keys(row)).toEqual(['fullName', 'email', 'Internal notes']);
    // The row's first value — used for "Row N — value" labels — is the name, not the notes.
    expect(Object.values(row)[0]).toBe('Amina');
  });

  it('drops a leftover heading equal to a template key so it cannot shadow the mapped value', () => {
    const mappings: ColumnMapping[] = [
      { targetKey: 'fullName', sourceHeader: 'Speaker', confidence: 'manual' },
      { targetKey: 'email', sourceHeader: 'Mail', confidence: 'manual' },
      { targetKey: 'phone', sourceHeader: null, confidence: 'unmapped' },
    ];
    const rows = [{ Speaker: 'Amina', Mail: 'a@x.com', FullName: 'old value' }];
    expect(applyColumnMappings(rows, mappings, columns)).toEqual([{ fullName: 'Amina', email: 'a@x.com' }]);
  });
});

describe('matching-step checks', () => {
  it('finds a source assigned twice', () => {
    expect(
      findDuplicateSources([
        { targetKey: 'fullName', sourceHeader: 'Name', confidence: 'manual' },
        { targetKey: 'email', sourceHeader: 'Name', confidence: 'manual' },
        { targetKey: 'phone', sourceHeader: null, confidence: 'unmapped' },
      ])
    ).toEqual(['Name']);
  });

  it('lists required fields with no source', () => {
    const mappings = suggestColumnMappings(['Full Name'], columns);
    expect(unmatchedRequired(columns, mappings).map((c) => c.key)).toEqual(['email']);
  });

  it('builds corrected rows in template order with blanks for unmatched fields', () => {
    const mappings = suggestColumnMappings(['E-mail', 'Full Name'], columns);
    const corrected = buildCorrectedRows([{ 'E-mail': 'a@x.com', 'Full Name': 'Amina', extra: 'x' }], columns, mappings);
    expect(corrected).toEqual([{ fullName: 'Amina', email: 'a@x.com', phone: '' }]);
    expect(Object.keys(corrected[0])).toEqual(['fullName', 'email', 'phone']);
  });
});

describe('cellText (research R5)', () => {
  it.each([
    ['time-only 09:00', new Date(Date.UTC(1899, 11, 30, 9, 0)), '09:00'],
    ['time-only on the 1899-12-31 epoch', new Date(Date.UTC(1899, 11, 31, 13, 45)), '13:45'],
    ['date at midnight', new Date(Date.UTC(2026, 10, 20)), '2026-11-20'],
    ['date with time', new Date(Date.UTC(2026, 10, 20, 14, 30)), '2026-11-20 14:30'],
    ['formula result date', { formula: 'A1', result: new Date(Date.UTC(2026, 10, 20)) }, '2026-11-20'],
    ['rich text', { richText: [{ text: 'A' }, { text: 'B' }] }, 'AB'],
    ['hyperlink', { text: 'Site', hyperlink: 'https://example.com' }, 'Site'],
    ['error', { error: '#N/A' }, ''],
    ['boolean', true, 'true'],
    ['number', 42, '42'],
    ['null', null, ''],
    ['string with spaces', '  Nairobi ', 'Nairobi'],
  ])('%s', (_label, value, expected) => {
    expect(cellText(value)).toBe(expected);
  });

  it.each([
    ['0%', 0.15, '15%'],
    ['0.0%', 0.125, '12.5%'],
    ['0.00%', 1, '100.00%'],
    ['0%', 0.07, '7%'],
    ['0%;[Red]-0%', -0.2, '-20%'],
  ])('percent format %s: %s → %s (T031)', (numFmt, value, expected) => {
    expect(cellText(value, numFmt)).toBe(expected);
  });

  it('leaves other number formats as the plain number, and % inside quoted text alone', () => {
    expect(cellText(1234.5, '#,##0.00')).toBe('1234.5');
    expect(cellText(42, '0 "%"')).toBe('42');
    expect(cellText({ formula: 'A1/B1', result: 0.5 }, '0%')).toBe('50%');
  });
});

describe('parseSpreadsheetFile', () => {
  it('returns each populated worksheet and skips empty ones', async () => {
    const workbook = new ExcelJS.Workbook();
    const people = workbook.addWorksheet('People');
    people.addRow(['Full Name', 'E-mail']);
    people.addRow(['Amina Noor', 'amina@example.com']);
    workbook.addWorksheet('Empty');
    const travel = workbook.addWorksheet('Travel');
    travel.addRow(['Participant', 'Flight Code']);
    travel.addRow(['Amina Noor', 'KQ100']);
    const parsed = await parseSpreadsheetFile(fileFrom('event-data.xlsx', await workbook.xlsx.writeBuffer()));

    expect(parsed.sheets.map((s) => s.name)).toEqual(['People', 'Travel']);
    expect(parsed.sheets[0].rows[0]).toEqual({ 'Full Name': 'Amina Noor', 'E-mail': 'amina@example.com' });
  });

  it('finds the heading row below a title, skips blank rows and keeps real row numbers (FR-005, R6)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Agenda');
    sheet.addRow(['Speaker list — draft']);
    sheet.addRow([]);
    sheet.addRow(['Session', 'Date', 'Start']);
    sheet.addRow(['Opening', new Date(Date.UTC(2026, 10, 20)), new Date(Date.UTC(1899, 11, 30, 9, 0))]);
    sheet.getCell('C4').numFmt = 'hh:mm';
    sheet.addRow([]);
    sheet.addRow(['Keynote', new Date(Date.UTC(2026, 10, 20)), new Date(Date.UTC(1899, 11, 30, 10, 30))]);
    sheet.getCell('C6').numFmt = 'hh:mm';
    const parsed = await parseSpreadsheetFile(fileFrom('agenda.xlsx', await workbook.xlsx.writeBuffer()));

    const [agenda] = parsed.sheets;
    expect(agenda.headers).toEqual(['Session', 'Date', 'Start']);
    expect(agenda.rows).toEqual([
      { Session: 'Opening', Date: '2026-11-20', Start: '09:00' },
      { Session: 'Keynote', Date: '2026-11-20', Start: '10:30' },
    ]);
    expect(agenda.rowNumbers).toEqual([4, 6]);
  });

  it('ignores a title merged across the top of the sheet (review fix)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Speakers');
    sheet.addRow(['Speaker list 2026']);
    sheet.mergeCells('A1:C1');
    sheet.addRow(['Name', 'Email', 'Company']);
    sheet.addRow(['Amina', 'a@x.com', 'Acme']);
    const parsed = await parseSpreadsheetFile(fileFrom('merged.xlsx', await workbook.xlsx.writeBuffer()));
    expect(parsed.sheets[0].headers).toEqual(['Name', 'Email', 'Company']);
    expect(parsed.sheets[0].rows).toEqual([{ Name: 'Amina', Email: 'a@x.com', Company: 'Acme' }]);
    expect(parsed.sheets[0].rowNumbers).toEqual([3]);
  });

  it('reads a one-column sheet, even when its heading is merged across cells', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');
    sheet.addRow(['Question']);
    sheet.mergeCells('A1:B1');
    sheet.addRow(['What time is lunch?']);
    const parsed = await parseSpreadsheetFile(fileFrom('one.xlsx', await workbook.xlsx.writeBuffer()));
    expect(parsed.sheets[0].headers).toEqual(['Question']);
    expect(parsed.sheets[0].rows).toEqual([{ Question: 'What time is lunch?' }]);
  });

  it('allows two columns that mean the same thing, like Phone and Mobile (review fix)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('People');
    sheet.addRow(['Name', 'Phone', 'Mobile', 'Email', 'E-mail']);
    sheet.addRow(['Amina', '1', '2', 'a@x.com', 'b@x.com']);
    const parsed = await parseSpreadsheetFile(fileFrom('same-meaning.xlsx', await workbook.xlsx.writeBuffer()));
    expect(parsed.sheets[0].headers).toEqual(['Name', 'Phone', 'Mobile', 'Email', 'E-mail']);
    // Each source heading is still suggested at most once.
    const cols: ColumnSpec[] = [{ key: 'phone', label: 'Phone' }];
    expect(suggestColumnMappings(parsed.sheets[0].headers, cols)).toEqual([{ targetKey: 'phone', sourceHeader: 'Phone', confidence: 'exact' }]);
  });

  it('still rejects headings that are the same text, ignoring case', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dupes');
    sheet.addRow(['Name', ' name ']);
    sheet.addRow(['a', 'b']);
    await expect(parseSpreadsheetFile(fileFrom('dupes-case.xlsx', await workbook.xlsx.writeBuffer()))).rejects.toMatchObject({ code: 'duplicate_headers' });
  });

  it('reads percent cells as displayed (T031)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rates');
    sheet.addRow(['Name', 'Rate', 'Score']);
    sheet.addRow(['A', 0.15, 42]);
    sheet.getCell('B2').numFmt = '0%';
    const parsed = await parseSpreadsheetFile(fileFrom('rates.xlsx', await workbook.xlsx.writeBuffer()));
    expect(parsed.sheets[0].rows[0]).toEqual({ Name: 'A', Rate: '15%', Score: '42' });
  });

  it('rejects duplicate Excel headings', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dupes');
    sheet.addRow(['Name', 'Name']);
    sheet.addRow(['a', 'b']);
    await expect(parseSpreadsheetFile(fileFrom('dupes.xlsx', await workbook.xlsx.writeBuffer()))).rejects.toMatchObject({ code: 'duplicate_headers' });
  });

  it('rejects a workbook with no data', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Blank').addRow(['Name', 'Email']);
    await expect(parseSpreadsheetFile(fileFrom('blank.xlsx', await workbook.xlsx.writeBuffer()))).rejects.toMatchObject({ code: 'empty' });
  });

  it('rejects an Excel sheet over 5,000 rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Big');
    sheet.addRow(['Name', 'Email']);
    for (let i = 0; i < 5_001; i += 1) sheet.addRow([`P${i}`, `p${i}@x.com`]);
    await expect(parseSpreadsheetFile(fileFrom('big.xlsx', await workbook.xlsx.writeBuffer()))).rejects.toMatchObject({ code: 'too_many_rows' });
  });

  it('rejects unreadable bytes with a friendly message', async () => {
    await expect(parseSpreadsheetFile(fileFrom('broken.xlsx', new Uint8Array([1, 2, 3])))).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('explains how to handle legacy xls files and rejects other types', async () => {
    await expect(parseSpreadsheetFile({ name: 'legacy.xls', size: 100 } as File)).rejects.toMatchObject({ code: 'legacy_excel' });
    await expect(parseSpreadsheetFile({ name: 'notes.pdf', size: 100 } as File)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('rejects an Excel file over 10 MB before reading it', async () => {
    await expect(parseSpreadsheetFile({ name: 'huge.xlsx', size: 11 * 1024 * 1024 } as File)).rejects.toMatchObject({ code: 'too_large' });
  });
});
