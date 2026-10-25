import { describe, expect, it } from "vitest";
import { cleanMeasurements, nextOrderNo, stitchingOrderSchema } from "./stitching";

describe("nextOrderNo", () => {
  it("starts at 1 when the shop has no stitching orders", () => {
    expect(nextOrderNo([])).toBe("1");
  });

  it("continues after the highest numeric order", () => {
    expect(nextOrderNo(["12", "A4"])).toBe("13");
  });
});

describe("cleanMeasurements", () => {
  it("keeps free-text values and the old label spelling style", () => {
    expect(cleanMeasurements([{ label: "hip", value: "36+4" }, { label: "", value: "" }])).toEqual([
      { label: "HIP", value: "36+4" },
    ]);
  });

  it("asks for a value when a label is filled", () => {
    expect(cleanMeasurements([{ label: "BUST", value: "" }])).toBe("Enter a measurement value.");
  });
});

describe("stitchingOrderSchema", () => {
  it("rejects a missing garment", () => {
    const parsed = stitchingOrderSchema.safeParse({
      customerId: "6f1e2c4a-7b8d-4e9f-a1b2-c3d4e5f60718",
      productId: "",
      bagNo: "3",
      orderedOn: "2026-10-24",
      deliveryOn: "",
      status: "PENDING",
      amount: 0,
      measurements: [],
    });
    expect(parsed.success).toBe(false);
  });
});
