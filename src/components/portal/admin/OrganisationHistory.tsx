'use client';

import { PRODUCT_LABEL, isProductKey } from '@/lib/orgProductsAdmin';

export type HistoryEntry = {
  id: string;
  table_name: string;
  action: string;
  row_id: string | null;
  diff: Record<string, unknown> | null;
  actor_user_id: string | null;
  created_at: string;
};

type Change = { old: unknown; new: unknown };

const productName = (key: unknown) => (isProductKey(key) ? PRODUCT_LABEL[key] : String(key ?? 'A product'));
const changed = (diff: Record<string, unknown> | null, key: string) => (diff?.[key] as Change | undefined) ?? null;

/** Plain-language sentence for one audit entry; null for entries with nothing worth showing. */
export function describeHistoryEntry(entry: HistoryEntry): string | null {
  const diff = entry.diff;
  if (entry.table_name === 'organization_products') {
    const product = productName(entry.row_id);
    if (entry.action === 'INSERT') return diff?.is_active === false ? `${product} added (paused)` : `${product} switched on`;
    const active = changed(diff, 'is_active');
    if (active) return active.new ? `${product} resumed` : `${product} paused`;
    return null;
  }
  if (entry.table_name === 'organization_planner_links') {
    const name = (diff?.planner_organization_name as string | undefined) ?? `Planner organisation #${entry.row_id}`;
    if (entry.action === 'INSERT') return `Connected to Bendie Planner (${name})`;
    const paused = changed(diff, 'planner_app_paused_at');
    if (paused) return paused.new ? 'Planner app access paused' : 'Planner app access resumed';
    return null;
  }
  if (entry.table_name === 'event_products') {
    return `${productName(diff?.product_key)} added to “${(diff?.event_name as string | undefined) ?? 'an event'}”`;
  }
  return null;
}

/** Feature 022 (US5) — product changes for one organisation, newest first. */
export function OrganisationHistory({ entries, names, error }: { entries: HistoryEntry[]; names: Record<string, string>; error: string | null }) {
  const rows = entries.map((e) => ({ entry: e, text: describeHistoryEntry(e) })).filter((r): r is { entry: HistoryEntry; text: string } => r.text !== null);

  return (
    <section className="bg-white border border-outline-variant rounded-[20px] panel-shadow p-5">
      <h2 className="font-semibold text-on-surface mb-3">History</h2>
      {error ? (
        <p className="text-sm text-error">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant italic">No product changes recorded yet.</p>
      ) : (
        <ol className="divide-y divide-outline-variant/40">
          {rows.map(({ entry, text }) => (
            <li key={entry.id} className="py-2 flex flex-wrap items-baseline gap-x-3">
              <span className="text-sm text-on-surface flex-1 min-w-0">{text}</span>
              <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                {entry.actor_user_id ? names[entry.actor_user_id] ?? 'A platform admin' : 'System'} ·{' '}
                {new Date(entry.created_at).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
