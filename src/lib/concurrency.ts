// Runs `task` over every item with at most `limit` in flight at once —
// enough to avoid hammering a rate-limited external API without pulling in
// a dependency for something this small.
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
