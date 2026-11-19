/** Feature 027: moved out of csvImport.ts so non-import screens can use it without loading the spreadsheet parser. */

/**
 * Runs async work over a list with a max concurrency, preserving input order
 * in the results. Every current caller (CsvImportModal's row import,
 * members/page.tsx's bulk org-add/team-assign) already treats a per-item
 * failure as partial success — a failed row/member is reported individually,
 * the batch as a whole keeps going — so a worker that *throws* (rather than
 * returning its own failure value) is caught here and routed through
 * onWorkerError instead of rejecting the whole Promise.all, which would
 * otherwise abort every remaining item and leave the caller's loading state
 * stuck with no result. onWorkerError lets each caller produce a same-shaped
 * R representing that one item's failure, exactly as it already does for a
 * non-throwing failure.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onWorkerError: (item: T, index: number, error: unknown) => R
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    try {
      results[index] = await worker(items[index], index);
    } catch (error) {
      console.error('runWithConcurrency: worker threw', error);
      results[index] = onWorkerError(items[index], index, error);
    }
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}
