'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  type ColumnDef,
  type ColumnVisibilityState,
  type SortingState,
  type RowData,
} from '@tanstack/react-table';

/*
 * Feature 031 — Studio 2.0 DataTable (doc 21), a compound, headless table on
 * TanStack Table v9 (sorting + column visibility). Callers pass ALREADY
 * FILTERED data (search and filters are pure domain functions); the table owns
 * sort state, column visibility and rendering.
 *
 * - ≥768px: a semantic <table>; sortable headers are buttons with aria-sort,
 *   cycling ascending → descending → off (back to the data's own order).
 *   One tab stop per row (the row's open button); a click anywhere on the row
 *   also opens it.
 * - <768px: the same rows as a list (no sideways scrolling).
 * - Secondary columns hide when the table area is narrower than 800px
 *   (e.g. 1280px with the inspector docked).
 * - Ties and the "off" state use the data's own order; empty values sort last
 *   in both directions.
 */

const _features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
});

export type DataTableColumn<T> = {
  id: string;
  header: string;
  /** Cell content in the table. */
  cell: (row: T) => React.ReactNode;
  /** Present = sortable. Return '' / null / undefined for "empty" (sorted last). */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Secondary columns hide when the table area is narrow. */
  priority?: 'primary' | 'secondary';
  /** Extra classes for the cells of this column. */
  className?: string;
};

type Ctx<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  visibleColumns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  onOpenRow: (row: T) => void;
  selectedRowId: string | null;
  sorting: SortingState;
  toggleSort: (id: string) => void;
  resetSort: () => void;
  label: string;
  rowLabel: (row: T) => string;
  renderListItem: (row: T) => React.ReactNode;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TableCtx = createContext<Ctx<any> | null>(null);
function useDataTable<T>() {
  const ctx = useContext(TableCtx);
  if (!ctx) throw new Error('DataTable parts must be inside <DataTable.Root>');
  return ctx as Ctx<T>;
}

const NARROW_TABLE_PX = 800;

function normaliseSortValue(v: string | number | null | undefined) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v.trim() === '' ? undefined : v.trim();
  return v;
}

function Root<T extends RowData>({
  data,
  columns,
  getRowId,
  onOpenRow,
  selectedRowId = null,
  label,
  rowLabel,
  renderListItem,
  children,
}: {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  onOpenRow: (row: T) => void;
  selectedRowId?: string | null;
  /** Accessible name of the table, e.g. "Speakers". */
  label: string;
  /** Accessible name of a row's open button, e.g. the speaker's name. */
  rowLabel: (row: T) => string;
  /** How a row looks in list mode (<768px). */
  renderListItem: (row: T) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const wrapRef = useRef<HTMLDivElement>(null);

  // Hide secondary columns when the table area is narrow.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = (width: number) => {
      const narrow = width > 0 && width < NARROW_TABLE_PX;
      setColumnVisibility(
        Object.fromEntries(
          columns.filter((c) => c.priority === 'secondary').map((c) => [c.id, !narrow])
        )
      );
    };
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [columns]);

  const columnDefs = useMemo<ColumnDef<typeof _features, T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        accessorFn: (row: T) => (c.sortValue ? normaliseSortValue(c.sortValue(row)) : undefined),
        enableSorting: !!c.sortValue,
        sortUndefined: 'last' as const,
        sortDescFirst: false,
        sortFn: (a, b) => {
          const av = a.getValue(c.id) as string | number;
          const bv = b.getValue(c.id) as string | number;
          if (typeof av === 'number' && typeof bv === 'number') return av - bv;
          return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
        },
      })),
    [columns]
  );

  const table = useTable<typeof _features, T>({
    features: _features,
    columns: columnDefs,
    data,
    getRowId: (row) => getRowId(row),
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableSortingRemoval: true,
  });

  const rows = table.getRowModel().rows.map((r) => r.original);
  const visibleColumns = columns.filter((c) => columnVisibility[c.id] !== false);

  const value: Ctx<T> = {
    rows,
    columns,
    visibleColumns,
    getRowId,
    onOpenRow,
    selectedRowId,
    sorting,
    toggleSort: (id) => table.getColumn(id)?.toggleSorting(),
    resetSort: () => setSorting([]),
    label,
    rowLabel,
    renderListItem,
  };

  const sortedBy = sorting[0] ? columns.find((c) => c.id === sorting[0].id)?.header : null;
  return (
    <TableCtx.Provider value={value}>
      <div ref={wrapRef} className="min-w-0">
        {children}
        <p className="sr-only" aria-live="polite">
          {`${rows.length} ${rows.length === 1 ? 'row' : 'rows'} shown${sortedBy ? `, sorted by ${sortedBy}, ${sorting[0].desc ? 'descending' : 'ascending'}` : ''}`}
        </p>
      </div>
    </TableCtx.Provider>
  );
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2 mb-3">{children}</div>;
}

