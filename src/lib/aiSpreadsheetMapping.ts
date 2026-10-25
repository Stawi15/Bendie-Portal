import type { ColumnSpec } from './csvImport';
import type { ColumnMapping } from './spreadsheetImport';

export type SpreadsheetColumnKind =
  'empty' | 'boolean' | 'number' | 'date' | 'email' | 'url' | 'text' | 'mixed';

export type SpreadsheetColumnProfile = {
  sourceHeader: string;
  inferredType: SpreadsheetColumnKind;
  nonEmptyCount: number;
};

export type AiColumnSuggestion = {
  sourceHeader: string;
  targetKey: string;
  confidence: number;
  reason: string;
};

const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', 'y', 'n']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMBER_RE = /^[-+]?\d+(?:[.,]\d+)?$/;
const DATE_RE =
  /^\d{4}-\d{1,2}-\d{1,2}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?)?$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/i;

function valueKind(value: string): Exclude<SpreadsheetColumnKind, 'empty' | 'mixed'> {
  const normalized = value.trim().toLowerCase();
  if (BOOLEAN_VALUES.has(normalized)) return 'boolean';
  if (EMAIL_RE.test(normalized)) return 'email';
  if (/^https?:\/\//i.test(normalized)) return 'url';
  if (NUMBER_RE.test(normalized)) return 'number';
  if (DATE_RE.test(normalized)) return 'date';
  return 'text';
}

/**
 * Produces useful semantic hints without retaining or transmitting cell values.
 * At most 50 populated values per column are inspected locally in the browser.
 */
export function profileSpreadsheetColumns(
  headers: string[],
  rows: Record<string, string>[]
): SpreadsheetColumnProfile[] {
  return headers.map((sourceHeader) => {
    const values = rows
      .map((row) => row[sourceHeader]?.trim() ?? '')
      .filter(Boolean)
      .slice(0, 50);
    if (values.length === 0) return { sourceHeader, inferredType: 'empty', nonEmptyCount: 0 };

    const kinds = new Set(values.map(valueKind));
    return {
      sourceHeader,
      inferredType: kinds.size === 1 ? [...kinds][0] : 'mixed',
      nonEmptyCount: values.length,
    };
  });
}

/**
 * Applies allowlisted model suggestions without replacing exact deterministic
 * matches or assigning one source column twice. Low-confidence suggestions stay
 * manual rather than being preselected.
 */
export function mergeAiColumnSuggestions(
  current: ColumnMapping[],
  suggestions: AiColumnSuggestion[],
  headers: string[],
  columns: ColumnSpec[],
  minimumConfidence = 0.6
): ColumnMapping[] {
  const allowedHeaders = new Set(headers);
  const allowedTargets = new Set(columns.map((column) => column.key));
  const reservedSources = new Set(
    current
      .filter((mapping) => mapping.confidence === 'exact' && mapping.sourceHeader)
      .map((mapping) => mapping.sourceHeader as string)
  );
  const exactTargets = new Set(
    current
      .filter((mapping) => mapping.confidence === 'exact' || mapping.origin === 'manual')
      .map((mapping) => mapping.targetKey)
  );

  const accepted = new Map<string, AiColumnSuggestion>();
  for (const suggestion of [...suggestions].sort((a, b) => b.confidence - a.confidence)) {
    if (
      suggestion.confidence < minimumConfidence ||
      suggestion.confidence > 1 ||
      !allowedHeaders.has(suggestion.sourceHeader) ||
      !allowedTargets.has(suggestion.targetKey) ||
      exactTargets.has(suggestion.targetKey) ||
      reservedSources.has(suggestion.sourceHeader) ||
      accepted.has(suggestion.targetKey)
    ) {
      continue;
    }
    accepted.set(suggestion.targetKey, suggestion);
    reservedSources.add(suggestion.sourceHeader);
  }

  return current.map((mapping) => {
    if (mapping.confidence === 'exact' || mapping.origin === 'manual') return mapping;
    const suggestion = accepted.get(mapping.targetKey);
    if (!suggestion) {
      const sourceWasReassigned =
        mapping.sourceHeader &&
        [...accepted.values()].some(
          (acceptedSuggestion) => acceptedSuggestion.sourceHeader === mapping.sourceHeader
        );
      return sourceWasReassigned
        ? { targetKey: mapping.targetKey, sourceHeader: null, confidence: 'unmapped' }
        : mapping;
    }
    return {
      ...mapping,
      sourceHeader: suggestion.sourceHeader,
      confidence: 'suggested',
      origin: 'ai',
      aiConfidence: suggestion.confidence,
      aiReason: suggestion.reason,
    };
  });
}
