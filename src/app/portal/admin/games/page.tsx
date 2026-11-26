'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PhotoGameEditor } from '@/components/portal/photo-games/PhotoGameEditor';
import { PHOTO_GAME_LABELS, type PhotoGame } from '@/lib/photoGames';

/**
 * Feature 032 — Stawi admin: the master Human Bingo prompts and Connects cards
 * (`photo_game_library`). Every event without its own copy uses these, and
 * "Use own content" copies them. Middleware already limits /portal/admin/** to
 * platform admins; the page re-checks, and RLS enforces it.
 */
export default function GamesLibraryPage() {
  const { isGlobalAdmin, loading } = useAuth();
  const [game, setGame] = useState<PhotoGame>('human_bingo');

  if (!loading && !isGlobalAdmin) {
    return (
      <p className="text-on-surface-variant">This area is only available to platform admins.</p>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Games library</h1>
        <p className="text-sm text-on-surface-variant mt-1 max-w-3xl">
          The default Human Bingo prompts and Connects cards. Every event that hasn’t made its own
          copy uses these, and changes are live in the app the next time a player opens the game.
          Events with their own copy only get new rows when an organiser pulls them in. Never delete
          or rename: switch rows off instead.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Game"
        className="flex gap-1 border-b border-outline-variant mb-5"
      >
        {(['human_bingo', 'connect'] as PhotoGame[]).map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={game === g}
            onClick={() => setGame(g)}
            className={`px-3 py-2 -mb-px border-b-2 text-sm ${game === g ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            {PHOTO_GAME_LABELS[g]}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <PhotoGameEditor key={game} scope={{ kind: 'library' }} game={game} />
      </div>
    </div>
  );
}
