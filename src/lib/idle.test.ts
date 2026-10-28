import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MINUTES, IDLE_TIMEOUT_MS, IDLE_WARNING_MS, idlePhase, idleWarningText, readLastActivity } from "./idle";

describe("idlePhase", () => {
  it("warns two minutes before logout and logs out at the limit", () => {
    expect(IDLE_TIMEOUT_MINUTES).toBe(30);
    expect(IDLE_WARNING_MS).toBe(28 * 60 * 1000);
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(idlePhase(IDLE_WARNING_MS - 1)).toBe("active");
    expect(idlePhase(IDLE_WARNING_MS)).toBe("warning");
    expect(idlePhase(IDLE_TIMEOUT_MS - 1)).toBe("warning");
    expect(idlePhase(IDLE_TIMEOUT_MS)).toBe("expired");
  });

  it("keeps the existing idle clock across a page load", () => {
    const started = Date.now() - 20 * 60 * 1000;
    sessionStorage.setItem("lc-last-activity", String(started));
    expect(readLastActivity()).toBe(started);
  });

  it("stays active while the idle time is reset", () => {
    const started = 1_000_000;
    const activeAt = started + 10 * 60 * 1000;
    expect(idlePhase(activeAt - started)).toBe("active");
    expect(idlePhase(activeAt - activeAt)).toBe("active");
  });
});

describe("idleWarningText", () => {
  it("names the unsaved bill or order before logout", () => {
    expect(idleWarningText(false)).toBe("You will be logged out in 2 minutes due to inactivity.");
    expect(idleWarningText(true)).toContain("You will be logged out in 2 minutes due to inactivity.");
    expect(idleWarningText(true)).toContain("not saved");
    expect(idleWarningText(true)).toContain("will be lost");
  });
});
