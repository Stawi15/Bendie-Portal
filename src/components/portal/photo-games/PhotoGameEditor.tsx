'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { FormModal } from '@/components/portal/FormModal';
import { friendlyError } from '@/lib/userFacingError';
import {
  BINGO_BOARD_SIZE,
  PHOTO_GAME_LABELS,
  PROMPT_MAX,
  bingoBoard,
  contentWarnings,
  copyLibraryToEvent,
  insertRow,
  isEventRunning,
  isValidQuestionId,
  listGameRows,
  nextCardId,
  nextSortOrder,
  reorderUpdates,
  saveSortOrders,
  sortRows,
  suggestBingoId,
  updateRow,
  validatePromptText,
  type PhotoGame,
  type PhotoGameRow,
  type PhotoGameScope,
} from '@/lib/photoGames';

/*
 * Feature 032 — editor for Human Bingo prompts / Connects cards, for one event
 * (its own copy, or the library it falls back to) or for the master library.
 * Rows are never deleted and ids never change (switch rows off instead).
 */

type EventInfo = { starts_at: string | null; ends_at: string | null; interactivesHidden: boolean };

const saveError = (error: { message?: string } | null, fallback: string) =>
  error?.message === 'not_permitted'
    ? 'You don’t have permission to edit games for this event.'
    : friendlyError(error, fallback);

