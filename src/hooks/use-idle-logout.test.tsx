import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleLogout } from "./use-idle-logout";
import { markUnsaved } from "@/lib/unsaved";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/lib/idle";

function Probe({ onExpire }: { onExpire: () => void }) {
  const idle = useIdleLogout(true, onExpire);
  return (
    <div>
      <p>{idle.warning ? (idle.unsaved ? "unsaved" : "warning") : "quiet"}</p>
      <button type="button" onClick={idle.stay}>
        Stay logged in
      </button>
    </div>
  );
}

describe("useIdleLogout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    markUnsaved("bill-line", false);
  });

  it("warns at 28 minutes and signs out at 30", () => {
    const onExpire = vi.fn();
    sessionStorage.setItem("lc-last-activity", String(Date.now() - IDLE_WARNING_MS));
    render(<Probe onExpire={onExpire} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("paragraph").textContent).toBe("warning");
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("does not sign out while the counter keeps working", () => {
    const onExpire = vi.fn();
    sessionStorage.setItem("lc-last-activity", String(Date.now() - (IDLE_TIMEOUT_MS - 1000)));
    render(<Probe onExpire={onExpire} />);
    act(() => {
      window.dispatchEvent(new Event("keydown"));
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.getByRole("paragraph").textContent).toBe("quiet");
  });

  it("resets the timer from Stay logged in", () => {
    const onExpire = vi.fn();
    sessionStorage.setItem("lc-last-activity", String(Date.now() - IDLE_WARNING_MS));
    render(<Probe onExpire={onExpire} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      screen.getByRole("button", { name: "Stay logged in" }).click();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("paragraph").textContent).toBe("quiet");
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("mentions unsaved bill entries on the warning", () => {
    markUnsaved("bill-line", true);
    sessionStorage.setItem("lc-last-activity", String(Date.now() - IDLE_WARNING_MS));
    render(<Probe onExpire={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("paragraph").textContent).toBe("unsaved");
  });
});
