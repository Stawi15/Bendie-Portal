'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import {
  type AuditEntry,
  type AuditAction,
  TABLE_AREA_LABELS,
  friendlyArea,
  describeAction,
  extractHeadline,
  extractSubjectId,
  tableHasSubject,
  summarizeChanges,
} from '@/lib/activityPresentation';

const ACTION_FILTER_LABELS: Record<AuditAction | 'all', string> = {
  all: 'All Actions',
  INSERT: 'Added',
  UPDATE: 'Updated',
  DELETE: 'Removed',
};

const PAGE_SIZE = 30;

export default function ActivityLogPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { isGlobalAdmin } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [tableFilter, setTableFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [technicalOpenId, setTechnicalOpenId] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('event_content_audit_log')
      .select('id,table_name,action,row_id,diff,created_at,profiles:actor_user_id(full_name,email,avatar_url)', { count: 'exact' })
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (tableFilter !== 'all') query = query.eq('table_name', tableFilter);
    if (actionFilter !== 'all') query = query.eq('action', actionFilter);

    const { data, error, count } = await query;
    if (error) {
      // Audit log table might not exist yet — show empty state gracefully
      if (error.code !== 'PGRST116' && error.code !== 'PGRST205') console.error(error);
      setEntries([]);
      setSubjectNames({});
    } else {
      const rows = (data as unknown as AuditEntry[]) ?? [];
      setEntries(rows);
      setTotal(count ?? 0);
      if (data) {
        const uniqueTables = Array.from(new Set(rows.map((e) => e.table_name)));
        setTables((prev) => Array.from(new Set([...prev, ...uniqueTables])));
      }

      const subjectIds = Array.from(
        new Set(rows.filter((e) => tableHasSubject(e.table_name)).map((e) => extractSubjectId(e)).filter((id): id is string => !!id))
      );
      if (subjectIds.length > 0) {
        const { data: profileRows } = await supabase.from('profiles').select('id, full_name, email').in('id', subjectIds);
        const map: Record<string, string> = {};
        for (const p of (profileRows as { id: string; full_name: string | null; email: string | null }[]) ?? []) {
          map[p.id] = p.full_name ?? p.email ?? 'Unknown person';
        }
        setSubjectNames(map);
      } else {
        setSubjectNames({});
      }
    }
    setLoading(false);
  }, [eventId, page, tableFilter, actionFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="activity-log" desc="Who did what, and when, for this event" />
        <button onClick={fetchData} className="btn-secondary text-xs py-1.5 flex-shrink-0">
          <span className="material-symbols-outlined text-[16px]">refresh</span> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <select value={tableFilter} onChange={(e) => { setTableFilter(e.target.value); setPage(0); }} className="input w-full sm:w-48 text-sm">
          <option value="all">All Areas</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {TABLE_AREA_LABELS[t] ?? friendlyArea(t)}
            </option>
          ))}
        </select>
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(0); }} className="input w-full sm:w-36 text-sm">
          {(['all', 'INSERT', 'UPDATE', 'DELETE'] as const).map((a) => (
            <option key={a} value={a}>
              {ACTION_FILTER_LABELS[a]}
            </option>
          ))}
        </select>
        {total > 0 && <span className="self-center text-sm text-on-surface-variant">{total} entries</span>}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">history</p>
          <p className="text-on-surface font-medium">No activity logged yet</p>
          <p className="text-sm text-on-surface-variant mt-1">Changes to event content will appear here once the audit log trigger is set up.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden divide-y divide-outline-variant/30">
            {entries.map((entry) => {
              const p = entry.profiles;
              const isExpanded = expandedId === entry.id;
              const actorName = p?.full_name ?? p?.email ?? 'Someone';
              const subjectName = tableHasSubject(entry.table_name) ? subjectNames[extractSubjectId(entry) ?? ''] : undefined;
              const actionLine = describeAction(entry, subjectName);
              const headline = extractHeadline(entry);
              const changes = isExpanded ? summarizeChanges(entry) : [];
              const showTechnical = technicalOpenId === entry.id;

              return (
                <div key={entry.id}>
                  <button
                    className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-surface-container-low/40 transition text-left"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <Avatar name={p?.full_name} email={p?.email} avatarUrl={p?.avatar_url} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface">
                        <span className="font-semibold">{actorName}</span> {actionLine}
                      </p>
                      {headline && <p className="text-sm text-on-surface-variant truncate mt-0.5">{headline}</p>}
                      <p className="text-xs text-on-surface-variant/70 mt-1">
                        {friendlyArea(entry.table_name)} ·{' '}
                        <span className="sm:hidden">{formatRelativeTime(entry.created_at)}</span>
                        <span className="hidden sm:inline">
                          {new Date(entry.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px] flex-shrink-0 mt-1">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 pl-16 bg-surface-container-low/40 border-t border-outline-variant">
                      {changes.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Changes</p>
                          {changes.map((c) => (
                            <div key={c.field} className="text-sm">
                              <p className="text-on-surface-variant text-xs">{c.label}</p>
                              <p className="text-on-surface">
                                {c.from ? (
                                  <>
                                    {c.from} <span className="text-on-surface-variant">→</span> {c.to}
                                  </>
                                ) : (
                                  c.to
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-on-surface-variant/70 italic mt-3">No further details recorded.</p>
                      )}

                      {isGlobalAdmin && entry.diff && (
                        <div className="mt-3 pt-3 border-t border-outline-variant/50">
                          <button
                            type="button"
                            onClick={() => setTechnicalOpenId(showTechnical ? null : entry.id)}
                            className="text-xs font-semibold text-on-surface-variant hover:text-on-surface flex items-center gap-1"
                          >
                            Technical details
                            <span className="material-symbols-outlined text-[16px]">{showTechnical ? 'expand_less' : 'expand_more'}</span>
                          </button>
                          {showTechnical && (
                            <pre className="text-xs bg-white border border-outline-variant rounded-xl p-3 overflow-x-auto text-on-surface max-h-48 mt-2">
                              {JSON.stringify({ table: entry.table_name, action: entry.action, row_id: entry.row_id, diff: entry.diff }, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary text-xs py-1.5 disabled:opacity-40">← Previous</button>
              <span className="text-sm text-on-surface-variant">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn-secondary text-xs py-1.5 disabled:opacity-40">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
