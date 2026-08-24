'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

type AuditEntry = {
  id: string;
  table_name: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  row_id: string;
  diff: Record<string, unknown> | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

const ACTION_COLORS = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-primary/10 text-primary',
  DELETE: 'bg-error/10 text-error',
};

const PAGE_SIZE = 30;

export default function ActivityLogPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [tableFilter, setTableFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    } else {
      setEntries((data as unknown as AuditEntry[]) ?? []);
      setTotal(count ?? 0);
      if (data) {
        const uniqueTables = Array.from(new Set((data as unknown as AuditEntry[]).map(e => e.table_name)));
        setTables(prev => Array.from(new Set([...prev, ...uniqueTables])));
      }
    }
    setLoading(false);
  }, [eventId, page, tableFilter, actionFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="activity-log" desc="Audit trail of all content changes for this event" />
        <button onClick={fetchData} className="btn-secondary text-xs py-1.5 flex-shrink-0">
          <span className="material-symbols-outlined text-[16px]">refresh</span> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={tableFilter} onChange={e => { setTableFilter(e.target.value); setPage(0); }} className="input w-full sm:w-44 text-sm">
          <option value="all">All Tables</option>
          {tables.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }} className="input w-full sm:w-36 text-sm">
          <option value="all">All Actions</option>
          <option value="INSERT">Insert</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>
        {total > 0 && <span className="self-center text-sm text-on-surface-variant">{total} entries</span>}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">history</p>
          <p className="text-on-surface font-medium">No activity logged yet</p>
          <p className="text-sm text-on-surface-variant mt-1">Changes to event content will appear here once the audit log trigger is set up.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden divide-y divide-outline-variant/30">
            {entries.map(entry => {
              const p = entry.profiles;
              const isExpanded = expandedId === entry.id;
              return (
                <div key={entry.id}>
                  <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-surface-container-low/40 transition text-left" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold flex-shrink-0 ${ACTION_COLORS[entry.action]}`}>
                      {entry.action}
                    </span>
                    <code className="hidden sm:inline-block text-xs text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded flex-shrink-0">{entry.table_name}</code>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {p?.avatar_url && <Avatar name={p.full_name} email={p.email} avatarUrl={p.avatar_url} size={20} />}
                      <span className="text-sm text-on-surface truncate">{p?.full_name ?? p?.email ?? 'Unknown user'}</span>
                    </div>
                    <span className="text-xs text-on-surface-variant/70 flex-shrink-0">
                      <span className="sm:hidden">{formatRelativeTime(entry.created_at)}</span>
                      <span className="hidden sm:inline">
                        {new Date(entry.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px] flex-shrink-0">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 bg-surface-container-low/40 border-t border-outline-variant">
                      <p className="text-xs text-on-surface-variant mb-2 mt-2">Row ID: <code className="bg-surface-container-low px-1 py-0.5 rounded">{entry.row_id}</code></p>
                      {entry.diff ? (
                        <div>
                          <p className="text-xs font-semibold text-on-surface-variant mb-1">Changes:</p>
                          <pre className="text-xs bg-white border border-outline-variant rounded-xl p-3 overflow-x-auto text-on-surface max-h-48">
                            {JSON.stringify(entry.diff, null, 2)}
                          </pre>
                        </div>
                      ) : (
                        <p className="text-xs text-on-surface-variant/70 italic">No diff recorded</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary text-xs py-1.5 disabled:opacity-40">← Previous</button>
              <span className="text-sm text-on-surface-variant">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn-secondary text-xs py-1.5 disabled:opacity-40">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
