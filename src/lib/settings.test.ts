import { describe, expect, it } from "vitest";
import { nextSortOrder, shopName } from "./settings";

describe("shopName", () => {
  it("keeps the live measurement spellings in upper case", () => {
    expect(shopName("  sholder ")).toBe("SHOLDER");
    expect(shopName("princes cut / princes with belt")).toBe("PRINCES CUT / PRINCES WITH BELT");
    expect(shopName("frock   lenth")).toBe("FROCK LENTH");
    expect(shopName("embroidary work")).toBe("EMBROIDARY WORK");
  });

  it("rejects a blank name", () => {
    expect(shopName("   ")).toBeNull();
  });
});

describe("nextSortOrder", () => {
  it("appends after the last head", () => {
    expect(nextSortOrder([1, 13])).toBe(14);
    expect(nextSortOrder([])).toBe(1);
  });
});
