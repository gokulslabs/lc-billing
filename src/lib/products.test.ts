import { describe, expect, it } from "vitest";
import { nextProductCode, productSchema } from "./products";

describe("nextProductCode", () => {
  it("starts at 001 for an empty group", () => {
    expect(nextProductCode("ss", [])).toBe("SS001");
  });

  it("continues after the highest code in that group", () => {
    expect(nextProductCode("SS", ["SS001", "SS014", "SR003"])).toBe("SS015");
  });
});

describe("productSchema", () => {
  it("rejects a unit the old shop did not use", () => {
    const parsed = productSchema.safeParse({
      groupId: "6f1e2c4a-7b8d-4e9f-a1b2-c3d4e5f60718",
      name: "Silk saree",
      code: "SS001",
      unit: "BOX",
      price: 1200,
    });
    expect(parsed.success).toBe(false);
  });
});
