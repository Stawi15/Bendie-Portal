import { describe, expect, it } from 'vitest';
import {
  BINGO_BOARD_SIZE,
  bingoBoard,
  contentWarnings,
  isEventRunning,
  isValidQuestionId,
  nextCardId,
  nextSortOrder,
  reorderUpdates,
  suggestBingoId,
  validatePromptText,
  type PhotoGameRow,
} from './photoGames';

const row = (
  id: string,
  order: number,
  active = true,
  game: PhotoGameRow['game'] = 'human_bingo'
): PhotoGameRow => ({
  game,
  question_id: id,
  prompt_text: id,
  sort_order: order,
  is_active: active,
});

describe('text and ids', () => {
  it('validates prompt text (1–300 after trimming)', () => {
    expect(validatePromptText('  ')).toMatch(/Enter the text/);
    expect(validatePromptText('x'.repeat(301))).toMatch(/300 characters/);
    expect(validatePromptText(' Has a pet ')).toBeNull();
  });
  it('checks the backend id pattern', () => {
    expect(isValidQuestionId('has-pet')).toBe(true);
    expect(isValidQuestionId('card-61')).toBe(true);
    expect(isValidQuestionId('Has-Pet')).toBe(false);
    expect(isValidQuestionId('-pet')).toBe(false);
    expect(isValidQuestionId('a'.repeat(64))).toBe(false);
  });
  it('suggests a unique Bingo slug from the text', () => {
    expect(suggestBingoId('Has visited 3+ countries', [])).toBe('has-visited-3-plus-countries');
    expect(suggestBingoId('Has a pet', ['has-a-pet'])).toBe('has-a-pet-2');
    expect(suggestBingoId('Has a pet', ['has-a-pet', 'has-a-pet-2'])).toBe('has-a-pet-3');
    expect(suggestBingoId('!!!', [])).toBe('prompt');
    expect(isValidQuestionId(suggestBingoId('Café crème — très bon!', []))).toBe(true);
  });
  it('suggests the next Connects card id', () => {
    expect(nextCardId(['card-01', 'card-60', 'has-pet'])).toBe('card-61');
    expect(nextCardId([])).toBe('card-01');
  });
});

describe('board and order', () => {
  const rows = Array.from({ length: 18 }, (_, i) => row(`p${i + 1}`, (i + 1) * 10, i !== 2));
  it('the board is the first 15 active rows by sort order', () => {
    const board = bingoBoard(rows);
    expect(board).toHaveLength(BINGO_BOARD_SIZE);
    expect(board.map((r) => r.question_id)).not.toContain('p3');
    expect(board[2].question_id).toBe('p4');
    expect(board[14].question_id).toBe('p16');
  });
  it('moving a row rewrites sort orders 10, 20, 30… with no ties, only changed rows', () => {
    const small = [row('a', 10), row('b', 20), row('c', 30)];
    expect(reorderUpdates(small, 'c', 'up')).toEqual([
      { question_id: 'c', sort_order: 20 },
      { question_id: 'b', sort_order: 30 },
    ]);
    expect(reorderUpdates(small, 'a', 'up')).toEqual([]);
    expect(reorderUpdates(small, 'c', 'down')).toEqual([]);
    const messy = [row('a', 5), row('b', 5), row('c', 100)];
    const moved = reorderUpdates(messy, 'a', 'down');
    expect(moved).toEqual([
      { question_id: 'b', sort_order: 10 },
      { question_id: 'a', sort_order: 20 },
      { question_id: 'c', sort_order: 30 },
    ]);
  });
  it('puts new rows after the last one', () => {
    expect(nextSortOrder([row('a', 10), row('b', 600)])).toBe(610);
    expect(nextSortOrder([])).toBe(10);
  });
});

describe('warnings and running events', () => {
  it('warns when the Bingo board is short or Connects has no active card', () => {
    expect(
      contentWarnings(
        'human_bingo',
        Array.from({ length: 15 }, (_, i) => row(`p${i}`, i))
      )
    ).toEqual([]);
    expect(contentWarnings('human_bingo', [row('a', 1), row('b', 2, false)])[0].text).toMatch(
      /Only 1 active prompt: .* 14 will be empty/
    );
    expect(contentWarnings('connect', [row('card-01', 1, false, 'connect')])[0].text).toMatch(
      /No active cards/
    );
    expect(contentWarnings('connect', [row('card-01', 1, true, 'connect')])).toEqual([]);
  });
  it('knows when an event is running (end date counts as the whole day)', () => {
    const ev = { starts_at: '2026-11-25T00:00:00Z', ends_at: '2026-11-26T00:00:00Z' };
    expect(isEventRunning(ev, new Date('2026-11-26T15:00:00Z'))).toBe(true);
    expect(isEventRunning(ev, new Date('2026-11-27T01:00:00Z'))).toBe(false);
    expect(isEventRunning(ev, new Date('2026-11-24T23:00:00Z'))).toBe(false);
    expect(isEventRunning({ starts_at: null, ends_at: null })).toBe(false);
  });
});
