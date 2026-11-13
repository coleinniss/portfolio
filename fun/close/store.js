/*
 * No backend yet: everything lives in localStorage on this device.
 * Keys: user, space, usedInvites, items (keepsakes), outbox (offline queue),
 * page (shared doodle), answers (daily question, by date), ritualDraft, ink.
 */
const DEVICE_KEYS = ["user", "space", "usedInvites", "items", "outbox", "page", "answers", "ritualDraft", "ink"];

// localStorage can throw when storage is blocked or full; callers check set()'s result where data matters.
export const store = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  clear(...keys) {
    keys.forEach((k) => localStorage.removeItem(k));
  },
};

export const resetDevice = () => store.clear(...DEVICE_KEYS);

export const partner = () => store.get("space")?.partner ?? null;
export const partnerName = () => partner()?.name ?? "your partner";

export const isOnline = () => navigator.onLine;

export const addItem = (item) => store.set("items", [...store.get("items", []), item]);
export const queue = (item) => store.set("outbox", [...store.get("outbox", []), item]);
export const hasQueued = () => store.get("outbox", []).length > 0;

export function flushOutbox() {
  const outbox = store.get("outbox", []);
  if (!outbox.length) return;
  store.set("items", [...store.get("items", []), ...outbox]);
  store.clear("outbox");
}
