export const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;
const CHUNK = 100;

type Page<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function readAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<{ rows: T[]; truncated: boolean } | null> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) return null;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function readIn<T>(
  ids: readonly string[],
  fetchPage: (ids: string[], from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[] | null> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let index = 0; index < unique.length; index += CHUNK) {
    const chunk = unique.slice(index, index + CHUNK);
    const loaded = await readAll((from, to) => fetchPage(chunk, from, to));
    if (!loaded) return null;
    rows.push(...loaded.rows);
    if (loaded.truncated) return null;
  }
  return rows;
}
