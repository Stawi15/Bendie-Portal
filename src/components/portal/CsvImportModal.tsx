'use client';

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  type ColumnSpec,
  type RowResult,
  parseCsvFile,
  validateHeaders,
  downloadCsvTemplate,
  runWithConcurrency,
} from '@/lib/csvImport';

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
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [rawColumns, setRawColumns] = useState<string[]>([]);
  const [results, setResults] = useState<RowResult<T>[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setStep('pick');
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
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    try {
      const { headers, rows } = await parseCsvFile(file);
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
    } catch (err) {
      toast.error('Failed to read CSV file');
      console.error(err);
    }
  };

  const validRows = results.filter((r) => r.errors.length === 0 && r.data !== undefined);
  const invalidRows = results.filter((r) => r.errors.length > 0);

  const handleImport = async () => {
    if (beforeImport) {
      setPreparing(true);
      try {
        await beforeImport(validRows.map((r) => r.data as T));
      } catch (err) {
        toast.error('Failed to prepare import');
        console.error(err);
      }
      setPreparing(false);
    }

    setImporting(true);
    setImportProgress(0);
    let done = 0;

    const importOutcomes = await runWithConcurrency(validRows, 5, async (row) => {
      const { error } = await importRow(row.data as T);
      done += 1;
      setImportProgress(done);
      return { rowIndex: row.rowIndex, success: !error, error } as ImportOutcome;
    });

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
            <p className="hint">
              Upload a CSV file. Required columns: {columns.filter((c) => c.required).map((c) => c.label).join(', ')}.
            </p>

            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
                Expected Format
              </p>
              <div className="border border-outline-variant rounded-xl overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                  <thead className="bg-surface-container-low/50">
                    <tr>
                      {columns.map((c) => (
                        <th key={c.key} className="text-left px-3 py-2 font-semibold text-on-surface whitespace-nowrap">
                          {c.label}
                          {c.required && <span className="text-error"> *</span>}
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
              <p className="hint mt-1">* required column. Your CSV&apos;s header row must include these exact column names.</p>
            </div>

            <button
              type="button"
              onClick={() => downloadCsvTemplate(templateFilename, columns, sampleRows)}
              className="text-sm text-primary hover:opacity-80 font-medium flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">download</span> Download as CSV File
            </button>
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
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {headerErrors.length > 0 ? (
              <div className="bg-error/5 border border-error/20 rounded-xl p-4">
                <p className="text-sm font-medium text-error">
                  This CSV is missing required column{headerErrors.length !== 1 ? 's' : ''}: {headerErrors.join(', ')}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  Download the template above, match its headers exactly, and re-upload.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-on-surface">
                  <span className="font-semibold text-primary">{validRows.length} valid</span>
                  {invalidRows.length > 0 && (
                    <span className="text-on-surface-variant">
                      {' '}
                      · <span className="font-semibold text-error">{invalidRows.length} will be skipped</span>
                    </span>
                  )}
                </p>
                <div className="border border-outline-variant rounded-xl overflow-auto max-h-96">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead className="bg-surface-container-low/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">#</th>
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
                          <td className="px-3 py-2 text-on-surface-variant">{r.rowIndex + 1}</td>
                          <td className="px-3 py-2">
                            {r.errors.length > 0 ? (
                              <span className="text-error inline-flex items-center gap-1" title={r.errors.join('; ')}>
                                <span className="material-symbols-outlined text-[16px]">cancel</span> {r.errors[0]}
                              </span>
                            ) : (
                              <span className="text-green-700 inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-[16px]">check_circle</span> Valid
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
              <button className="btn-secondary" onClick={reset}>
                Choose a Different File
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
                      : `Import ${validRows.length} Row${validRows.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-medium text-green-800">
                Imported {succeededCount} of {validRows.length} row{validRows.length !== 1 ? 's' : ''}.
              </p>
            </div>

            {(invalidRows.length > 0 || failedDuringImport.length > 0) && (
              <div className="border border-outline-variant rounded-xl overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container-low/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">Row</th>
                      <th className="text-left px-3 py-2 font-semibold text-on-surface-variant">Reason Skipped</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {invalidRows.map((r) => (
                      <tr key={`invalid-${r.rowIndex}`}>
                        <td className="px-3 py-2 text-on-surface-variant">{r.rowIndex + 1}</td>
                        <td className="px-3 py-2 text-error">{r.errors.join('; ')}</td>
                      </tr>
                    ))}
                    {failedDuringImport.map((o) => (
                      <tr key={`failed-${o.rowIndex}`}>
                        <td className="px-3 py-2 text-on-surface-variant">{o.rowIndex + 1}</td>
                        <td className="px-3 py-2 text-error">{o.error ?? 'Failed to import'}</td>
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