export function PhotoGameEditor({
  scope: scopeProp,
  game,
  event,
}: {
  scope: PhotoGameScope;
  game: PhotoGame;
  event?: EventInfo;
}) {
  // Callers pass a fresh object each render; derive a stable one from its values.
  const scopeEventId = scopeProp.kind === 'event' ? scopeProp.eventId : null;
  const scope = useMemo<PhotoGameScope>(
    () => (scopeEventId ? { kind: 'event', eventId: scopeEventId } : { kind: 'library' }),
    [scopeEventId]
  );
  const { user, isGlobalAdmin } = useAuth();
  const confirm = useConfirm();
  const label = PHOTO_GAME_LABELS[game];
  const noun = game === 'human_bingo' ? 'prompt' : 'card';

  const [rows, setRows] = useState<PhotoGameRow[]>([]);
  const [usingLibrary, setUsingLibrary] = useState(false); // event scope with no own rows
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [holds, setHolds] = useState<Record<string, number> | null | 'error'>(null);
  const [editing, setEditing] = useState<PhotoGameRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [newId, setNewId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Who may edit: Stawi admins (library); event hosts/organisers, org admins, Stawi admins (event).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isGlobalAdmin) return setCanEdit(true);
      if (scope.kind === 'library' || !user) return setCanEdit(false);
      const [host, orgAdmin] = await Promise.all([
        supabase.rpc('is_event_host_or_organizer', { ev_id: scope.eventId, uid: user.id }),
        supabase.rpc('is_event_org_admin', { ev_id: scope.eventId }),
      ]);
      if (!cancelled) setCanEdit(host.data === true || orgAdmin.data === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGlobalAdmin, user, scope]);

  const load = useCallback(async () => {
    const own = await listGameRows(supabase, scope, game);
    if (own.error) return setStatus('error');
    if (scope.kind === 'event' && own.data.length === 0) {
      const lib = await listGameRows(supabase, { kind: 'library' }, game);
      if (lib.error) return setStatus('error');
      setRows(lib.data);
      setUsingLibrary(true);
    } else {
      setRows(own.data);
      setUsingLibrary(false);
    }
    setStatus('ready');
  }, [scope, game]);

  useEffect(() => {
    void load();
  }, [load]);

  // Connects: how many players hold each card (server route, organisers only).
  useEffect(() => {
    if (game !== 'connect' || scope.kind !== 'event') return;
    let cancelled = false;
    fetch(`/api/events/${scope.eventId}/photo-games/hands`)
      .then(async (r) =>
        r.ok ? ((await r.json()) as { counts: Record<string, number> }) : Promise.reject(r.status)
      )
      .then((d) => !cancelled && setHolds(d.counts))
      .catch(() => !cancelled && setHolds('error'));
    return () => {
      cancelled = true;
    };
  }, [game, scope]);

  const editable = canEdit && !usingLibrary;
  const ordered = useMemo(() => sortRows(rows), [rows]);
  const board = useMemo(() => (game === 'human_bingo' ? bingoBoard(rows) : []), [game, rows]);
  const boardIds = useMemo(() => new Set(board.map((r) => r.question_id)), [board]);
  const warnings = contentWarnings(game, rows);
  const running = scope.kind === 'event' && isEventRunning(event ?? null);
  const activeCount = rows.filter((r) => r.is_active).length;

  const confirmLiveBoardChange = async () =>
    game !== 'human_bingo' ||
    !running ||
    confirm({
      title: 'Change the live board?',
      message:
        'This event is running. If a prompt leaves the first 15 active prompts, squares players already filled with it stop counting (including towards the full-board bonus).',
      confirmLabel: 'Change it',
    });

  const copyToEvent = async () => {
    if (scope.kind !== 'event') return;
    setBusy('copy');
    const { added, error } = await copyLibraryToEvent(supabase, scope.eventId, game);
    setBusy(null);
    if (error)
      return void toast.error(saveError(error, 'We couldn’t copy the library. Try again.'));
    toast.success(
      usingLibrary
        ? `${label}: this event now has its own ${noun}s`
        : added
          ? `Added ${added} new library ${noun}${added === 1 ? '' : 's'}`
          : 'Already up to date with the library'
    );
    void load();
  };

  const toggleActive = async (r: PhotoGameRow) => {
    if (r.is_active && game === 'connect' && activeCount === 1) {
      const ok = await confirm({
        title: 'Switch off the last card?',
        message: 'With no active cards, players won’t be dealt a card.',
        confirmLabel: 'Switch off',
        destructive: true,
      });
      if (!ok) return;
    }
    if (r.is_active && game === 'human_bingo' && activeCount <= BINGO_BOARD_SIZE) {
      const ok = await confirm({
        title: 'Leave an empty square?',
        message: `The board needs ${BINGO_BOARD_SIZE} active prompts. Switching this off leaves a square empty until you switch on or add another.`,
        confirmLabel: 'Switch off',
      });
      if (!ok) return;
    }
    if ((r.is_active ? boardIds.has(r.question_id) : true) && !(await confirmLiveBoardChange()))
      return;
    setBusy(r.question_id);
    const { error } = await updateRow(supabase, scope, game, r.question_id, {
      is_active: !r.is_active,
    });
    setBusy(null);
    if (error) return void toast.error(saveError(error, 'We couldn’t save that change.'));
    setRows((prev) =>
      prev.map((x) => (x.question_id === r.question_id ? { ...x, is_active: !r.is_active } : x))
    );
  };

  const move = async (r: PhotoGameRow, direction: 'up' | 'down') => {
    const updates = reorderUpdates(rows, r.question_id, direction);
    if (!updates.length || !(await confirmLiveBoardChange())) return;
    setBusy(r.question_id);
    const { error } = await saveSortOrders(supabase, scope, game, updates);
    setBusy(null);
    if (error) {
      toast.error(saveError(error, 'We couldn’t save the new order.'));
      return void load();
    }
    const map = new Map(updates.map((u) => [u.question_id, u.sort_order]));
    setRows((prev) =>
      prev.map((x) => (map.has(x.question_id) ? { ...x, sort_order: map.get(x.question_id)! } : x))
    );
  };

  const openEdit = (r: PhotoGameRow) => {
    setEditing(r);
    setText(r.prompt_text);
    setFormError(null);
  };
  const openAdd = () => {
    setAdding(true);
    setText('');
    setNewId(game === 'connect' ? nextCardId(rows.map((r) => r.question_id)) : '');
    setFormError(null);
  };
  const closeForm = () => {
    setEditing(null);
    setAdding(false);
  };

  const saveForm = async () => {
    const textError = validatePromptText(text);
    if (textError) return setFormError(textError);
    if (editing) {
      setBusy('form');
      const { error } = await updateRow(supabase, scope, game, editing.question_id, {
        prompt_text: text,
      });
      setBusy(null);
      if (error) return void toast.error(saveError(error, 'We couldn’t save this text.'));
      toast.success('Saved');
      setRows((prev) =>
        prev.map((x) =>
          x.question_id === editing.question_id ? { ...x, prompt_text: text.trim() } : x
        )
      );
      return closeForm();
    }
    const ids = rows.map((r) => r.question_id);
    const id = (
      newId || (game === 'human_bingo' ? suggestBingoId(text, ids) : nextCardId(ids))
    ).trim();
    if (!isValidQuestionId(id))
      return setFormError(
        'The id must be lowercase letters, numbers and hyphens, starting with a letter or number.'
      );
    if (ids.includes(id))
      return setFormError('That id is already used. Ids can never be reused, so pick another.');
    setBusy('form');
    const { error } = await insertRow(supabase, scope, {
      game,
      question_id: id,
      prompt_text: text,
      sort_order: nextSortOrder(rows),
      is_active: true,
    });
    setBusy(null);
    if (error) return void toast.error(saveError(error, `We couldn’t add this ${noun}.`));
    toast.success(`${noun === 'prompt' ? 'Prompt' : 'Card'} added`);
    closeForm();
    void load();
  };

  if (status === 'loading') {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-surface-container-low rounded-xl" />
        ))}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="text-center py-10 bg-white border border-outline-variant rounded-[20px]">
        <p className="font-medium text-on-surface">We couldn’t load the {label} content.</p>
        <button
          className="btn-secondary mt-3"
          onClick={() => {
            setStatus('loading');
            void load();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Source banner */}
      {scope.kind === 'event' && (
        <div
          className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3 ${usingLibrary ? 'border-primary/30 bg-primary/5' : 'border-outline-variant bg-white'}`}
        >
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            {usingLibrary ? 'library_books' : 'edit_note'}
          </span>
          <div className="flex-1 min-w-[16rem]">
            <p className="text-sm font-semibold text-on-surface">
              {usingLibrary
                ? `Using the shared ${label} library`
                : `Using this event’s own ${label} content`}
            </p>
            <p className="text-xs text-on-surface-variant">
              {usingLibrary
                ? `Players see the library below. To change anything for this event, make your own copy first.`
                : `Changes are live in the app the next time a player opens ${label}. Library updates don’t reach this event unless you pull them in.`}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              className={usingLibrary ? 'btn-primary' : 'btn-secondary'}
              onClick={() => void copyToEvent()}
              disabled={busy === 'copy'}
            >
              {busy === 'copy'
                ? 'Working…'
                : usingLibrary
                  ? 'Use own content'
                  : 'Pull in new library rows'}
            </button>
          )}
        </div>
      )}
      {event?.interactivesHidden && (
        <p className="text-sm rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-2">
          Interactives is hidden for this event (Basics → attendee app menu), so players can’t see
          the games right now.
        </p>
      )}
      {!canEdit && (
        <p className="text-sm text-on-surface-variant">
          You can view this content. Editing is for the event’s hosts and organisers, organisation
          admins and Stawi admins.
        </p>
      )}
      {warnings.map((w, i) => (
        <p
          key={i}
          role="status"
          className="text-sm rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-2 flex items-start gap-2"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            warning
          </span>
          {w.text}
        </p>
      ))}

      <div
        className={`grid gap-6 ${game === 'human_bingo' ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}
      >
        {/* List */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm text-on-surface-variant">
              {rows.length} {noun}s · {activeCount} active
              {game === 'human_bingo'
                ? ` · the first ${BINGO_BOARD_SIZE} active make the board`
                : ''}
            </p>
            {editable && (
              <button type="button" className="btn-primary" onClick={openAdd}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  add
                </span>{' '}
                Add {noun}
              </button>
            )}
          </div>
          <ol className="space-y-1.5">
            {ordered.map((r, index) => {
              const onBoard = boardIds.has(r.question_id);
              const held = holds && holds !== 'error' ? (holds[r.question_id] ?? 0) : null;
              return (
                <li
                  key={r.question_id}
                  className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-2 ${r.is_active ? 'border-outline-variant' : 'border-outline-variant/60 bg-surface-container-low/60'}`}
                >
                  <span
                    className="w-7 text-xs text-on-surface-variant tabular-nums text-right"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${r.is_active ? 'text-on-surface' : 'text-on-surface-variant line-through'}`}
                    >
                      {r.prompt_text}
                    </p>
                    <p className="text-[11px] text-on-surface-variant/80">
                      {r.question_id}
                      {game === 'human_bingo' &&
                        r.is_active &&
                        (onBoard ? ' · on the board' : ' · spare')}
                      {game === 'connect' &&
                        held !== null &&
                        ` · held by ${held} player${held === 1 ? '' : 's'}`}
                      {!r.is_active && ' · off'}
                    </p>
                  </div>
                  {editable && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        aria-label={`Move “${r.prompt_text}” up`}
                        disabled={index === 0 || busy !== null}
                        onClick={() => void move(r, 'up')}
                        className="w-8 h-8 rounded-lg hover:bg-surface-container-low disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                          arrow_upward
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Move “${r.prompt_text}” down`}
                        disabled={index === ordered.length - 1 || busy !== null}
                        onClick={() => void move(r, 'down')}
                        className="w-8 h-8 rounded-lg hover:bg-surface-container-low disabled:opacity-30"
                      >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                          arrow_downward
                        </span>
                      </button>
                      <label className="flex items-center gap-1.5 px-2 text-xs text-on-surface-variant cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-primary"
                          checked={r.is_active}
                          disabled={busy !== null}
                          onChange={() => void toggleActive(r)}
                          aria-label={`${r.prompt_text}: ${r.is_active ? 'on' : 'off'}`}
                        />
                        {r.is_active ? 'On' : 'Off'}
                      </label>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="text-sm text-primary font-medium px-2 py-1 rounded-lg hover:bg-primary/5"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {holds === 'error' && game === 'connect' && (
            <p className="text-xs text-on-surface-variant mt-2">
              Card hold counts aren’t available right now.
            </p>
          )}
        </div>

        {/* Bingo board preview */}
        {game === 'human_bingo' && (
          <aside aria-label="Board preview" className="lg:sticky lg:top-0 self-start">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
              Board players see
            </p>
            <div className="grid grid-cols-3 gap-1.5 bg-white border border-outline-variant rounded-xl p-2">
              {Array.from({ length: BINGO_BOARD_SIZE }, (_, i) => board[i]).map((r, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-lg p-1.5 flex items-center justify-center text-center text-[11px] leading-tight ${r ? 'bg-primary/5 text-on-surface border border-primary/15' : 'border border-dashed border-outline-variant text-on-surface-variant'}`}
                >
                  {r ? r.prompt_text : 'Empty'}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-2">
              The first {BINGO_BOARD_SIZE} active prompts, in order. Players fill a square by
              finding someone who matches.
            </p>
          </aside>
        )}
      </div>

      <FormModal
        open={!!editing || adding}
        onClose={closeForm}
        title={editing ? `Edit ${noun}` : `Add ${noun}`}
        maxWidthClassName="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="pg-text" className="label">
              {game === 'human_bingo' ? 'Square text' : 'Card question'}
            </label>
            <textarea
              id="pg-text"
              className="input h-24 resize-y"
              value={text}
              maxLength={PROMPT_MAX + 50}
              onChange={(e) => {
                setText(e.target.value);
                setFormError(null);
                if (adding && game === 'human_bingo')
                  setNewId(
                    suggestBingoId(
                      e.target.value,
                      rows.map((r) => r.question_id)
                    )
                  );
              }}
              placeholder={
                game === 'human_bingo' ? 'Has a pet' : 'What is one interesting fact about you?'
              }
            />
            <p className={`hint ${text.trim().length > PROMPT_MAX ? 'text-error' : ''}`}>
              {text.trim().length}/{PROMPT_MAX}
            </p>
          </div>
          {adding && (
            <div>
              <label htmlFor="pg-id" className="label">
                Id
              </label>
              <input
                id="pg-id"
                className="input font-mono text-sm"
                value={newId}
                onChange={(e) => {
                  setNewId(e.target.value.toLowerCase());
                  setFormError(null);
                }}
                placeholder={game === 'human_bingo' ? 'has-a-pet' : 'card-61'}
              />
              <p className="hint">
                Permanent: players’ photos point at it, so it can never be changed or reused later.
              </p>
            </div>
          )}
          {editing && (
            <p className="hint">
              Id <span className="font-mono">{editing.question_id}</span> (permanent). Past photos
              keep the text they were taken with.
            </p>
          )}
          {formError && (
            <p role="alert" className="text-sm text-error">
              {formError}
            </p>
          )}
          <div className="flex gap-3 pt-2 border-t border-outline-variant">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void saveForm()}
              disabled={busy === 'form'}
            >
              {busy === 'form' ? 'Saving…' : editing ? 'Save' : `Add ${noun}`}
            </button>
            <button type="button" className="btn-secondary" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </div>
      </FormModal>
    </div>
  );
}
