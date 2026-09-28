'use client';

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  type ColumnSpec,
  type RowResult,
  parseCsvFile,
  parseCsvText,
  validateHeaders,
  downloadCsvTemplate,
  runWithConcurrency,
} from '@/lib/csvImport';
import { knownErrorMessage } from '@/lib/userFacingError';
import { DismissibleTip } from '@/components/portal/DismissibleTip';

type ImportOutcome = { rowIndex: number; success: boolean; error?: string };

type CsvImportModalProps<T> = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  title: string;
  templateFilename: string;
  columns: ColumnSpec[];
  sampleRows: Record<string, string>[];
  parseRow: (raw: Record<string, string>, rowIndex: number) => RowResult<T>;
  importRow: (data: T) => Promise<{ error?: string }>;
  /** Optional one-time setup run once with all valid rows before the per-row import loop starts (e.g. batching account creation into a single request). */
  beforeImport?: (validData: T[]) => Promise<void>;
};

type Step = 'pick' | 'preview' | 'result';

/**
 * Row number for a parsed row, counting the header as row 1 (so the first data row
 * is row 2). The parser skips blank lines, so after an empty spreadsheet row these
 * numbers run ahead of the spreadsheet — flagged rows are therefore also shown with
 * their first value (see `rowLabel`) so they can be found either way.
 */
