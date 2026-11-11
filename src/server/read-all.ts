export const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;
const CHUNK = 100;
const PAGE_CONCURRENCY = 4;
const ID_CHUNK_CONCURRENCY = 4;

type Page<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function readAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<{ rows: T[]; truncated: boolean } | null> {
  const rows: T[] = [];
  for (let batchStart = 0; batchStart < MAX_ROWS; batchStart += PAGE_SIZE * PAGE_CONCURRENCY) {
    const starts = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, (MAX_ROWS - batchStart) / PAGE_SIZE) },
      (_, index) => batchStart + index * PAGE_SIZE,
    );
    const pages = await Promise.all(
      starts.map((from) => fetchPage(from, from + PAGE_SIZE - 1)),
    );
    for (let index = 0; index < pages.length; index += 1) {
      const result = pages[index];
      if (!result) return null;
      const { data, error } = result;
      if (error) return null;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return { rows, truncated: false };
    }
  }
  return { rows, truncated: true };
}

export async function readIn<T>(
  ids: readonly string[],
  fetchPage: (ids: string[], from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[] | null> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += CHUNK) {
    chunks.push(unique.slice(index, index + CHUNK));
  }
  const results: T[][] = [];
  for (let index = 0; index < chunks.length; index += ID_CHUNK_CONCURRENCY) {
    const loadedChunks = await Promise.all(
      chunks.slice(index, index + ID_CHUNK_CONCURRENCY).map(async (chunk) =>
        readAll((from, to) => fetchPage(chunk, from, to)),
      ),
    );
    for (const loaded of loadedChunks) {
      if (!loaded || loaded.truncated) return null;
      results.push(loaded.rows);
    }
  }
  return results.flat();
}
