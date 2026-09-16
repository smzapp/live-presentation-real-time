export interface ActiveSessionRecord {
  code: string;
  title: string;
  startedAt: number;
}

const STORAGE_KEY = "livepresentation:activeSession";
// sessionStorage writes don't fire the native `storage` event in the SAME
// tab that made them (only other tabs get that) — this custom event lets
// same-tab listeners (the banner) react immediately anyway.
export const ACTIVE_SESSION_EVENT = "livepresentation:active-session-changed";

export function getActiveSession(): ActiveSessionRecord | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSessionRecord;
  } catch {
    return null;
  }
}

export function setActiveSession(record: ActiveSessionRecord) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  window.dispatchEvent(new Event(ACTIVE_SESSION_EVENT));
}

export function clearActiveSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(ACTIVE_SESSION_EVENT));
}
