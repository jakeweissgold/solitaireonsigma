const STORAGE_PREFIX = 'solitaire:v1:';

function storageKey(userId: string, gameKey: string): string {
  return `${STORAGE_PREFIX}${gameKey}:${userId}`;
}

/** Reads a previously saved value for this viewer under one game's key, or null if there isn't one (or it's corrupt). */
export function loadJSON<T>(userId: string, gameKey: string, isValid: (value: unknown) => value is T): T | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId, gameKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Saves a value so a reload can pick up where it left off. Fails silently if storage is unavailable. */
export function saveJSON(userId: string, gameKey: string, value: unknown): void {
  try {
    window.localStorage.setItem(storageKey(userId, gameKey), JSON.stringify(value));
  } catch {
    // Private browsing, a full quota, or a blocked storage API — the game
    // still works, it just won't survive a reload this time.
  }
}
