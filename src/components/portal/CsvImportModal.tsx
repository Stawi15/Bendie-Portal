'use client';

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  type ColumnSpec,
  type RowResult,
  parseCsvText,
  downloadCsv,
  downloadCsvTemplate,
  runWithConcurrency,
} from '@/lib/csvImport';
import {
  type ColumnMapping,
  type ParsedSheet,
  SpreadsheetImportError,
  applyColumnMappings,
  buildCorrectedRows,
  findDuplicateSources,
  needsColumnReview,
  parseSpreadsheetFile,
  suggestColumnMappings,
  unmatchedRequired,
} from '@/lib/spreadsheetImport';
import { knownErrorMessage } from '@/lib/userFacingError';
import { DismissibleTip } from '@/components/portal/DismissibleTip';
import { useConfirm } from '@/contexts/ConfirmContext';

// `notice` (Feature 017): an optional note on a row that WAS imported, e.g. a value the importer had to limit.
type ImportOutcome = { rowIndex: number; success: boolean; error?: string; notice?: string };

/**
 * Feature 020 — opt-in "Replace existing items". Safe replace: the new rows are imported first and the
 * items that existed when the import started (`existingIds`, snapshotted then) are deleted only if every
 * row imported; otherwise everything is kept and the result says so.
 */
export type CsvReplaceOption = {
  existingIds: number[];
  /** Plural noun for the items, e.g. "checklist items". */
  itemLabel: string;
  deleteExisting: (ids: number[]) => Promise<{ deleted?: number; error?: string }>;
};

type ImportMode = 'add' | 'replace';
type ReplaceOutcome = { status: 'replaced'; deleted: number } | { status: 'kept'; reason: 'incomplete' | 'failed'; error?: string } | null;

type CsvImportModalProps<T> = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  title: string;
  templateFilename: string;
  columns: ColumnSpec[];
  sampleRows: Record<string, string>[];
  parseRow: (raw: Record<string, string>, rowIndex: number) => RowResult<T>;
  importRow: (data: T) => Promise<{ error?: string; notice?: string }>;
  /** Optional one-time setup run once with all valid rows before the per-row import loop starts (e.g. batching account creation into a single request). */
  beforeImport?: (validData: T[]) => Promise<void>;
  /** Feature 020 — when given and there are existing items, the preview offers Add (default) / Replace. */
  replaceOption?: CsvReplaceOption;
  /** Feature 021 — cross-row checks after the per-row parse (may add errors, e.g. duplicates across rows). */
  refineResults?: (results: RowResult<T>[]) => RowResult<T>[];
  /** Feature 021 — file-level, non-blocking warnings shown in the preview (e.g. a room over capacity). */
  previewWarnings?: (validData: T[]) => string[];
  /** Feature 021 — grouped import used instead of the per-row loop; returns one outcome per row it handled. */
  importAll?: (validData: T[]) => Promise<{ rowIndex: number; error?: string; notice?: string }[]>;
};

/** Feature 023 adds `sheet` (choose a worksheet) and `map` (match your columns) between pick and preview. */
type Step = 'pick' | 'sheet' | 'map' | 'preview' | 'result';

/** Feature 023 — status chip text and token classes for each column-match state. */
const MATCH_STATUS: Record<ColumnMapping['confidence'], { label: string; className: string }> = {
  exact: { label: 'Matched', className: 'bg-primary/10 text-primary' },
  suggested: { label: 'Suggested', className: 'bg-tertiary-fixed/40 text-on-tertiary-fixed-variant' },
  manual: { label: 'Chosen by you', className: 'bg-surface-container-low text-on-surface' },
  unmapped: { label: 'Not matched', className: 'bg-surface-container-low text-on-surface-variant' },
};

/** `people.csv` → `people`; used to name the corrected-CSV and error-report downloads. */
const fileStem = (filename: string) => filename.replace(/\.csv$/i, '');

