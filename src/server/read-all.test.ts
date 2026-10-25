import { describe, expect, it } from "vitest";
import { PAGE_SIZE, readAll, readIn } from "./read-all";

describe("readAll", () => {
  it("keeps reading until a short page", async () => {
    const loaded = await readAll<number>(async (from) => {
      if (from === 0) return { data: Array.from({ length: PAGE_SIZE }, (_, index) => index), error: null };
      return { data: [PAGE_SIZE], error: null };
    });
    expect(loaded?.truncated).toBe(false);
    expect(loaded?.rows).toHaveLength(PAGE_SIZE + 1);
    expect(loaded?.rows.at(-1)).toBe(PAGE_SIZE);
  });

  it("stops when a page fails", async () => {
    const loaded = await readAll<number>(async () => ({ data: null, error: { message: "down" } }));
    expect(loaded).toBeNull();
  });
});

describe("readIn", () => {
  it("loads every id across chunks", async () => {
    const ids = Array.from({ length: 150 }, (_, index) => String(index));
    const seen: string[][] = [];
    const rows = await readIn(ids, async (chunk) => {
      seen.push(chunk);
      return { data: chunk.map((id) => Number(id)), error: null };
    });
    expect(seen).toHaveLength(2);
    expect(rows).toHaveLength(150);
  });
});
