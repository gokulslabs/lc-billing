export const PAGE_SIZE = 50;

export function readPage(value: string | undefined): number {
  const page = Number(value ?? "1");
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), 400);
}

export function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}
