import { describe, expect, it } from "vitest";
import { nextSortOrder, shopName } from "./settings";

describe("shopName", () => {
  it("corrects the known shop spellings and leaves the others", () => {
    expect(shopName("  sholder ")).toBe("SHOULDER");
    expect(shopName("princes cut / princes with belt")).toBe("PRINCESS CUT / PRINCES WITH BELT");
    expect(shopName("frock   lenth")).toBe("FROCK LENTH");
    expect(shopName("embroidary work")).toBe("EMBROIDERY WORK");
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