const sheetRow = (rowIndex: number) => rowIndex + 2;

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
}: CsvImportModalProps<T>) {
  const [step, setStep] = useState<Step>('pick');
  const [sourceMode, setSourceMode] = useState<SourceMode>('file');
  const [pasteText, setPasteText] = useState('');
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [rawColumns, setRawColumns] = useState<string[]>([]);
  const [results, setResults] = useState<RowResult<T>[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  /** Returns to the 'pick' step without forgetting which source mode (file vs. paste) the user was already using. */
  const resetToPick = () => {
    setStep('pick');
    setPasteText('');
    setHeaderErrors([]);
    setRawColumns([]);
    setResults([]);
    setPreparing(false);
    setImporting(false);
    setImportProgress(0);
    setOutcomes([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetToPick();
    setSourceMode('file');
    onClose();
  };

  const applyParsedRows = (headers: string[], rows: Record<string, string>[]) => {
    const missing = validateHeaders(headers, columns);
    if (missing.length > 0) {
      setHeaderErrors(missing);
      setRawColumns(headers);
      setResults([]);
      setStep('preview');
      return;
    }
    setHeaderErrors([]);
    setRawColumns(headers);
    setResults(rows.map((raw, i) => parseRow(raw, i)));
    setStep('preview');
  };

  const handleFile = async (file: File) => {
    try {
      const { headers, rows } = await parseCsvFile(file);
      applyParsedRows(headers, rows);
    } catch (err) {
      toast.error('We couldn’t read that file. Make sure it’s a .csv file (in Excel: File → Save As → CSV; in Google Sheets: File → Download → CSV).');
      console.error(err);
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
      applyParsedRows(headers, rows);
    } catch (err) {
      toast.error('We couldn’t read the pasted rows. Copy them straight from Excel or Google Sheets, including the header row.');
      console.error(err);
    }
  };

  const rowLabel = (rowIndex: number) => {
    const value = firstValue(results.find((r) => r.rowIndex === rowIndex)?.raw);
    return value ? `Row ${sheetRow(rowIndex)} — ${value}` : `Row ${sheetRow(rowIndex)}`;
  };

  const humanizeRowError = (message: string) =>
    columns.reduce((text, c) => text.replace(new RegExp(`\\b${c.key}\\b`, 'g'), `“${c.label}”`), message);

  const validRows = results.filter((r) => r.errors.length === 0 && r.data !== undefined);
  const invalidRows = results.filter((r) => r.errors.length > 0);

  const handleImport = async () => {
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

    const importOutcomes = await runWithConcurrency(
      validRows,
      5,
      async (row) => {
        const { error } = await importRow(row.data as T);
        done += 1;
        setImportProgress(done);
        return { rowIndex: row.rowIndex, success: !error, error } as ImportOutcome;
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

    setOutcomes(importOutcomes);
    setImporting(false);
    setStep('result');
    onImported();
  };

  const succeededCount = outcomes.filter((o) => o.success).length;
  const failedDuringImport = outcomes.filter((o) => !o.success);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">{title}</h2>

        {step === 'pick' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Import from spreadsheet</p>
              <p className="text-sm text-on-surface-variant mt-0.5">
                Upload a CSV file from Excel or Google Sheets, or paste the rows straight from your spreadsheet.
              </p>
            </div>

            <DismissibleTip id="csv-what-is-csv" title="What’s a CSV file?" showAgainLabel="What’s a CSV file?">
              A simple spreadsheet file. In Excel choose <span className="font-medium">File → Save As → CSV</span>; in Google Sheets choose{' '}
              <span className="font-medium">File → Download → Comma-separated values (.csv)</span>. Or skip the file and use{' '}
              <span className="font-medium">Paste from spreadsheet</span>.
            </DismissibleTip>

            <div className="flex gap-1 bg-surface-container-low rounded-xl p-1 w-fit">
              <button
                type="button"
                onClick={() => setSourceMode('file')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sourceMode === 'file' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                Upload CSV file
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
                The first row must be the column names shown above (exactly as written). The example rows show the expected format. Optional columns can be left empty or left out.
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="block w-full text-sm text-on-surface-variant border border-outline-variant rounded-xl p-3 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-sm file:font-medium"
              />
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

        {step === 'preview' && (
          <div className="space-y-4">
            {headerErrors.length > 0 ? (
              <div className="bg-error/5 border border-error/20 rounded-xl p-4">
                <p className="text-sm font-medium text-error">
                  Your spreadsheet is missing the required column{headerErrors.length !== 1 ? 's' : ''}: {headerErrors.join(', ')}
                </p>
                {rawColumns.length > 0 && (
                  <p className="text-xs text-on-surface-variant mt-1">
                    Columns we found: {rawColumns.join(', ')}.
                  </p>
                )}
                <p className="text-xs text-on-surface-variant mt-1">
                  Rename the column in your spreadsheet to match exactly (or download the example spreadsheet and copy your data into it), then try again.
                </p>
              </div>
            ) : (
              <>
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
                    <p className="text-[11px] text-amber-900/80 mb-1">Row numbers count your header as row 1 and skip blank lines, so each row is also shown with its first value.</p>
                    <ul className="space-y-0.5 text-xs text-amber-900">
                      {invalidRows.map((r) => (
                        <li key={r.rowIndex}>
                          <span className="font-semibold">{rowLabel(r.rowIndex)}:</span> {r.errors.map(humanizeRowError).join(' ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="border border-outline-variant rounded-xl overflow-auto max-h-96">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead className="bg-surface-container-low/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-on-surface-variant" title="Row number in your spreadsheet (row 1 is the header row)">Row</th>
                        <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">Status</th>
                        {rawColumns.map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-semibold text-on-surface-variant whitespace-nowrap">
                            {h}
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
              </>
            )}

            <div className="flex gap-3 pt-2">
              <button className="btn-secondary" onClick={resetToPick}>
                {sourceMode === 'paste' ? 'Start over' : 'Choose a different file'}
              </button>
              {headerErrors.length === 0 && (
                <button
                  className="btn-primary"
                  onClick={handleImport}
                  disabled={validRows.length === 0 || importing || preparing}
                >
                  {preparing
                    ? 'Preparing…'
                    : importing
                      ? `Importing… (${importProgress}/${validRows.length})`
                      : `Import ${validRows.length} ready row${validRows.length !== 1 ? 's' : ''}`}
                </button>
              )}
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
