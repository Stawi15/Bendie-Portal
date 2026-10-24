import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  applyColumnMappings,
  normalizeHeader,
  parseSpreadsheetFile,
  suggestColumnMappings,
  validateSpreadsheetTable,
} from './spreadsheetImport';
import type { ColumnSpec } from './csvImport';

const columns: ColumnSpec[] = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'email', label: 'Email address', required: true, aliases: ['E-mail'] },
  { key: 'phone', label: 'Phone number' },
];

describe('spreadsheet column mapping', () => {
  it('normalizes camel case and punctuation', () => {
    expect(normalizeHeader('FullName')).toBe('full name');
    expect(normalizeHeader('E-mail address')).toBe('email address');
  });

  it('keeps exact template keys exact', () => {
    expect(suggestColumnMappings(['fullName', 'email'], columns).slice(0, 2)).toEqual([
      { targetKey: 'fullName', sourceHeader: 'fullName', confidence: 'exact' },
      { targetKey: 'email', sourceHeader: 'email', confidence: 'exact' },
    ]);
  });

  it('asks for confirmation when template key casing is changed', () => {
    expect(suggestColumnMappings(['FULLNAME'], columns)[0]).toEqual({
      targetKey: 'fullName',
      sourceHeader: 'FULLNAME',
      confidence: 'suggested',
    });
  });

  it('suggests label and alias matches without reusing a source column', () => {
    expect(suggestColumnMappings(['Full Name', 'E-mail', 'Mobile'], columns)).toEqual([
      { targetKey: 'fullName', sourceHeader: 'Full Name', confidence: 'suggested' },
      { targetKey: 'email', sourceHeader: 'E-mail', confidence: 'suggested' },
      { targetKey: 'phone', sourceHeader: 'Mobile', confidence: 'suggested' },
    ]);
  });

  it('rewrites rows to canonical template keys', () => {
    const mappings = suggestColumnMappings(['Full Name', 'E-mail'], columns);
    expect(
      applyColumnMappings([{ 'Full Name': 'Amina Noor', 'E-mail': 'amina@example.com' }], mappings)
    ).toEqual([{ fullName: 'Amina Noor', email: 'amina@example.com' }]);
  });

  it('applies the row limit to pasted spreadsheet data too', () => {
    const rows = Array.from({ length: 5_001 }, () => ({ fullName: 'Amina Noor' }));
    expect(() => validateSpreadsheetTable(['fullName'], rows)).toThrow(/5,000 rows or fewer/);
  });
});

describe('Excel workbook parsing', () => {
  it('returns each populated worksheet using its first tabular row as headers', async () => {
    const workbook = new ExcelJS.Workbook();
    const people = workbook.addWorksheet('People');
    people.addRow(['Full Name', 'E-mail']);
    people.addRow(['Amina Noor', 'amina@example.com']);
    const travel = workbook.addWorksheet('Travel');
    travel.addRow(['Participant', 'Flight Code']);
    travel.addRow(['Amina Noor', 'KQ100']);
    const bytes = await workbook.xlsx.writeBuffer();
    const file = {
      name: 'event-data.xlsx',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes,
    } as unknown as File;

    const parsed = await parseSpreadsheetFile(file);

    expect(parsed.sheets.map((sheet) => sheet.name)).toEqual(['People', 'Travel']);
    expect(parsed.sheets[0].rows[0]).toEqual({
      'Full Name': 'Amina Noor',
      'E-mail': 'amina@example.com',
    });
  });

  it('explains how to handle legacy xls files', async () => {
    const file = { name: 'legacy.xls', size: 100 } as File;
    await expect(parseSpreadsheetFile(file)).rejects.toMatchObject({
      code: 'legacy_excel',
    });
  });
});
