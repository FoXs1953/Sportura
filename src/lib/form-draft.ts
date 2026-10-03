// Unsent form input kept only in this browser. Drafts are per account, expire
// a fixed time after the last edit, and are removed on submit and sign-out.
// Storage can be unavailable (private mode, blocked site data), so every
// access is optional: the form simply starts empty.
const PREFIX = "sportura.draft.";

type Stored<T> = { savedAt: number; value: T };

export function draftKey(form: string, userId: string) {
  return `${PREFIX}${form}.${userId}`;
}

export function loadDraft<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored<T>;
    if (
      typeof stored?.savedAt !== "number" ||
      Date.now() - stored.savedAt > maxAgeMs
    ) {
      localStorage.removeItem(key);
      return null;
    }
    return stored.value;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T) {
  try {
    const stored: Stored<T> = { savedAt: Date.now(), value };
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Full or blocked storage only means the draft is not kept.
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

/** Removes every draft on this device, e.g. when someone signs out. */
export function clearAllDrafts() {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
