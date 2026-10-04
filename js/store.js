// localStorage wrappers. Storage can throw (private mode, blocked site data),
// so every access is guarded and the app works without it.

const PREFIX = 'hub:';

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function save(key, value) {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* storage unavailable: keep going in memory */ }
}

// Last-known API results, so screens paint instantly and work offline.
// JSON turns Dates into ISO strings, so turn those back into Dates on the way out.
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
export function cached(key) {
  try {
    const raw = localStorage.getItem(`${PREFIX}cache:${key}`);
    return raw ? JSON.parse(raw, (k, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v)).data : null;
  } catch { return null; }
}
export const cache = (key, data) => save(`cache:${key}`, { at: Date.now(), data });

export function clearAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
