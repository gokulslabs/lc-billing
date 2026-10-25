import { describe, expect, it } from "vitest";
import { passwordProblem } from "./password";

describe("passwordProblem", () => {
  it("rejects a phone number as password", () => {
    expect(passwordProblem("9788181666")).not.toBeNull();
  });
  it("rejects passwords shorter than 10 characters", () => {
    expect(passwordProblem("abc12345")).not.toBeNull();
  });
  it("rejects passwords containing the email name", () => {
    expect(passwordProblem("vishal2026abc", "vishal@shop.com")).not.toBeNull();
  });
  it("accepts a long mixed password", () => {
    expect(passwordProblem("RoseSilk2026", "owner@shop.com")).toBeNull();
  });
});