/** First non-empty cell of a row, shortened — identifies the row even when blank lines shift numbering. */
function firstValue(raw: Record<string, string> | undefined): string {
  const value = Object.values(raw ?? {}).find((v) => typeof v === 'string' && v.trim());
  if (!value) return '';
  const trimmed = value.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

/**
 * Feature 016 (reliability pass): keep an import error readable. Known technical
 * failures get plain language; other messages (e.g. an API's own "Participant not
 * found") pass through unless they look like raw database text.
 */
function readableImportError(message: string | undefined): string {
  if (!message) return 'This row couldn’t be imported. Check its values and try again.';
  const known = knownErrorMessage(message);
  if (known) return known;
  if (/constraint|relation |column |violates|syntax error|PGRST|JSON/i.test(message)) {
    console.error('[csv import]', message);
    return 'This row couldn’t be imported. Check its values and try again.';
  }
  return message;
}
/** Feature 016 Data Entry UX pass — the two ways a batch of rows can enter this same modal. Both converge on the identical `ParsedCsv` shape immediately, so every downstream step (`parseRow`, preview, `runWithConcurrency` import) is 100% shared, never duplicated per source. */
type SourceMode = 'file' | 'paste';

export function CsvImportModal<T>({
  open,
  onClose,
  onImported,
  title,
  templateFilename,
  columns,
  sampleRows,
  parseRow,
  importRow,
  beforeImport,
  replaceOption,
  refineResults,
  previewWarnings,
  importAll,
}: CsvImportModalProps<T>) {
  const confirm = useConfirm();
  const [step, setStep] = useState<Step>('pick');
  const [sourceMode, setSourceMode] = useState<SourceMode>('file');
  const [pasteText, setPasteText] = useState('');
  const [rawColumns, setRawColumns] = useState<string[]>([]);
  // Feature 023 — the chosen source sheet and its column matches.
  const [reading, setReading] = useState(false);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<Record<string, string>[]>([]);
  const [sourceRowNumbers, setSourceRowNumbers] = useState<number[] | undefined>(undefined);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [usedMapping, setUsedMapping] = useState(false);
  const [results, setResults] = useState<RowResult<T>[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('add');
  const [replaceOutcome, setReplaceOutcome] = useState<ReplaceOutcome>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  /** Returns to the 'pick' step without forgetting which source mode (file vs. paste) the user was already using. */
  const resetToPick = () => {
    setStep('pick');
    setPasteText('');
    setRawColumns([]);
    setReading(false);
    setSheets([]);
    setSelectedSheetIndex(0);
    setSourceHeaders([]);
    setSourceRows([]);
    setSourceRowNumbers(undefined);
    setMappings([]);
    setUsedMapping(false);
    setResults([]);
    setPreparing(false);
    setImporting(false);
    setImportProgress(0);
    setOutcomes([]);
    setImportMode('add');
    setReplaceOutcome(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetToPick();
    setSourceMode('file');
    onClose();
  };

  /**
   * Row number for a parsed row. Excel rows carry their real worksheet row (Feature 023).
   * CSV and pasted rows count the header as row 1 (so the first data row is row 2); the
   * parser skips blank lines, so after an empty spreadsheet row these numbers run ahead of
   * the spreadsheet — flagged rows are therefore also shown with their first value (see
   * `rowLabel`) so they can be found either way.
   */
  const sheetRow = (rowIndex: number) => sourceRowNumbers?.[rowIndex] ?? rowIndex + 2;

  /** Parses rows into the preview. Only reached with every required column present (Feature 023 — the matching step handles missing ones). */
  const applyParsedRows = (headers: string[], rows: Record<string, string>[]) => {
    setRawColumns(headers);
    const parsed = rows.map((raw, i) => parseRow(raw, i));
    setResults(refineResults ? refineResults(parsed) : parsed);
    setStep('preview');
  };

  /**
   * Feature 023 — one entry point for every source (CSV, pasted rows, a worksheet). Files that
   * already match the template go straight to the preview with their rows untouched, exactly as
   * before; anything else goes to the matching step first.
   */
  const startFromSheet = (sheet: ParsedSheet) => {
    const suggested = suggestColumnMappings(sheet.headers, columns);
    setSourceHeaders(sheet.headers);
    setSourceRows(sheet.rows);
    setSourceRowNumbers(sheet.rowNumbers);
    setMappings(suggested);
    if (!needsColumnReview(sheet.headers, columns, suggested)) {
      setUsedMapping(false);
      applyParsedRows(sheet.headers, sheet.rows);
      return;
    }
    setUsedMapping(true);
    setStep('map');
  };

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      const workbook = await parseSpreadsheetFile(file);
      setSheets(workbook.sheets);
      setSelectedSheetIndex(0);
      if (workbook.sheets.length > 1) setStep('sheet');
      else startFromSheet(workbook.sheets[0]);
    } catch (err) {
      if (err instanceof SpreadsheetImportError) {
        toast.error(err.message);
      } else {
        toast.error('We couldn’t read that file. Choose a CSV or Excel (.xlsx) file and try again.');
        console.error(err);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setReading(false);
    }
  };

  const handleParsePastedText = () => {
    if (!pasteText.trim()) return;
    try {
      const { headers, rows } = parseCsvText(pasteText);
      if (rows.length === 0) {
        toast.error('No rows found. Copy the header row (the column names) together with the rows below it.');
        return;
      }
      setSheets([]);
      startFromSheet({ name: 'Pasted rows', headers, rows });
    } catch (err) {
      toast.error('We couldn’t read the pasted rows. Copy them straight from Excel or Google Sheets, including the header row.');
      console.error(err);
    }
  };

  // Feature 023 — matching step.
  const updateMapping = (targetKey: string, sourceHeader: string | null) => {
    setMappings((current) =>
      current.map((m) => (m.targetKey === targetKey ? { ...m, sourceHeader, confidence: sourceHeader ? 'manual' : 'unmapped' } : m))
    );
  };
  const duplicateSources = findDuplicateSources(mappings);
  const missingRequired = unmatchedRequired(columns, mappings);
  const mappingReady = duplicateSources.length === 0 && missingRequired.length === 0;

  const confirmMappings = () => {
    if (!mappingReady) return;
    const rows = applyColumnMappings(sourceRows, mappings, columns);
    const mappedKeys = columns.map((c) => c.key).filter((key) => mappings.find((m) => m.targetKey === key)?.sourceHeader);
    applyParsedRows(mappedKeys, rows);
  };

  const backFromMapping = () => {
    if (sheets.length > 1) setStep('sheet');
    else resetToPick();
  };

  const columnLabel = (key: string) => (usedMapping ? (columns.find((c) => c.key === key)?.label ?? key) : key);

  const rowLabel = (rowIndex: number) => {
    const value = firstValue(results.find((r) => r.rowIndex === rowIndex)?.raw);
    return value ? `Row ${sheetRow(rowIndex)} — ${value}` : `Row ${sheetRow(rowIndex)}`;
  };

  const humanizeRowError = (message: string) =>
    columns.reduce((text, c) => text.replace(new RegExp(`\\b${c.key}\\b`, 'g'), `“${c.label}”`), message);

  const validRows = results.filter((r) => r.errors.length === 0 && r.data !== undefined);
  const invalidRows = results.filter((r) => r.errors.length > 0);
  const fileWarnings = previewWarnings && validRows.length > 0 ? previewWarnings(validRows.map((r) => r.data as T)) : [];

  const existingCount = replaceOption?.existingIds.length ?? 0;
  const canReplace = existingCount > 0;
  const replacing = canReplace && importMode === 'replace';

  const handleImport = async () => {
    // Snapshot now: only items that existed before this import can be removed by it.
    const idsToReplace = replacing && replaceOption ? [...replaceOption.existingIds] : [];
    if (replacing && replaceOption) {
      const ok = await confirm({
        title: `Replace existing ${replaceOption.itemLabel}`,
        message: `Import ${validRows.length} row${validRows.length !== 1 ? 's' : ''} and then delete the ${idsToReplace.length} existing ${replaceOption.itemLabel}? The existing items are only deleted if every row imports — otherwise everything is kept. This cannot be undone.`,
        confirmLabel: 'Import and replace',
        destructive: true,
      });
      if (!ok) return;
    }

    if (beforeImport) {
      setPreparing(true);
      try {
        await beforeImport(validRows.map((r) => r.data as T));
      } catch (err) {
        toast.error('We couldn’t prepare this import. Some rows may not be added — check the results.');
        console.error(err);
      }
      setPreparing(false);
    }

    setImporting(true);
    setImportProgress(0);
    let done = 0;

    let importOutcomes: ImportOutcome[];
    if (importAll) {
      // Feature 021 — grouped import (e.g. several rows describe one breakout room).
      try {
        const results = await importAll(validRows.map((r) => r.data as T));
        const byRow = new Map(results.map((r) => [r.rowIndex, r]));
        importOutcomes = validRows.map((row) => {
          const r = byRow.get(row.rowIndex);
          const error = r ? r.error : 'This row wasn’t imported.';
          return { rowIndex: row.rowIndex, success: !error, error, notice: error ? undefined : r?.notice };
        });
      } catch (err) {
        console.error('[csv import] grouped import failed', err);
        importOutcomes = validRows.map((row) => ({
          rowIndex: row.rowIndex,
          success: false,
          error: err instanceof Error ? err.message : 'Unexpected error during import',
        }));
      }
      setImportProgress(validRows.length);
    } else {
      importOutcomes = await runWithConcurrency(
        validRows,
        5,
        async (row) => {
          const { error, notice } = await importRow(row.data as T);
          done += 1;
          setImportProgress(done);
          return { rowIndex: row.rowIndex, success: !error, error, notice: error ? undefined : notice } as ImportOutcome;
        },
        (row, _index, error) => {
          done += 1;
          setImportProgress(done);
          return {
            rowIndex: row.rowIndex,
            success: false,
            error: error instanceof Error ? error.message : 'Unexpected error during import',
          } as ImportOutcome;
        }
      );
    }

    if (replacing && replaceOption) {
      const allImported = invalidRows.length === 0 && importOutcomes.length > 0 && importOutcomes.every((o) => o.success);
      if (!allImported) {
        setReplaceOutcome({ status: 'kept', reason: 'incomplete' });
      } else {
        try {
          const { deleted, error } = await replaceOption.deleteExisting(idsToReplace);
          setReplaceOutcome(error ? { status: 'kept', reason: 'failed', error } : { status: 'replaced', deleted: deleted ?? idsToReplace.length });
        } catch (err) {
          console.error('[csv import] replace failed', err);
          setReplaceOutcome({ status: 'kept', reason: 'failed' });
        }
      }
    }

    setOutcomes(importOutcomes);
    setImporting(false);
    setStep('result');
    onImported();
  };

  const succeededCount = outcomes.filter((o) => o.success).length;
  const failedDuringImport = outcomes.filter((o) => !o.success);
  const importedWithNotice = outcomes.filter((o) => o.success && o.notice);

  // Feature 023 — both downloads are built in the browser; nothing is sent anywhere.
  const downloadCorrectedCsv = () =>
    downloadCsv(`${fileStem(templateFilename)}-corrected.csv`, columns.map((c) => c.key), buildCorrectedRows(sourceRows, columns, mappings));

  const downloadErrorReport = () =>
    downloadCsv(`${fileStem(templateFilename)}-errors.csv`, ['Row', 'First value', 'Reason'], [
      ...invalidRows.map((r) => ({ Row: String(sheetRow(r.rowIndex)), 'First value': firstValue(r.raw), Reason: r.errors.map(humanizeRowError).join(' ') })),
      ...failedDuringImport.map((o) => ({
        Row: String(sheetRow(o.rowIndex)),
        'First value': firstValue(results.find((r) => r.rowIndex === o.rowIndex)?.raw),
        Reason: readableImportError(o.error),
      })),
    ]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">{title}</h2>

        {step === 'pick' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Import from spreadsheet</p>
              <p className="text-sm text-on-surface-variant mt-0.5">
                Upload an Excel (.xlsx) or CSV file, or paste the rows straight from your spreadsheet.
              </p>
            </div>

            <DismissibleTip id="csv-which-files" title="Which files can I use?" showAgainLabel="Which files can I use?">
              An Excel workbook (<span className="font-medium">.xlsx</span>) or a CSV file. Older <span className="font-medium">.xls</span> files need
              re-saving first: in Excel choose <span className="font-medium">File → Save As → Excel Workbook (.xlsx)</span>. From Google Sheets choose{' '}
              <span className="font-medium">File → Download → Microsoft Excel (.xlsx)</span>. Or skip the file and use{' '}
              <span className="font-medium">Paste from spreadsheet</span>.
            </DismissibleTip>

            <div className="flex gap-1 bg-surface-container-low rounded-xl p-1 w-fit">
              <button
                type="button"
                onClick={() => setSourceMode('file')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sourceMode === 'file' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                Upload file
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('paste')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sourceMode === 'paste' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                Paste from spreadsheet
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
                Your spreadsheet should have these columns
              </p>
              <div className="border border-outline-variant rounded-xl overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                  <thead className="bg-surface-container-low/50">
                    <tr>
                      {columns.map((c) => (
                        <th key={c.key} className="text-left px-3 py-2 font-semibold text-on-surface whitespace-nowrap align-top">
                          <span className="block">{c.label}</span>
                          <span className={`block text-[10px] font-medium ${c.required ? 'text-error' : 'text-on-surface-variant'}`}>
                            {c.required ? 'Required' : 'Optional'}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {sampleRows.map((row, i) => (
                      <tr key={i}>
                        {columns.map((c) => (
                          <td key={c.key} className="px-3 py-2 whitespace-nowrap text-on-surface-variant">
                            {row[c.key] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint mt-1">
                The first row should hold the column names. If yours are named differently, you&apos;ll be asked to match them to the columns above. The example rows show the expected format. Optional columns can be left empty or left out.
              </p>
            </div>

            <button
              type="button"
              onClick={() => downloadCsvTemplate(templateFilename, columns, sampleRows)}
              className="btn-secondary text-sm py-1.5 w-fit"
            >
              <span className="material-symbols-outlined text-[18px]">download</span> Download example spreadsheet (CSV)
            </button>

            {sourceMode === 'file' ? (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  disabled={reading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                  className="block w-full text-sm text-on-surface-variant border border-outline-variant rounded-xl p-3 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-sm file:font-medium disabled:opacity-60"
                />
                {reading && (
                  <p className="text-xs text-on-surface-variant inline-flex items-center gap-1" role="status">
                    <span className="material-symbols-outlined text-[16px] animate-spin" aria-hidden="true">progress_activity</span>
                    Reading file…
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-on-surface-variant">
                  In Excel or Google Sheets, select your rows <span className="font-medium">including the header row</span>, copy them, and paste them here.
                </p>
                <textarea
                  className="input h-40 resize-none font-mono text-xs"
                  placeholder="Select and copy your rows (including the header row) from Excel or Google Sheets, then paste them here…"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                />
                <button type="button" className="btn-primary text-xs py-1.5" onClick={handleParsePastedText} disabled={!pasteText.trim()}>
                  Check pasted rows
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'sheet' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Choose a sheet</p>
              <p className="text-sm text-on-surface-variant mt-0.5">This workbook has {sheets.length} sheets with data. Which one should we import?</p>
            </div>
            <fieldset className="space-y-2">
              <legend className="sr-only">Sheet to import</legend>
              {sheets.map((sheet, index) => (
                <label key={`${sheet.name}-${index}`} className="flex items-center gap-3 rounded-xl border border-outline-variant p-3 cursor-pointer hover:bg-surface-container-low/50">
                  <input
                    type="radio"
                    name="csv-import-sheet"
                    className="accent-primary"
                    checked={selectedSheetIndex === index}
                    onChange={() => setSelectedSheetIndex(index)}
                  />
                  <span className="text-sm text-on-surface font-medium">{sheet.name}</span>
                  <span className="text-xs text-on-surface-variant ml-auto">
                    {sheet.rows.length.toLocaleString()} row{sheet.rows.length !== 1 ? 's' : ''}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary" onClick={resetToPick}>
                Choose a different file
              </button>
              <button className="btn-primary" onClick={() => sheets[selectedSheetIndex] && startFromSheet(sheets[selectedSheetIndex])}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Match your columns</p>
              <p className="text-sm text-on-surface-variant mt-0.5">
                Your column names don&apos;t all match ours. Check each match below, change any that are wrong, then continue. Nothing is imported until
                the next step.
              </p>
            </div>

            <div className="border border-outline-variant rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-surface-container-low/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-on-surface-variant">Our column</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-on-surface-variant">Your column</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-on-surface-variant">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {columns.map((column) => {
                    const mapping = mappings.find((m) => m.targetKey === column.key);
                    const status = MATCH_STATUS[mapping?.confidence ?? 'unmapped'];
                    const isDuplicate = Boolean(mapping?.sourceHeader && duplicateSources.includes(mapping.sourceHeader));
                    const isMissing = Boolean(column.required && !mapping?.sourceHeader);
                    return (
                      <tr key={column.key}>
                        <td className="px-3 py-2 align-top">
                          <span className="block text-on-surface font-medium">{column.label}</span>
                          <span className={`block text-[10px] font-medium ${column.required ? 'text-error' : 'text-on-surface-variant'}`}>
                            {column.required ? 'Required' : 'Optional'}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select
                            className={`input py-1.5 text-sm ${isDuplicate || isMissing ? 'border-error' : ''}`}
                            aria-label={`Your column for ${column.label}`}
                            value={mapping?.sourceHeader ?? ''}
                            onChange={(e) => updateMapping(column.key, e.target.value || null)}
                          >
                            <option value="">— None —</option>
                            {/* T033: a blank heading (e.g. a CSV heading row ending in a comma) isn't offered — it would look like "None". */}
                            {sourceHeaders.filter((header) => header.trim() !== '').map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(missingRequired.length > 0 || duplicateSources.length > 0) && (
              <div className="bg-error/5 border border-error/20 rounded-xl p-4 space-y-1" role="alert">
                {missingRequired.length > 0 && (
                  <>
                    <p className="text-sm font-medium text-error">Choose a column for: {missingRequired.map((c) => c.label).join(', ')}.</p>
                    <p className="text-xs text-on-surface-variant">
                      If your file has no column for {missingRequired.length === 1 ? 'it' : 'them'}, add one to your spreadsheet or download the example
                      spreadsheet and copy your data into it, then try again.
                    </p>
                    <p className="text-xs text-on-surface-variant">Columns we found: {sourceHeaders.filter((header) => header.trim() !== '').join(', ')}.</p>
                  </>
                )}
                {duplicateSources.length > 0 && (
                  <p className="text-sm font-medium text-error">
                    Each column can only be used once: {duplicateSources.map((h) => `“${h}”`).join(', ')} {duplicateSources.length === 1 ? 'is' : 'are'} chosen
                    more than once.
                  </p>
                )}
                {missingRequired.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadCsvTemplate(templateFilename, columns, sampleRows)}
                    className="btn-secondary text-sm py-1.5 w-fit mt-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span> Download example spreadsheet (CSV)
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button className="btn-secondary" onClick={backFromMapping}>
                {sheets.length > 1 ? 'Choose a different sheet' : sourceMode === 'paste' ? 'Start over' : 'Choose a different file'}
              </button>
              <button className="btn-primary" onClick={confirmMappings} disabled={!mappingReady}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-green-800">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">check_circle</span>
                Ready to import: <span className="font-semibold">{validRows.length}</span>
              </span>
              {invalidRows.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-amber-900">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">error</span>
                  Needs attention: <span className="font-semibold">{invalidRows.length}</span>
                </span>
              )}
            </div>
            {invalidRows.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-amber-900 mb-1">
                  These rows won&apos;t be imported. Fix them in your spreadsheet — you can import them afterwards on their own.
                </p>
                <p className="text-[11px] text-amber-900/80 mb-1">
                  {sourceRowNumbers
                    ? 'Row numbers match your worksheet, and each row is also shown with its first value.'
                    : 'Row numbers count your header as row 1 and skip blank lines, so each row is also shown with its first value.'}
                </p>
                <ul className="space-y-0.5 text-xs text-amber-900">
                  {invalidRows.map((r) => (
                    <li key={r.rowIndex}>
                      <span className="font-semibold">{rowLabel(r.rowIndex)}:</span> {r.errors.map(humanizeRowError).join(' ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fileWarnings.length > 0 && (
              <div className="rounded-xl border border-tertiary-container bg-tertiary-fixed/40 p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-on-tertiary-fixed-variant mb-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">warning</span>
                  Check before importing — these won&apos;t stop the import:
                </p>
                <ul className="space-y-0.5 text-xs text-on-tertiary-fixed-variant list-disc pl-4">
                  {fileWarnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}
            {canReplace && replaceOption && (
              <fieldset className="rounded-xl border border-outline-variant p-3 space-y-2">
                <legend className="px-1 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  This event already has {existingCount} {replaceOption.itemLabel}
                </legend>
                <label className="flex items-start gap-2 text-sm text-on-surface cursor-pointer">
                  <input type="radio" name="csv-import-mode" className="mt-0.5 accent-primary" checked={importMode === 'add'} onChange={() => setImportMode('add')} disabled={importing || preparing} />
                  <span>
                    <span className="font-medium">Add to existing items</span>
                    <span className="block text-xs text-on-surface-variant">Keep the current {replaceOption.itemLabel} and add these rows.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-on-surface cursor-pointer">
                  <input type="radio" name="csv-import-mode" className="mt-0.5 accent-primary" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} disabled={importing || preparing} />
                  <span>
                    <span className="font-medium">Replace existing items</span>
                    <span className="block text-xs text-on-surface-variant">
                      Delete the {existingCount} current {replaceOption.itemLabel} once every row has imported. If any row fails, nothing is deleted.
                    </span>
                  </span>
                </label>
                {replacing && invalidRows.length > 0 && (
                  <p className="text-xs text-amber-900">
                    {invalidRows.length} row{invalidRows.length !== 1 ? 's need' : ' needs'} attention, so the existing items will be kept. Fix those rows first to replace.
                  </p>
                )}
              </fieldset>
            )}
            <div className="border border-outline-variant rounded-xl overflow-auto max-h-96">
              <table className="w-full text-xs min-w-[600px]">
                <thead className="bg-surface-container-low/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-on-surface-variant" title="Row number in your spreadsheet (row 1 is the header row)">Row</th>
                    <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">Status</th>
                    {rawColumns.map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-on-surface-variant whitespace-nowrap">
                        {columnLabel(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {results.map((r) => (
                    <tr key={r.rowIndex} className={r.errors.length > 0 ? 'bg-error/5' : ''}>
                      <td className="px-3 py-2 text-on-surface-variant">{sheetRow(r.rowIndex)}</td>
                      <td className="px-3 py-2">
                        {r.errors.length > 0 ? (
                          <span className="text-error inline-flex items-center gap-1" title={r.errors.map(humanizeRowError).join(' ')}>
                            <span className="material-symbols-outlined text-[16px]">error</span> Needs attention
                          </span>
                        ) : (
                          <span className="text-green-700 inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">check_circle</span> Ready
                          </span>
                        )}
                      </td>
                      {rawColumns.map((h) => (
                        <td key={h} className="px-3 py-2 whitespace-nowrap text-on-surface">
                          {r.raw[h] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={downloadCorrectedCsv} className="btn-secondary text-sm py-1.5 w-fit" disabled={importing || preparing}>
              <span className="material-symbols-outlined text-[18px]">download</span> Download corrected CSV
            </button>

            <div className="flex flex-wrap gap-3 pt-2">
              <button className="btn-secondary" onClick={resetToPick}>
                {sourceMode === 'paste' ? 'Start over' : 'Choose a different file'}
              </button>
              {usedMapping && (
                <button className="btn-secondary" onClick={() => setStep('map')} disabled={importing || preparing}>
                  Change column matches
                </button>
              )}
              <button
                className={replacing ? 'btn-danger' : 'btn-primary'}
                onClick={handleImport}
                disabled={validRows.length === 0 || importing || preparing}
              >
                {preparing
                  ? 'Preparing…'
                  : importing
                    ? `Importing… (${importProgress}/${validRows.length})`
                    : `Import ${validRows.length} ready row${validRows.length !== 1 ? 's' : ''}${replacing ? ' and replace' : ''}`}
              </button>
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="space-y-4">
            {/* Feature 016: honest partial-success reporting. The importer can only tell
                added vs. not added (it can't tell a duplicate from any other failure unless the
                server says so), so no duplicate counts are claimed. */}
            {(() => {
              const notImported = invalidRows.length + failedDuringImport.length;
              const tone =
                succeededCount === 0 ? 'border-error/30 bg-error/5 text-error' : notImported > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-800';
              return (
                <div className={`border rounded-xl p-4 ${tone}`} role="status">
                  <p className="text-sm font-semibold">
                    {succeededCount === 0 ? 'Nothing was imported' : notImported > 0 ? 'Import partly complete' : 'Import complete'}
                  </p>
                  <p className="text-sm mt-1">
                    {succeededCount} added{notImported > 0 ? ` · ${notImported} not imported` : ''}.
                  </p>
                  {succeededCount > 0 && notImported > 0 && (
                    <p className="text-xs mt-2">
                      The {succeededCount} added row{succeededCount !== 1 ? 's are' : ' is'} saved. To add the rest, fix the rows listed below and import only those rows —
                      importing the whole file again would add the saved rows a second time.
                    </p>
                  )}
                </div>
              );
            })()}

            {replaceOutcome && replaceOption && (
              <div
                className={`border rounded-xl p-3 text-sm ${replaceOutcome.status === 'replaced' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                role="status"
              >
                {replaceOutcome.status === 'replaced'
                  ? `Replaced: ${replaceOutcome.deleted} previous ${replaceOption.itemLabel} deleted.`
                  : replaceOutcome.reason === 'incomplete'
                    ? `Not every row imported, so the previous ${replaceOption.itemLabel} were kept. Delete them yourself once you're happy with the list.`
                    : `The rows imported, but the previous ${replaceOption.itemLabel} couldn't be deleted${replaceOutcome.error ? ` (${replaceOutcome.error})` : ''}. Use Delete all or delete them one by one.`}
              </div>
            )}

            {(invalidRows.length > 0 || failedDuringImport.length > 0) && (
              <div className="border border-outline-variant rounded-xl overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container-low/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">Row</th>
                      <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">Not imported because</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {invalidRows.map((r) => (
                      <tr key={`invalid-${r.rowIndex}`}>
                        <td className="px-3 py-2 text-on-surface-variant">{rowLabel(r.rowIndex)}</td>
                        <td className="px-3 py-2 text-error">{r.errors.map(humanizeRowError).join(' ')}</td>
                      </tr>
                    ))}
                    {failedDuringImport.map((o) => (
                      <tr key={`failed-${o.rowIndex}`}>
                        <td className="px-3 py-2 text-on-surface-variant">{rowLabel(o.rowIndex)}</td>
                        <td className="px-3 py-2 text-error">{readableImportError(o.error)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(invalidRows.length > 0 || failedDuringImport.length > 0) && (
              <button type="button" onClick={downloadErrorReport} className="btn-secondary text-sm py-1.5 w-fit">
                <span className="material-symbols-outlined text-[18px]">download</span> Download error report
              </button>
            )}

            {importedWithNotice.length > 0 && (
              <div className="border border-outline-variant rounded-xl overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container-low/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">Row</th>
                      <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">Imported, with a note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {importedWithNotice.map((o) => (
                      <tr key={`notice-${o.rowIndex}`}>
                        <td className="px-3 py-2 text-on-surface-variant">{rowLabel(o.rowIndex)}</td>
                        <td className="px-3 py-2 text-on-surface">{o.notice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end">
              <button className="btn-primary" onClick={handleClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {step !== 'result' && (
          <div className="flex justify-end mt-6 pt-4 border-t border-outline-variant">
            <button className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
