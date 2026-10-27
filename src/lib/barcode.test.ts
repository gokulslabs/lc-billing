import { describe, expect, it } from "vitest";
import { code128Symbols, code128Widths } from "@/lib/barcode";

describe("code128", () => {
  it("encodes an inventory number, including the IN prefix", () => {
    const symbols = code128Symbols("IN0011696");
    expect(symbols?.[0]).toBe(104);
    expect(symbols?.at(-1)).toBe(106);
    const data = symbols?.slice(1, -2) ?? [];
    expect(String.fromCharCode(...data.map((code) => code + 32))).toBe("IN0011696");
    expect(code128Widths("IN0011696")?.length).toBeGreaterThan(0);
  });

  it("rejects a number the billing gun cannot read", () => {
    expect(code128Symbols("")).toBeNull();
    expect(code128Symbols("IN 1")).not.toBeNull();
    expect(code128Symbols("₹1")).toBeNull();
  });
});
