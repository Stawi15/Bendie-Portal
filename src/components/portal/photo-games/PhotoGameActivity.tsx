'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import {
  PHOTO_GAME_LABELS,
  getLeaderboard,
  listActivity,
  listPlayers,
  type GameActivity,
  type LeaderboardRow,
  type PlayerInfo,
} from '@/lib/photoGames';

/* Feature 032 — read-only views of the photo games for organisers. */

function usePlayers(eventId: string) {
  const [players, setPlayers] = useState<Map<string, PlayerInfo>>(new Map());
  useEffect(() => {
    listPlayers(supabase, eventId).then(({ data }) =>
      setPlayers(new Map(data.map((p) => [p.user_id, p])))
    );
  }, [eventId]);
  return players;
}

function playerLabel(players: Map<string, PlayerInfo>, id: string, fallback = 'A player') {
  const p = players.get(id);
  const name = p?.full_name?.trim() || fallback;
  return p?.player_number ? `${name} (#${p.player_number})` : name;
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
    <div className="text-center py-10 px-4 bg-white border border-outline-variant rounded-[20px]">
      <p
        className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3"
        aria-hidden="true"
      >
        {icon}
      </p>
      <p className="font-medium text-on-surface">{title}</p>
      {children}
    </div>
  );
}

export function PhotoGameActivity({ eventId }: { eventId: string }) {
  const players = usePlayers(eventId);
  const [rows, setRows] = useState<GameActivity[] | null>(null);
  const [error, setError] = useState(false);
  const [game, setGame] = useState<'' | GameActivity['game']>('');

  useEffect(() => {
    listActivity(supabase, eventId).then(({ data, error: e }) =>
      e ? setError(true) : setRows(data)
    );
  }, [eventId]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !game || r.game === game), [rows, game]);

  if (error) return <Message icon="error" title="We couldn’t load the game activity." />;
  if (!rows)
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface-container-low rounded-xl" />
        ))}
      </div>
    );
  if (rows.length === 0)
    return (
      <Message icon="photo_camera" title="No game photos yet">
        <p className="text-sm text-on-surface-variant mt-1 max-w-md mx-auto">
          When players find each other in Human Bingo or Connects, each photo appears here with who
          took it and who was in it.
        </p>
      </Message>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          {shown.length} photo{shown.length === 1 ? '' : 's'}, newest first
        </p>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          Game
          <select
            className="input py-1.5 text-sm w-auto"
            value={game}
            onChange={(e) => setGame(e.target.value as typeof game)}
          >
            <option value="">Both games</option>
            <option value="human_bingo">Human Bingo</option>
            <option value="connect">Connects</option>
          </select>
        </label>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((r) => (
          <li
            key={r.id}
            className="flex gap-3 bg-white border border-outline-variant rounded-xl p-2.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.image_url}
              alt={`Game photo: ${r.prompt_text}`}
              className="w-20 h-20 rounded-lg object-cover flex-shrink-0 bg-surface-container-low"
              loading="lazy"
            />
            <div className="min-w-0 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {PHOTO_GAME_LABELS[r.game]}
              </p>
              <p className="text-on-surface line-clamp-2">{r.prompt_text}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {playerLabel(players, r.user_id)} with {playerLabel(players, r.partner_id)}
              </p>
              <p className="text-[11px] text-on-surface-variant/80">
                {formatRelativeTime(r.created_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PhotoGameLeaderboard({ eventId }: { eventId: string }) {
  const players = usePlayers(eventId);
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getLeaderboard(supabase, eventId).then(({ data, error: e }) =>
      e ? setError(true) : setRows(data)
    );
  }, [eventId]);

  if (error) return <Message icon="error" title="We couldn’t load the leaderboard." />;
  if (!rows)
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-surface-container-low rounded-xl" />
        ))}
      </div>
    );
  if (rows.length === 0)
    return (
      <Message icon="leaderboard" title="No points yet">
        <p className="text-sm text-on-surface-variant mt-1">
          Players earn points for game photos, gallery posts, connections and more.
        </p>
      </Message>
    );

  return (
    <div className="space-y-2">
      <p className="text-sm text-on-surface-variant">
        The same leaderboard players see in the app: all points earned at this event (games,
        gallery, connections, chats, feedback).
      </p>
      <div className="bg-white border border-outline-variant rounded-[20px] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-xs text-on-surface-variant">
            <tr>
              <th scope="col" className="text-left px-4 py-2 w-16">
                Rank
              </th>
              <th scope="col" className="text-left px-4 py-2">
                Player
              </th>
              <th scope="col" className="text-left px-4 py-2 w-24">
                Number
              </th>
              <th scope="col" className="text-right px-4 py-2 w-24">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = players.get(r.user_id);
              return (
                <tr key={r.user_id} className="border-t border-outline-variant">
                  <td className="px-4 py-2 tabular-nums text-on-surface-variant">{i + 1}</td>
                  <td className="px-4 py-2 text-on-surface">
                    {r.full_name?.trim() || r.username || 'A player'}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-on-surface-variant">
                    {p?.player_number ? `#${p.player_number}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {r.total_points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
