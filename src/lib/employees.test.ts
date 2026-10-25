import { describe, expect, it } from "vitest";
import { createEmployeeSchema, wouldRemoveLastAdmin } from "./employees";

describe("createEmployeeSchema", () => {
  it("accepts a staff account", () => {
    const parsed = createEmployeeSchema.safeParse({
      fullName: "Meera",
      email: "meera@shop.com",
      password: "RoseSilk2026",
      mobile: "9876543210",
      department: "SALES",
      gender: "FEMALE",
      address: "Vellore",
      role: "staff",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown department", () => {
    const parsed = createEmployeeSchema.safeParse({
      fullName: "Meera",
      email: "meera@shop.com",
      password: "RoseSilk2026",
      mobile: "",
      department: "CASHIER",
      gender: "",
      address: "",
      role: "staff",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("wouldRemoveLastAdmin", () => {
  it("blocks demoting the only admin", () => {
    expect(wouldRemoveLastAdmin(["owner"], "owner", "staff")).toBe(true);
  });

  it("allows demoting an admin when another admin remains", () => {
    expect(wouldRemoveLastAdmin(["owner", "second"], "owner", "staff")).toBe(false);
  });
});
