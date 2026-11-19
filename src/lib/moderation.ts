import 'server-only';
import { getPortalAdminClient } from '@/lib/orgProductsAdminServer';
import { deactivatePlannerOnRemoval } from '@/lib/plannerRemoval';
import {
  actionAppliesTo,
  normalizeNote,
  statusAfterAction,
  validateRemovalEventIds,
  type ContentType,
  type ModerationAction,
  type ReportStatus,
} from '@/lib/moderationRules';

export { MODERATION_ACTIONS } from '@/lib/moderationRules';
export type { ContentType, ModerationAction, ReportStatus } from '@/lib/moderationRules';

/**
 * Feature 028 — content moderation for `content_reports` (Bendie Events item 13).
 *
 * Every Report and Block in the attendee app lands in `content_reports`, which users
 * can only insert into. Everything here uses the Portal service role, so RLS and the
 * "hide blocked authors" policies never hide a report's content from the reviewer.
 * Callers MUST have run `requirePlatformAdmin()` first (Stawi admins only).
 *
 * `content_reports` has no reviewer columns today. The Bendie team has been asked for
 * `reviewed_by`, `reviewed_at` and `action_note`; until they exist, status changes
 * fall back to writing `status` alone, and reads simply don't show them.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type ReportRow = {
  id: string;
  reporter_id: string;
  content_type: ContentType;
  content_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  /** Present only once the backend adds the reviewer columns. */
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  action_note?: string | null;
};

export type ReportListItem = ReportRow & {
  reporterName: string | null;
  eventId: string | null;
  eventName: string | null;
  /** Short description of what was reported (caption, message snippet or person's name). */
  targetLabel: string | null;
  targetMissing: boolean;
  reviewerName: string | null;
};

export type PersonSummary = { id: string; fullName: string | null; avatarUrl: string | null };
export type PersonEvent = { eventId: string; name: string; status: string | null; role: string };

export type ReportDetail = {
  report: ReportListItem;
  otherReportsAboutTarget: number;
  post?: {
    id: string;
    imageUrl: string | null;
    caption: string | null;
    isHidden: boolean;
    createdAt: string;
    author: PersonSummary | null;
    comments: Array<{ id: string; content: string; isHidden: boolean; createdAt: string; author: PersonSummary | null }>;
  } | null;
  message?: {
    chat: { id: string; isGroup: boolean; title: string | null };
    /** Up to 3 before, the reported message, up to 3 after — in time order. */
    thread: Array<{ id: string; content: string | null; messageType: string; hasImage: boolean; hasAudio: boolean; createdAt: string; sender: PersonSummary | null; isReported: boolean }>;
  } | null;
  profile?: { person: PersonSummary; jobTitle: string | null; organization: string | null; bio: string | null } | null;
  /** The person "Remove from event(s)" applies to, with their current events. */
  removal: { person: PersonSummary; events: PersonEvent[]; preselectedEventId: string | null } | null;
};

export class ModerationError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

const HANDLED: ReportStatus[] = ['reviewed', 'dismissed', 'actioned'];
const MESSAGE_CONTEXT = 3; // spec FR-005

function snippet(text: string | null | undefined, max = 90): string | null {
  if (!text) return null;
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function peopleById(admin: AdminClient, ids: Iterable<string | null | undefined>): Promise<Map<string, PersonSummary>> {
  const unique = [...new Set([...ids].filter((v): v is string => !!v))];
  const map = new Map<string, PersonSummary>();
  if (unique.length === 0) return map;
  const { data, error } = await admin.from('profiles').select('id, full_name, avatar_url').in('id', unique);
  if (error) throw error;
  for (const p of data ?? []) map.set(p.id, { id: p.id, fullName: p.full_name ?? null, avatarUrl: p.avatar_url ?? null });
  return map;
}

async function eventNames(admin: AdminClient, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((v): v is string => !!v))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data, error } = await admin.from('events').select('id, name').in('id', unique);
  if (error) throw error;
  for (const e of data ?? []) map.set(e.id, e.name);
  return map;
}

