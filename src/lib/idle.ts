export const IDLE_TIMEOUT_MINUTES = 30;
export const IDLE_WARNING_LEAD_MINUTES = 2;

export const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
export const IDLE_WARNING_MS = (IDLE_TIMEOUT_MINUTES - IDLE_WARNING_LEAD_MINUTES) * 60 * 1000;

const STORAGE_KEY = "lc-last-activity";

export type IdlePhase = "active" | "warning" | "expired";

export function idlePhase(idleMs: number): IdlePhase {
  if (idleMs >= IDLE_TIMEOUT_MS) return "expired";
  if (idleMs >= IDLE_WARNING_MS) return "warning";
  return "active";
}

export function idleWarningText(unsaved: boolean): string {
  const lead = `You will be logged out in ${IDLE_WARNING_LEAD_MINUTES} minutes due to inactivity.`;
  if (!unsaved) return lead;
  return `${lead} A bill or stitching order has entries that are not saved. Those entries will be lost. Anything already saved stays.`;
}

export function readLastActivity(now = Date.now()): number {
  if (typeof sessionStorage === "undefined") return now;
  const stored = Number(sessionStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(stored) && stored > 0) return stored;
  sessionStorage.setItem(STORAGE_KEY, String(now));
  return now;
}

export function recordActivity(now = Date.now()) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, String(now));
}

export function clearActivity() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
