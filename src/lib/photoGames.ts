/**
 * Interactives photo games (Human Bingo, Connects): portal-side content rules
 * and reads/writes. Feature 032. The backend is the Bendie Events app's
 * (docs/bendie-events-backend-changes.md §6); the portal only edits CONTENT:
 *   - `photo_game_library`  master rows (Stawi admins, RLS)
 *   - `photo_game_prompts`  an event's own copy (hosts/organisers, org admins, Stawi admins, RLS)
 * It never writes play data (`photo_game_entries`, `connect_hands`, `game_points`,
 * `event_members.player_number`). Rows are never deleted and ids never change:
 * switch a row off instead (action item 15).
 *
 * Every function takes the caller's Supabase client (runs under their RLS).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type PhotoGame = 'human_bingo' | 'connect';
export const PHOTO_GAMES: PhotoGame[] = ['human_bingo', 'connect'];
export const PHOTO_GAME_LABELS: Record<PhotoGame, string> = {
  human_bingo: 'Human Bingo',
  connect: 'Connects',
};

/** The Bingo board is the first 15 active prompts (fixed in the backend). */
export const BINGO_BOARD_SIZE = 15;
export const PROMPT_MAX = 300;
export const QUESTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type PhotoGameRow = {
  game: PhotoGame;
  question_id: string;
  prompt_text: string;
  sort_order: number;
  is_active: boolean;
};

/** Where rows are read from / written to. */
export type PhotoGameScope = { kind: 'library' } | { kind: 'event'; eventId: string };

// ─── Rules (pure) ───────────────────────────────────────────────────────────

export function validatePromptText(text: string): string | null {
  const t = text.trim();
  if (!t) return 'Enter the text players will see.';
  if (t.length > PROMPT_MAX)
    return `Keep it to ${PROMPT_MAX} characters or fewer (now ${t.length}).`;
  return null;
}

export function isValidQuestionId(id: string): boolean {
  return QUESTION_ID_PATTERN.test(id);
}

