import { describe, expect, it } from "vitest";
import { missingOperation, requestHash } from "./idempotency";

describe("sale idempotency", () => {
  it("hashes the same sale the same way", () => {
    expect(requestHash(["bill", "IN1", 2.5, 220])).toBe(requestHash(["bill", "IN1", 2.5, 220]));
    expect(requestHash(["bill", "IN1", 2.5, 220])).not.toBe(requestHash(["bill", "IN1", 3, 220]));
  });

  it("treats a missing database function as not yet migrated", () => {
    expect(missingOperation({ code: "PGRST202", message: "Could not find the function" })).toBe(
      true,
    );
    expect(missingOperation({ code: "PT409", message: "Stock changed. Try the line again." })).toBe(
      false,
    );
  });
});
