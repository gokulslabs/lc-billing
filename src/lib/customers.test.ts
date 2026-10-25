import { describe, expect, it } from "vitest";
import { customerSchema } from "./customers";

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
});
