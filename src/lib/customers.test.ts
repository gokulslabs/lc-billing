import { describe, expect, it } from "vitest";
import { customerSchema, isUnrecordedName } from "./customers";

describe("customerSchema", () => {
  it("keeps the old shop fields", () => {
    const parsed = customerSchema.safeParse({
      name: "Meera",
      address: "Vellore",
      phone: "9876543210",
      bookNo: "12",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires a name", () => {
    const parsed = customerSchema.safeParse({ name: "  ", address: "", phone: "", bookNo: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejects the placeholder and allows a named walk-in", () => {
    expect(isUnrecordedName(" NOT RECORDED ")).toBe(true);
    expect(isUnrecordedName("Walk-in")).toBe(false);
    const blocked = customerSchema.safeParse({ name: "NOT RECORDED", address: "", phone: "", bookNo: "" });
    const walkIn = customerSchema.safeParse({ name: "Walk-in", address: "", phone: "", bookNo: "" });
    expect(blocked.success).toBe(false);
    expect(walkIn.success).toBe(true);
  });
});
