import { describe, expect, it } from 'vitest';
import { mergeAiColumnSuggestions, profileSpreadsheetColumns } from './aiSpreadsheetMapping';
import type { ColumnSpec } from './csvImport';
import type { ColumnMapping } from './spreadsheetImport';

const columns: ColumnSpec[] = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'email', label: 'Email address', required: true },
  { key: 'company', label: 'Company' },
];

describe('AI spreadsheet privacy profile', () => {
  it('returns only headings, types, and counts', () => {
    const result = profileSpreadsheetColumns(
      ['Presenter', 'Contact', 'Starts'],
      [
        { Presenter: 'Amina Noor', Contact: 'amina@example.com', Starts: '2026-11-03' },
        { Presenter: 'John Doe', Contact: 'john@example.com', Starts: '2026-11-04' },
      ]
    );

    expect(result).toEqual([
      { sourceHeader: 'Presenter', inferredType: 'text', nonEmptyCount: 2 },
      { sourceHeader: 'Contact', inferredType: 'email', nonEmptyCount: 2 },
      { sourceHeader: 'Starts', inferredType: 'date', nonEmptyCount: 2 },
    ]);
    expect(JSON.stringify(result)).not.toContain('Amina Noor');
    expect(JSON.stringify(result)).not.toContain('amina@example.com');
  });
});

describe('AI spreadsheet mapping merge', () => {
  const current: ColumnMapping[] = [
    { targetKey: 'fullName', sourceHeader: 'fullName', confidence: 'exact' },
    { targetKey: 'email', sourceHeader: null, confidence: 'unmapped' },
    { targetKey: 'company', sourceHeader: 'Organisation', confidence: 'suggested' },
  ];

  it('preserves exact matches and applies allowlisted confident suggestions', () => {
    const merged = mergeAiColumnSuggestions(
      current,
      [
        { sourceHeader: 'Presenter', targetKey: 'fullName', confidence: 0.99, reason: 'Name' },
        { sourceHeader: 'Contact', targetKey: 'email', confidence: 0.94, reason: 'Email' },
        {
          sourceHeader: 'Company / Org',
          targetKey: 'company',
          confidence: 0.88,
          reason: 'Employer',
        },
      ],
      ['fullName', 'Presenter', 'Contact', 'Organisation', 'Company / Org'],
      columns
    );

    expect(merged[0]).toEqual(current[0]);
    expect(merged[1]).toMatchObject({
      sourceHeader: 'Contact',
      origin: 'ai',
      aiConfidence: 0.94,
    });
    expect(merged[2]).toMatchObject({ sourceHeader: 'Company / Org', origin: 'ai' });
  });

  it('rejects low-confidence, unknown, and duplicate-source suggestions', () => {
    const merged = mergeAiColumnSuggestions(
      current,
      [
        { sourceHeader: 'Contact', targetKey: 'email', confidence: 0.4, reason: 'Unsure' },
        { sourceHeader: 'Unknown', targetKey: 'company', confidence: 0.99, reason: 'Invalid' },
        { sourceHeader: 'Organisation', targetKey: 'email', confidence: 0.9, reason: 'First' },
        {
          sourceHeader: 'Organisation',
          targetKey: 'company',
          confidence: 0.8,
          reason: 'Duplicate',
        },
      ],
      ['fullName', 'Contact', 'Organisation'],
      columns
    );

    expect(merged[1]).toMatchObject({ sourceHeader: 'Organisation', origin: 'ai' });
    expect(merged[2]).toEqual({
      targetKey: 'company',
      sourceHeader: null,
      confidence: 'unmapped',
    });
  });

  it('does not overwrite a mapping the user changed while AI was loading', () => {
    const manuallyEdited: ColumnMapping[] = [
      current[0],
      { targetKey: 'email', sourceHeader: 'Contact', confidence: 'suggested', origin: 'manual' },
      current[2],
    ];
    const merged = mergeAiColumnSuggestions(
      manuallyEdited,
      [
        {
          sourceHeader: 'Organisation',
          targetKey: 'email',
          confidence: 0.99,
          reason: 'Model guess',
        },
      ],
      ['fullName', 'Contact', 'Organisation'],
      columns
    );

    expect(merged[1]).toEqual(manuallyEdited[1]);
  });
});
