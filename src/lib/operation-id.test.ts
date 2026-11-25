import { afterEach, describe, expect, it } from "vitest";
import { completeOperation, operationId } from "./operation-id";

describe("operationId", () => {
  afterEach(() => {
    completeOperation("bill|IN1|1");
    completeOperation("bill|IN1|2");
  });

  it("reuses the id until the attempt succeeds", () => {
    const first = operationId("bill|IN1|1");
    expect(operationId("bill|IN1|1")).toBe(first);
    completeOperation("bill|IN1|1");
    expect(operationId("bill|IN1|1")).not.toBe(first);
  });

  it("starts a new id when the payload changes", () => {
    const first = operationId("bill|IN1|1");
    expect(operationId("bill|IN1|2")).not.toBe(first);
  });
});
