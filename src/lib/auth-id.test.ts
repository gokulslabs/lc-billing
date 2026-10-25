import { describe, expect, it } from "vitest";
import { signInEmail } from "./auth-id";

describe("signInEmail", () => {
  it("keeps an email address", () => {
    expect(signInEmail("  Ada@Shop.example ")).toBe("ada@shop.example");
  });

  it("turns a mobile number into the staff email", () => {
    expect(signInEmail("97881 81666")).toBe("9788181666@staff.ladiescollections.local");
  });
});