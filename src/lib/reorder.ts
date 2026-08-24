/** Swaps list[index] with its neighbor in the given direction. No-op at either end of the list. */
export function moveItem<T>(list: T[], index: number, direction: 'up' | 'down'): T[] {
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= list.length) return list;
  const next = [...list];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}