function Search({
  value,
  onChange,
  placeholder,
  label = 'Search',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
}) {
  return (
    <label className="relative w-full sm:w-72">
      <span className="sr-only">{label}</span>
      <span
        className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
        aria-hidden="true"
      >
        search
      </span>
      <input
        type="search"
        className="input w-full pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
      {label}
      <select
        className="input text-sm py-2 pr-8 min-w-[9rem]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Reset({
  active,
  onReset,
  children = 'Reset',
}: {
  active: boolean;
  onReset: () => void;
  children?: React.ReactNode;
}) {
  const { resetSort } = useDataTable();
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onReset();
        resetSort();
      }}
      className="h-control px-3 rounded-ui-md text-sm font-medium text-primary hover:bg-primary/5"
    >
      {children}
    </button>
  );
}

function Body<T>() {
  const {
    rows,
    visibleColumns,
    getRowId,
    onOpenRow,
    selectedRowId,
    sorting,
    toggleSort,
    label,
    rowLabel,
    renderListItem,
  } = useDataTable<T>();
  const sortOf = (id: string) => sorting.find((s) => s.id === id);
  return (
    <>
      {/* ≥768px: table */}
      <div className="hidden md:block bg-surface-container-lowest border border-outline-variant rounded-ui-lg shadow-elev-0 overflow-hidden">
        <table className="w-full text-sm" aria-label={label}>
          <thead className="bg-surface-container-low">
            <tr>
              {visibleColumns.map((c) => {
                const s = sortOf(c.id);
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={
                      s ? (s.desc ? 'descending' : 'ascending') : c.sortValue ? 'none' : undefined
                    }
                    className={`text-left text-xs font-semibold text-on-surface-variant px-3 h-row-compact ${c.className ?? ''}`}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className="inline-flex items-center gap-1 rounded-ui-sm hover:text-on-surface"
                      >
                        {c.header}
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                          {s ? (s.desc ? 'arrow_downward' : 'arrow_upward') : 'unfold_more'}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = getRowId(row);
              const selected = id === selectedRowId;
              return (
                <tr
                  key={id}
                  onClick={(e) => {
                    // The open button handles its own click (and Enter/Space).
                    if ((e.target as HTMLElement).closest('button, a, input, select')) return;
                    onOpenRow(row);
                  }}
                  className={`border-t border-outline-variant cursor-pointer transition-colors duration-motion-fast ${
                    selected ? 'bg-primary/5' : 'hover:bg-surface-container-low'
                  }`}
                >
                  {visibleColumns.map((c, i) => (
                    <td key={c.id} className={`px-3 h-row align-middle ${c.className ?? ''}`}>
                      {i === 0 ? (
                        <button
                          type="button"
                          onClick={() => onOpenRow(row)}
                          aria-label={`Open ${rowLabel(row)}`}
                          aria-current={selected ? 'true' : undefined}
                          className="w-full text-left rounded-ui-sm"
                        >
                          {c.cell(row)}
                        </button>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* <768px: list */}
      <ul
        className="md:hidden bg-surface-container-lowest border border-outline-variant rounded-ui-lg divide-y divide-outline-variant overflow-hidden"
        aria-label={label}
      >
        {rows.map((row) => {
          const id = getRowId(row);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onOpenRow(row)}
                aria-label={`Open ${rowLabel(row)}`}
                aria-current={id === selectedRowId ? 'true' : undefined}
                className={`w-full text-left px-3 py-2.5 min-h-row ${id === selectedRowId ? 'bg-primary/5' : 'hover:bg-surface-container-low'}`}
              >
                {renderListItem(row)}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Message({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="text-center py-10 px-4 bg-surface-container-lowest border border-outline-variant rounded-ui-lg">
      <p
        className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-3"
        aria-hidden="true"
      >
        {icon}
      </p>
      <p className="font-medium text-on-surface">{title}</p>
      {children}
    </div>
  );
}

function Empty(props: { icon: string; title: string; children?: React.ReactNode }) {
  return <Message {...props} />;
}

function ErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Message icon="error" title={title}>
      <button type="button" onClick={onRetry} className="btn-secondary mt-4">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          refresh
        </span>{' '}
        Try again
      </button>
    </Message>
  );
}

function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-row bg-surface-container-low rounded-ui-md animate-pulse" />
      ))}
    </div>
  );
}

export const DataTable = {
  Root,
  Toolbar,
  Search,
  Filter,
  Reset,
  Body,
  Empty,
  Error: ErrorState,
  Loading,
};
