'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Avatar } from '@/components/portal/Avatar';
import { EmptyState } from '@/components/portal/EmptyState';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { ModerationAction, ReportDetail, ReportListItem, ReportStatus } from '@/lib/moderation';

/**
 * Feature 028 — content moderation (Bendie Events item 13). Every Report and Block in the
 * attendee app lands here; the app's Terms promise a review within 24 hours. Stawi admins only:
 * the middleware guards /portal/admin/**, this page re-checks, and every route calls
 * requirePlatformAdmin(). All reads and writes go through the service-role routes.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const TYPE_LABEL: Record<string, { label: string; icon: string }> = {
  post: { label: 'Photo post', icon: 'photo_library' },
  message: { label: 'Chat message', icon: 'chat' },
  profile: { label: 'Profile', icon: 'person' },
};

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate',
  impersonation: 'Impersonation',
  other: 'Other',
};

const STATUS_STYLE: Record<ReportStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-tertiary-fixed text-on-tertiary-fixed-variant' },
  actioned: { label: 'Actioned', className: 'bg-primary/10 text-primary' },
  dismissed: { label: 'Dismissed', className: 'bg-surface-container-low text-on-surface-variant' },
  reviewed: { label: 'Reviewed', className: 'bg-surface-container-low text-on-surface-variant' },
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${className}`}>{children}</span>;
}

const isOverdue = (r: ReportListItem) => r.status === 'pending' && Date.now() - new Date(r.created_at).getTime() > DAY_MS;
const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ModerationPage() {
  const { isGlobalAdmin, loading: authLoading } = useAuth();
  const confirm = useConfirm();
  const [view, setView] = useState<'pending' | 'handled'>('pending');
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  // The report whose detail should be on screen: a slower response for a previously
  // selected report is ignored, so actions can never use another report's choices.
  const latestDetailId = useRef<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/moderation?status=${view}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? 'We couldn’t load the reports. Try again.');
      setReports(body.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t load the reports. Try again.');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [view]);

  const loadDetail = useCallback(async (id: string) => {
    latestDetailId.current = id;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/admin/moderation/${id}`);
      const body = await res.json().catch(() => ({}));
      if (latestDetailId.current !== id) return;
      if (!res.ok) throw new Error(body.message ?? 'We couldn’t load this report. Try again.');
      const d = body as ReportDetail;
      setDetail(d);
      setNote('');
      setRemoveIds(new Set(d.removal?.preselectedEventId ? [d.removal.preselectedEventId] : []));
    } catch (err) {
      if (latestDetailId.current !== id) return;
      setDetail(null);
      setDetailError(err instanceof Error ? err.message : 'We couldn’t load this report. Try again.');
    } finally {
      if (latestDetailId.current === id) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isGlobalAdmin) loadList();
  }, [authLoading, isGlobalAdmin, loadList]);

  useEffect(() => {
    // Clear the previous report straight away (review fix): its content, ticked events and
    // note must never be on screen, or sent, while another report is selected.
    setDetail(null);
    setNote('');
    setRemoveIds(new Set());
    if (selectedId) loadDetail(selectedId);
    else latestDetailId.current = null;
  }, [selectedId, loadDetail]);

  const act = async (action: ModerationAction, extra: { commentId?: string; eventIds?: string[] } = {}) => {
    // Only act on the report whose detail is actually shown.
    if (!selectedId || !detail || detail.report.id !== selectedId) return;
    const who = detail.removal?.person.fullName ?? 'this person';
    if (action === 'delete_message') {
      const ok = await confirm({ title: 'Delete this message?', message: 'It is removed from the chat for everyone. This can’t be undone.', confirmLabel: 'Delete message', destructive: true });
      if (!ok) return;
    }
    if (action === 'remove_from_events') {
      const count = extra.eventIds?.length ?? 0;
      const ok = await confirm({
        title: `Remove ${who} from ${count === 1 ? 'this event' : `${count} events`}?`,
        message: `They lose access to ${count === 1 ? 'the event' : 'those events'} in the app, and their Bendie Planner access there is switched off. This isn’t a ban: they could join an open event again with its link.`,
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(action + (extra.commentId ?? ''));
    try {
      const res = await fetch(`/api/admin/moderation/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra, note: note.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.message ?? 'That didn’t work. Try again.');
        return;
      }
      const messages: Partial<Record<ModerationAction, string>> = {
        hide_post: 'Post hidden. Report marked actioned.',
        unhide_post: 'Post visible again.',
        hide_comment: 'Comment hidden. Report marked actioned.',
        unhide_comment: 'Comment visible again.',
        delete_message: 'Message deleted. Report marked actioned.',
        remove_from_events: `Removed from ${body.removedFromEvents ?? 0} event${body.removedFromEvents === 1 ? '' : 's'}. Report marked actioned.`,
        dismiss: 'Report dismissed.',
        mark_reviewed: 'Report marked reviewed.',
      };
      toast.success(messages[action] ?? 'Done.');
      await Promise.all([loadList(), loadDetail(selectedId)]);
    } catch {
      toast.error('That didn’t work — check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  if (!authLoading && !isGlobalAdmin) {
    return <p className="text-on-surface-variant">This area is only available to platform admins.</p>;
  }

  const overdueCount = view === 'pending' ? reports.filter(isOverdue).length : 0;
  const r = detail?.report;
  const isPending = r?.status === 'pending';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Moderation</h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            Reports and blocks from the Bendie app. The app’s terms promise a review within 24 hours.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3" role="tablist" aria-label="Report status">
        {(['pending', 'handled'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => {
              setView(v);
              setSelectedId(null);
            }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${view === v ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}
          >
            {v === 'pending' ? 'Pending' : 'Handled'}
          </button>
        ))}
        {overdueCount > 0 && (
          <Chip className="bg-error/10 text-error">
            <span className="material-symbols-outlined text-[13px]" aria-hidden="true">schedule</span>
            {overdueCount} over 24h
          </Chip>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* List */}
        <div className="lg:col-span-2 min-w-0">
          {loading ? (
            <div className="animate-pulse space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-surface-container-low rounded-xl" />)}</div>
          ) : error ? (
            <div className="text-center py-10 bg-white border border-outline-variant rounded-[20px] panel-shadow">
              <p className="text-on-surface-variant mb-4">{error}</p>
              <button type="button" className="btn-secondary" onClick={loadList}>Try again</button>
            </div>
          ) : reports.length === 0 ? (
            <EmptyState
              icon="verified_user"
              title={view === 'pending' ? 'Nothing waiting for review' : 'No handled reports yet'}
              description={view === 'pending' ? 'New reports and blocks from the Bendie app appear here.' : 'Reports you dismiss, review or act on are listed here.'}
            />
          ) : (
            <ul className="bg-white border border-outline-variant rounded-[20px] panel-shadow divide-y divide-outline-variant/40 overflow-hidden">
              {reports.map((item) => {
                const type = TYPE_LABEL[item.content_type] ?? { label: item.content_type, icon: 'flag' };
                const selected = item.id === selectedId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      aria-current={selected ? 'true' : undefined}
                      className={`w-full text-left px-4 py-3 transition ${selected ? 'bg-primary/5' : 'hover:bg-surface-container-low/60'}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">{type.icon}</span>
                        <span className="text-sm font-semibold text-on-surface">{type.label}</span>
                        <span className="text-xs text-on-surface-variant">· {REASON_LABEL[item.reason] ?? item.reason}</span>
                        {view === 'handled' && <Chip className={STATUS_STYLE[item.status].className}>{STATUS_STYLE[item.status].label}</Chip>}
                        {isOverdue(item) && <Chip className="bg-error/10 text-error">Over 24h</Chip>}
                      </div>
                      <p className="text-sm text-on-surface mt-1 truncate">
                        {item.targetMissing ? <span className="italic text-on-surface-variant">No longer exists</span> : item.targetLabel}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                        {item.eventName ? `${item.eventName} · ` : ''}by {item.reporterName ?? 'Unknown'} · {formatRelativeTime(item.created_at)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3 min-w-0">
          {!selectedId ? (
            reports.length > 0 && <EmptyState icon="flag" title="Choose a report" description="Open a report to see what was reported and decide what to do." />
          ) : detailLoading || (!detail && !detailError) ? (
            <div className="animate-pulse h-64 bg-surface-container-low rounded-[20px]" />
          ) : detailError || !detail || !r ? (
            <div className="text-center py-10 bg-white border border-outline-variant rounded-[20px] panel-shadow">
              <p className="text-on-surface-variant mb-4">{detailError ?? 'We couldn’t load this report.'}</p>
              <button type="button" className="btn-secondary" onClick={() => selectedId && loadDetail(selectedId)}>Try again</button>
            </div>
          ) : (
            <div className="bg-white border border-outline-variant rounded-[20px] panel-shadow p-4 sm:p-5 space-y-4">
              {/* Report header */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">{TYPE_LABEL[r.content_type]?.label ?? r.content_type} reported</h2>
                  <Chip className={STATUS_STYLE[r.status].className}>{STATUS_STYLE[r.status].label}</Chip>
                  {isOverdue(r) && <Chip className="bg-error/10 text-error">Over 24h</Chip>}
                </div>
                <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div><dt className="inline text-on-surface-variant">Reason: </dt><dd className="inline text-on-surface">{REASON_LABEL[r.reason] ?? r.reason}</dd></div>
                  <div><dt className="inline text-on-surface-variant">Reported by: </dt><dd className="inline text-on-surface">{r.reporterName ?? 'Unknown'}</dd></div>
                  <div><dt className="inline text-on-surface-variant">When: </dt><dd className="inline text-on-surface">{formatDateTime(r.created_at)}</dd></div>
                  {r.eventName && <div><dt className="inline text-on-surface-variant">Event: </dt><dd className="inline text-on-surface">{r.eventName}</dd></div>}
                  {r.reviewed_at && (
                    <div className="sm:col-span-2"><dt className="inline text-on-surface-variant">Handled: </dt><dd className="inline text-on-surface">{formatDateTime(r.reviewed_at)}{r.reviewerName ? ` by ${r.reviewerName}` : ''}</dd></div>
                  )}
                </dl>
                {r.details && <p className="mt-2 text-sm text-on-surface bg-surface-container-low rounded-xl px-3 py-2">“{r.details}”</p>}
                {r.action_note && <p className="mt-2 text-sm text-on-surface-variant">Note: {r.action_note}</p>}
                {detail.otherReportsAboutTarget > 0 && (
                  <p className="mt-2 text-xs text-on-surface-variant">
                    {detail.otherReportsAboutTarget} other report{detail.otherReportsAboutTarget === 1 ? '' : 's'} about the same {r.content_type}. Each is handled separately.
                  </p>
                )}
              </div>

              {/* Content */}
              {r.content_type === 'post' && (detail.post ? (
                <section aria-label="Reported post" className="border border-outline-variant rounded-xl p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={detail.post.author?.fullName} avatarUrl={detail.post.author?.avatarUrl} size={28} />
                    <span className="text-sm font-medium text-on-surface">{detail.post.author?.fullName ?? 'Unknown'}</span>
                    <span className="text-xs text-on-surface-variant">· {formatRelativeTime(detail.post.createdAt)}</span>
                    {detail.post.isHidden && <Chip className="bg-surface-container-low text-on-surface-variant">Hidden</Chip>}
                  </div>
                  {detail.post.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.post.imageUrl} alt={detail.post.caption ?? 'Reported photo'} className="max-h-80 w-auto rounded-lg border border-outline-variant" />
                  )}
                  {detail.post.caption && <p className="text-sm text-on-surface">{detail.post.caption}</p>}
                  <div className="flex flex-wrap gap-2">
                    {detail.post.isHidden ? (
                      <button className="btn-secondary" disabled={!!busy} onClick={() => act('unhide_post')}>Show post again</button>
                    ) : (
                      <button className="btn-primary" disabled={!!busy} onClick={() => act('hide_post')}>{busy === 'hide_post' ? 'Hiding…' : 'Hide post'}</button>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-on-surface-variant mb-1">Comments ({detail.post.comments.length})</p>
                    {detail.post.comments.length === 0 ? (
                      <p className="text-xs text-on-surface-variant">No comments.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.post.comments.map((c) => (
                          <li key={c.id} className="flex items-start gap-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-on-surface">{c.author?.fullName ?? 'Unknown'}: </span>
                              <span className={c.isHidden ? 'text-on-surface-variant line-through' : 'text-on-surface'}>{c.content}</span>
                            </div>
                            <button
                              className="text-xs text-secondary hover:opacity-80 font-medium px-2 py-0.5 rounded-lg hover:bg-secondary/5 whitespace-nowrap"
                              disabled={!!busy}
                              onClick={() => act(c.isHidden ? 'unhide_comment' : 'hide_comment', { commentId: c.id })}
                            >
                              {c.isHidden ? 'Show' : 'Hide'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ) : <p className="text-sm italic text-on-surface-variant">This post no longer exists.</p>)}

              {r.content_type === 'message' && (detail.message ? (
                <section aria-label="Reported message" className="border border-outline-variant rounded-xl p-3 space-y-2">
                  <p className="text-xs text-on-surface-variant">
                    {detail.message.chat.isGroup ? `Group chat${detail.message.chat.title ? `: ${detail.message.chat.title}` : ''}` : 'Direct message'} · showing up to 3 messages before and after
                  </p>
                  <ul className="space-y-1.5">
                    {detail.message.thread.map((m) => (
                      <li key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.isReported ? 'bg-error/10 border border-error/30' : 'bg-surface-container-low'}`}>
                        <p className="text-xs text-on-surface-variant">
                          <span className="font-medium text-on-surface">{m.sender?.fullName ?? 'Unknown'}</span> · {formatDateTime(m.createdAt)}
                          {m.isReported && <span className="ml-1 font-semibold text-error">Reported</span>}
                        </p>
                        <p className="text-on-surface whitespace-pre-wrap break-words">
                          {m.content || <span className="italic text-on-surface-variant">{m.hasImage ? 'Photo' : m.hasAudio ? 'Voice message' : `(${m.messageType})`}</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <button className="btn-secondary text-error" disabled={!!busy} onClick={() => act('delete_message')}>
                    {busy === 'delete_message' ? 'Deleting…' : 'Delete message'}
                  </button>
                </section>
              ) : <p className="text-sm italic text-on-surface-variant">This message no longer exists.</p>)}

              {r.content_type === 'profile' && (detail.profile ? (
                <section aria-label="Reported profile" className="border border-outline-variant rounded-xl p-3 flex gap-3">
                  <Avatar name={detail.profile.person.fullName} avatarUrl={detail.profile.person.avatarUrl} size={48} />
                  <div className="min-w-0">
                    <p className="font-medium text-on-surface">{detail.profile.person.fullName ?? 'Unnamed person'}</p>
                    {(detail.profile.jobTitle || detail.profile.organization) && (
                      <p className="text-sm text-on-surface-variant">{[detail.profile.jobTitle, detail.profile.organization].filter(Boolean).join(' · ')}</p>
                    )}
                    {detail.profile.bio && <p className="text-sm text-on-surface mt-1 whitespace-pre-wrap">{detail.profile.bio}</p>}
                  </div>
                </section>
              ) : <p className="text-sm italic text-on-surface-variant">This account no longer exists.</p>)}

              {/* Remove from events */}
              {detail.removal && (
                <section aria-label="Remove from events" className="border border-outline-variant rounded-xl p-3">
                  <p className="text-sm font-medium text-on-surface">Remove {detail.removal.person.fullName ?? 'this person'} from events</p>
                  {detail.removal.events.length === 0 ? (
                    <p className="text-xs text-on-surface-variant mt-1">They aren’t in any events.</p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-1">
                        {detail.removal.events.map((e) => (
                          <li key={e.eventId}>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-primary"
                                checked={removeIds.has(e.eventId)}
                                onChange={(ev) =>
                                  setRemoveIds((prev) => {
                                    const next = new Set(prev);
                                    if (ev.target.checked) next.add(e.eventId);
                                    else next.delete(e.eventId);
                                    return next;
                                  })
                                }
                              />
                              <span className="text-on-surface">{e.name}</span>
                              <span className="text-xs text-on-surface-variant">· {e.role}{e.status ? ` · ${e.status}` : ''}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <button
                        className="btn-secondary text-error mt-2"
                        disabled={!!busy || removeIds.size === 0}
                        onClick={() => act('remove_from_events', { eventIds: [...removeIds] })}
                      >
                        {busy === 'remove_from_events' ? 'Removing…' : removeIds.size > 1 ? `Remove from ${removeIds.size} events` : 'Remove from event'}
                      </button>
                    </>
                  )}
                </section>
              )}

              {/* Decision */}
              <div className="border-t border-outline-variant pt-3 space-y-2">
                <label className="label" htmlFor="moderation-note">Note (optional)</label>
                <input
                  id="moderation-note"
                  className="input w-full"
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why you dismissed or acted — saved with the report once the backend supports it"
                />
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" disabled={!!busy || r.status === 'dismissed'} onClick={() => act('dismiss')}>
                    {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
                  </button>
                  {isPending && (
                    <button className="btn-secondary" disabled={!!busy} onClick={() => act('mark_reviewed')}>
                      {busy === 'mark_reviewed' ? 'Saving…' : 'Mark reviewed (no action)'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