/** Enriches report rows with names, events and a short target label (batched, not per row). */
async function enrich(admin: AdminClient, rows: ReportRow[]): Promise<ReportListItem[]> {
  const idsOf = (type: ContentType) => rows.filter((r) => r.content_type === type).map((r) => r.content_id);
  const postIds = idsOf('post');
  const messageIds = idsOf('message');

  const [postsRes, messagesRes] = await Promise.all([
    postIds.length ? admin.from('posts').select('id, event_id, caption').in('id', postIds) : Promise.resolve({ data: [], error: null }),
    messageIds.length ? admin.from('messages').select('id, chat_id, content').in('id', messageIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (postsRes.error) throw postsRes.error;
  if (messagesRes.error) throw messagesRes.error;
  const posts = new Map<string, { event_id: string | null; caption: string | null }>((postsRes.data ?? []).map((p: { id: string; event_id: string | null; caption: string | null }) => [p.id, p]));
  const messages = new Map<string, { chat_id: string; content: string | null }>((messagesRes.data ?? []).map((m: { id: string; chat_id: string; content: string | null }) => [m.id, m]));

  const chatIds = [...new Set([...messages.values()].map((m) => m.chat_id))];
  const chats = new Map<string, string | null>();
  if (chatIds.length) {
    const { data, error } = await admin.from('chats').select('id, event_id').in('id', chatIds);
    if (error) throw error;
    for (const c of data ?? []) chats.set(c.id, c.event_id ?? null);
  }

  const eventIdFor = (r: ReportRow): string | null => {
    if (r.content_type === 'post') return posts.get(r.content_id)?.event_id ?? null;
    if (r.content_type === 'message') {
      const m = messages.get(r.content_id);
      return m ? chats.get(m.chat_id) ?? null : null;
    }
    return null;
  };

  const people = await peopleById(admin, [
    ...rows.map((r) => r.reporter_id),
    ...rows.map((r) => r.reviewed_by),
    ...idsOf('profile'),
  ]);
  const names = await eventNames(admin, rows.map(eventIdFor));

  return rows.map((r) => {
    const eventId = eventIdFor(r);
    let targetLabel: string | null = null;
    let targetMissing = false;
    if (r.content_type === 'post') {
      const p = posts.get(r.content_id);
      targetMissing = !p;
      targetLabel = p ? snippet(p.caption) ?? 'Photo without a caption' : null;
    } else if (r.content_type === 'message') {
      const m = messages.get(r.content_id);
      targetMissing = !m;
      targetLabel = m ? snippet(m.content) ?? 'Message without text' : null;
    } else {
      const person = people.get(r.content_id);
      targetMissing = !person;
      targetLabel = person?.fullName ?? (person ? 'Unnamed person' : null);
    }
    return {
      ...r,
      reporterName: people.get(r.reporter_id)?.fullName ?? null,
      eventId,
      eventName: eventId ? names.get(eventId) ?? null : null,
      targetLabel,
      targetMissing,
      reviewerName: r.reviewed_by ? people.get(r.reviewed_by)?.fullName ?? null : null,
    };
  });
}

/** Pending: oldest first (the 24-hour promise). Handled: newest first, capped. */
export async function listReports(view: 'pending' | 'handled'): Promise<ReportListItem[]> {
  const admin = getPortalAdminClient();
  let query = admin.from('content_reports').select('*');
  query = view === 'pending' ? query.eq('status', 'pending').order('created_at', { ascending: true }) : query.in('status', HANDLED).order('created_at', { ascending: false }).limit(200);
  const { data, error } = await query;
  if (error) throw error;
  return enrich(admin, (data ?? []) as ReportRow[]);
}

async function loadReport(admin: AdminClient, reportId: string): Promise<ReportRow> {
  const { data, error } = await admin.from('content_reports').select('*').eq('id', reportId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ModerationError('not_found', 'This report no longer exists.', 404);
  return data as ReportRow;
}

async function personEvents(admin: AdminClient, userId: string): Promise<PersonEvent[]> {
  const { data, error } = await admin.from('event_members').select('event_id, role, events(name, status)').eq('user_id', userId);
  if (error) throw error;
  type Row = { event_id: string; role: string; events: { name: string; status: string | null } | { name: string; status: string | null }[] | null };
  return ((data ?? []) as Row[])
    .map((r) => {
      const e = Array.isArray(r.events) ? r.events[0] : r.events;
      return { eventId: r.event_id, name: e?.name ?? 'Unknown event', status: e?.status ?? null, role: r.role };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadReportDetail(reportId: string): Promise<ReportDetail> {
  const admin = getPortalAdminClient();
  const row = await loadReport(admin, reportId);
  const [report] = await enrich(admin, [row]);

  const { count, error: countError } = await admin
    .from('content_reports')
    .select('id', { count: 'exact', head: true })
    .eq('content_type', row.content_type)
    .eq('content_id', row.content_id)
    .neq('id', row.id);
  if (countError) throw countError;

  const detail: ReportDetail = { report, otherReportsAboutTarget: count ?? 0, removal: null };
  let removalUserId: string | null = null;

  if (row.content_type === 'post') {
    const { data: post, error } = await admin.from('posts').select('id, user_id, image_url, caption, is_hidden, created_at').eq('id', row.content_id).maybeSingle();
    if (error) throw error;
    if (post) {
      const { data: comments, error: cError } = await admin.from('post_comments').select('id, user_id, content, is_hidden, created_at').eq('post_id', post.id).order('created_at', { ascending: true });
      if (cError) throw cError;
      const people = await peopleById(admin, [post.user_id, ...(comments ?? []).map((c: { user_id: string }) => c.user_id)]);
      detail.post = {
        id: post.id,
        imageUrl: post.image_url ?? null,
        caption: post.caption ?? null,
        isHidden: post.is_hidden === true,
        createdAt: post.created_at,
        author: people.get(post.user_id) ?? null,
        comments: (comments ?? []).map((c: { id: string; user_id: string; content: string; is_hidden: boolean | null; created_at: string }) => ({
          id: c.id,
          content: c.content,
          isHidden: c.is_hidden === true,
          createdAt: c.created_at,
          author: people.get(c.user_id) ?? null,
        })),
      };
      removalUserId = post.user_id;
    } else {
      detail.post = null;
    }
  } else if (row.content_type === 'message') {
    const cols = 'id, chat_id, sender_id, message_type, content, image_url, audio_url, created_at';
    const { data: message, error } = await admin.from('messages').select(cols).eq('id', row.content_id).maybeSingle();
    if (error) throw error;
    if (message) {
      const [chatRes, beforeRes, afterRes] = await Promise.all([
        admin.from('chats').select('id, is_group, title').eq('id', message.chat_id).maybeSingle(),
        admin.from('messages').select(cols).eq('chat_id', message.chat_id).lt('created_at', message.created_at).order('created_at', { ascending: false }).limit(MESSAGE_CONTEXT),
        admin.from('messages').select(cols).eq('chat_id', message.chat_id).gt('created_at', message.created_at).order('created_at', { ascending: true }).limit(MESSAGE_CONTEXT),
      ]);
      if (chatRes.error) throw chatRes.error;
      if (beforeRes.error) throw beforeRes.error;
      if (afterRes.error) throw afterRes.error;
      type Msg = { id: string; sender_id: string; message_type: string; content: string | null; image_url: string | null; audio_url: string | null; created_at: string };
      const thread: Msg[] = [...((beforeRes.data ?? []) as Msg[]).reverse(), message as Msg, ...((afterRes.data ?? []) as Msg[])];
      const people = await peopleById(admin, thread.map((m) => m.sender_id));
      detail.message = {
        chat: { id: message.chat_id, isGroup: chatRes.data?.is_group === true, title: chatRes.data?.title ?? null },
        thread: thread.map((m) => ({
          id: m.id,
          content: m.content,
          messageType: String(m.message_type),
          hasImage: !!m.image_url,
          hasAudio: !!m.audio_url,
          createdAt: m.created_at,
          sender: people.get(m.sender_id) ?? null,
          isReported: m.id === message.id,
        })),
      };
      removalUserId = message.sender_id;
    } else {
      detail.message = null;
    }
  } else {
    const { data: person, error } = await admin.from('profiles').select('id, full_name, avatar_url, job_title, organization, bio').eq('id', row.content_id).maybeSingle();
    if (error) throw error;
    detail.profile = person
      ? {
          person: { id: person.id, fullName: person.full_name ?? null, avatarUrl: person.avatar_url ?? null },
          jobTitle: person.job_title ?? null,
          organization: person.organization ?? null,
          bio: person.bio ?? null,
        }
      : null;
    if (person) removalUserId = person.id;
  }

  if (removalUserId) {
    const [people, events] = await Promise.all([peopleById(admin, [removalUserId]), personEvents(admin, removalUserId)]);
    detail.removal = {
      person: people.get(removalUserId) ?? { id: removalUserId, fullName: null, avatarUrl: null },
      events,
      // Spec decision 1: post/message reports pre-select the content's event; profile reports pre-select nothing.
      preselectedEventId: report.eventId && events.some((e) => e.eventId === report.eventId) ? report.eventId : null,
    };
  }
  return detail;
}

/** Unknown-column errors from Postgres (42703) or PostgREST's schema cache (PGRST204). */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

async function setStatus(admin: AdminClient, reportId: string, status: ReportStatus, actorUserId: string, note: string | null): Promise<void> {
  const full = { status, reviewed_by: actorUserId, reviewed_at: new Date().toISOString(), action_note: note };
  const { error } = await admin.from('content_reports').update(full).eq('id', reportId);
  if (!error) return;
  if (!isMissingColumn(error)) throw error;
  // Reviewer columns not added yet (spec decision 2): record the status alone.
  const { error: retryError } = await admin.from('content_reports').update({ status }).eq('id', reportId);
  if (retryError) throw retryError;
}

export type ActionInput = { action: ModerationAction; commentId?: string; eventIds?: string[]; note?: string | null };
export type ActionResult = { status: ReportStatus; removedFromEvents?: number };

export async function applyModerationAction(reportId: string, input: ActionInput, actorUserId: string): Promise<ActionResult> {
  const admin = getPortalAdminClient();
  const report = await loadReport(admin, reportId);
  const note = normalizeNote(input.note);
  const missing = () => new ModerationError('content_missing', 'The reported content no longer exists. Dismiss or mark the report reviewed instead.', 409);
  if (!actionAppliesTo(input.action, report.content_type)) {
    throw new ModerationError('invalid_action', 'That action doesn’t apply to this report.');
  }
  let removedFromEvents: number | undefined;

  switch (input.action) {
    case 'hide_post':
    case 'unhide_post': {
      const { data, error } = await admin.from('posts').update({ is_hidden: input.action === 'hide_post' }).eq('id', report.content_id).select('id');
      if (error) throw error;
      if (!data?.length) throw missing();
      break;
    }
    case 'hide_comment':
    case 'unhide_comment': {
      if (!input.commentId) throw new ModerationError('invalid_request', 'Choose a comment.');
      // The comment must belong to the reported post — never any comment by id.
      const { data, error } = await admin
        .from('post_comments')
        .update({ is_hidden: input.action === 'hide_comment' })
        .eq('id', input.commentId)
        .eq('post_id', report.content_id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new ModerationError('content_missing', 'That comment no longer exists on this post.', 409);
      break;
    }
    case 'delete_message': {
      const { data, error } = await admin.from('messages').delete().eq('id', report.content_id).select('id');
      if (error) throw error;
      if (!data?.length) throw missing();
      break;
    }
    case 'remove_from_events': {
      const detail = await loadReportDetail(reportId);
      if (!detail.removal) throw missing();
      const eventIds = validateRemovalEventIds(input.eventIds, detail.removal.events.map((e) => e.eventId));
      if (eventIds === 'empty') throw new ModerationError('invalid_request', 'Choose at least one event.');
      if (eventIds === 'not_member') throw new ModerationError('invalid_request', 'They’re no longer in one of those events — refresh and try again.', 409);
      const userId = detail.removal.person.id;
      const { data, error } = await admin.from('event_members').delete().eq('user_id', userId).in('event_id', eventIds).select('event_id');
      if (error) throw error;
      removedFromEvents = data?.length ?? 0;
      // Feature 008 side effect, best effort: never blocks or reverses the removal (spec FR-006).
      await Promise.all(
        (data ?? []).map((r: { event_id: string }) =>
          deactivatePlannerOnRemoval(admin, r.event_id, userId, actorUserId).catch((err: unknown) => console.error('moderation: Planner deactivation failed', err))
        )
      );
      break;
    }
    case 'dismiss':
    case 'mark_reviewed':
      break;
    default:
      throw new ModerationError('invalid_action', 'Unknown action.');
  }

  // Un-hiding is an undo, so it leaves the report's status as it was; every other action records one.
  const next = statusAfterAction(input.action);
  if (next) await setStatus(admin, reportId, next, actorUserId, note);
  return { status: next ?? report.status, removedFromEvents };
}