/** Bingo: a lowercase slug of the text, unique among existing ids (`-2`, `-3`… when taken). */
export function suggestBingoId(text: string, existingIds: string[]): string {
  const base =
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\+/g, ' plus ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/g, '') || 'prompt';
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Connects: the next `card-NN` after the highest existing card number (`card-61`…). */
export function nextCardId(existingIds: string[]): string {
  const max = existingIds.reduce((m, id) => {
    const match = /^card-(\d+)$/.exec(id);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `card-${String(max + 1).padStart(2, '0')}`;
}

export function sortRows<T extends Pick<PhotoGameRow, 'sort_order' | 'question_id'>>(
  rows: T[]
): T[] {
  return [...rows].sort(
    (a, b) => a.sort_order - b.sort_order || a.question_id.localeCompare(b.question_id)
  );
}

/** Exactly what players see on the Bingo board: the first 15 active rows by sort order. */
export function bingoBoard(rows: PhotoGameRow[]): PhotoGameRow[] {
  return sortRows(rows.filter((r) => r.is_active)).slice(0, BINGO_BOARD_SIZE);
}

/**
 * Moving one row up or down: the whole list's new sort orders (10, 20, 30… in
 * the new order), so there are never ties. Returns [] when the move isn't possible.
 */
export function reorderUpdates(
  rows: PhotoGameRow[],
  questionId: string,
  direction: 'up' | 'down'
): { question_id: string; sort_order: number }[] {
  const ordered = sortRows(rows);
  const i = ordered.findIndex((r) => r.question_id === questionId);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ordered.length) return [];
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  return ordered
    .map((r, index) => ({
      question_id: r.question_id,
      sort_order: (index + 1) * 10,
      before: r.sort_order,
    }))
    .filter((u) => u.sort_order !== u.before)
    .map(({ question_id, sort_order }) => ({ question_id, sort_order }));
}

/** Sort order for a new row: after the last one. */
export function nextSortOrder(rows: PhotoGameRow[]): number {
  return rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10;
}

/** True between the event's start and end (inclusive), using the stored timestamps. */
export function isEventRunning(
  event: { starts_at: string | null; ends_at: string | null } | null,
  now: Date = new Date()
): boolean {
  if (!event?.starts_at) return false;
  const start = new Date(event.starts_at).getTime();
  const end = event.ends_at ? new Date(event.ends_at).getTime() : start;
  const t = now.getTime();
  // Treat the end date as the whole of that day.
  return t >= start && t <= end + 24 * 60 * 60 * 1000 - 1;
}

export type PhotoGameWarning = { tone: 'warning' | 'info'; text: string };

export function contentWarnings(game: PhotoGame, rows: PhotoGameRow[]): PhotoGameWarning[] {
  const active = rows.filter((r) => r.is_active).length;
  if (game === 'human_bingo' && active < BINGO_BOARD_SIZE) {
    return [
      {
        tone: 'warning',
        text: `Only ${active} active prompt${active === 1 ? '' : 's'}: the board has ${BINGO_BOARD_SIZE} squares, so ${BINGO_BOARD_SIZE - active} will be empty. Switch on or add prompts.`,
      },
    ];
  }
  if (game === 'connect' && active === 0) {
    return [
      {
        tone: 'warning',
        text: 'No active cards: players won’t be dealt a card. Switch on or add at least one.',
      },
    ];
  }
  return [];
}

// ─── Reads and writes (passed-in client, RLS) ──────────────────────────────

const ROW_SELECT = 'game,question_id,prompt_text,sort_order,is_active';

/** Library rows, or an event's own rows (empty list = the event uses the library). */
export async function listGameRows(client: SupabaseClient, scope: PhotoGameScope, game: PhotoGame) {
  const q =
    scope.kind === 'library'
      ? client.from('photo_game_library').select(ROW_SELECT).eq('game', game)
      : client
          .from('photo_game_prompts')
          .select(ROW_SELECT)
          .eq('event_id', scope.eventId)
          .eq('game', game);
  const { data, error } = await q.order('sort_order').order('question_id');
  return { data: sortRows((data ?? []) as PhotoGameRow[]), error };
}

/** "Use own content" / "Pull in new library rows". Never overwrites the event's rows. Returns rows added. */
export async function copyLibraryToEvent(
  client: SupabaseClient,
  eventId: string,
  game: PhotoGame | null
) {
  const { data, error } = await client.rpc('photo_game_copy_library_to_event', {
    p_event_id: eventId,
    p_game: game,
  });
  return { added: typeof data === 'number' ? data : 0, error };
}

function scoped(client: SupabaseClient, scope: PhotoGameScope) {
  return scope.kind === 'library'
    ? client.from('photo_game_library')
    : client.from('photo_game_prompts');
}

function keyFilter<Q extends { eq: (c: string, v: string) => Q }>(
  q: Q,
  scope: PhotoGameScope,
  game: PhotoGame,
  questionId: string
) {
  const withGame = q.eq('game', game).eq('question_id', questionId);
  return scope.kind === 'event' ? withGame.eq('event_id', scope.eventId) : withGame;
}

export async function updateRow(
  client: SupabaseClient,
  scope: PhotoGameScope,
  game: PhotoGame,
  questionId: string,
  patch: Partial<Pick<PhotoGameRow, 'prompt_text' | 'is_active' | 'sort_order'>>
) {
  const body =
    patch.prompt_text !== undefined ? { ...patch, prompt_text: patch.prompt_text.trim() } : patch;
  const { data, error } = await keyFilter(
    scoped(client, scope).update(body),
    scope,
    game,
    questionId
  ).select('question_id');
  // RLS can silently match nothing: treat "no row updated" as refused.
  if (!error && (!data || data.length === 0))
    return { error: { message: 'not_permitted' } as { message: string } };
  return { error };
}

export async function insertRow(client: SupabaseClient, scope: PhotoGameScope, row: PhotoGameRow) {
  const payload = {
    game: row.game,
    question_id: row.question_id,
    prompt_text: row.prompt_text.trim(),
    sort_order: row.sort_order,
    is_active: row.is_active,
    ...(scope.kind === 'event' ? { event_id: scope.eventId } : {}),
  };
  const { error } = await scoped(client, scope).insert(payload);
  return { error };
}

/** Writes new sort orders (from reorderUpdates). Stops at the first failure. */
export async function saveSortOrders(
  client: SupabaseClient,
  scope: PhotoGameScope,
  game: PhotoGame,
  updates: { question_id: string; sort_order: number }[]
) {
  for (const u of updates) {
    const { error } = await updateRow(client, scope, game, u.question_id, {
      sort_order: u.sort_order,
    });
    if (error) return { error };
  }
  return { error: null };
}

export type GameActivity = {
  id: string;
  game: PhotoGame;
  question_id: string;
  prompt_text: string;
  image_url: string;
  created_at: string;
  user_id: string;
  partner_id: string;
};

export async function listActivity(client: SupabaseClient, eventId: string) {
  const { data, error } = await client
    .from('photo_game_entries')
    .select('id,game,question_id,prompt_text,image_url,created_at,user_id,partner_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(500);
  return { data: (data ?? []) as GameActivity[], error };
}

export type PlayerInfo = {
  user_id: string;
  player_number: number | null;
  full_name: string | null;
};

/** Player numbers and names for an event's members (names from the public profile columns). */
export async function listPlayers(client: SupabaseClient, eventId: string) {
  const { data, error } = await client
    .from('event_members')
    .select('user_id,player_number,profiles!event_members_user_id_fkey(full_name)')
    .eq('event_id', eventId);
  const rows = (data ?? []) as unknown as {
    user_id: string;
    player_number: number | null;
    profiles: { full_name: string | null } | null;
  }[];
  return {
    data: rows.map((r) => ({
      user_id: r.user_id,
      player_number: r.player_number,
      full_name: r.profiles?.full_name ?? null,
    })),
    error,
  };
}

export type LeaderboardRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  total_points: number;
};

export async function getLeaderboard(client: SupabaseClient, eventId: string, limit = 100) {
  const { data, error } = await client.rpc('get_leaderboard', {
    p_event_id: eventId,
    p_limit: limit,
  });
  return {
    data: ((data ?? []) as LeaderboardRow[]).map((r) => ({
      ...r,
      total_points: Number(r.total_points),
    })),
    error,
  };
}
