const STORAGE_KEY = "pi-gui:composer-history:v1";
const MAX_ENTRIES_PER_SESSION = 100;

type StoredHistory = Record<string, string[]>;

export function readComposerHistory(sessionKey: string): readonly string[] {
  if (!sessionKey || typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredHistory;
    return Array.isArray(parsed[sessionKey]) ? parsed[sessionKey].filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function rememberComposerHistory(sessionKey: string, prompt: string): void {
  const normalized = prompt.trim();
  if (!sessionKey || !normalized || typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredHistory;
    const existing = Array.isArray(parsed[sessionKey]) ? parsed[sessionKey] : [];
    parsed[sessionKey] = [...existing.filter((value) => value !== normalized), normalized].slice(-MAX_ENTRIES_PER_SESSION);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // History is an enhancement; storage denial must never block sending.
  }
}

export interface ComposerHistoryCursor {
  readonly index: number;
  readonly draft: string;
}

export function moveComposerHistory(
  history: readonly string[],
  cursor: ComposerHistoryCursor | null,
  direction: "older" | "newer",
  currentDraft: string,
): { readonly cursor: ComposerHistoryCursor | null; readonly value: string } | null {
  if (history.length === 0) return null;
  if (direction === "older") {
    const nextIndex = cursor ? Math.max(0, cursor.index - 1) : history.length - 1;
    if (cursor?.index === 0) return null;
    return { cursor: { index: nextIndex, draft: cursor?.draft ?? currentDraft }, value: history[nextIndex] ?? currentDraft };
  }
  if (!cursor) return null;
  const nextIndex = cursor.index + 1;
  if (nextIndex >= history.length) return { cursor: null, value: cursor.draft };
  return { cursor: { ...cursor, index: nextIndex }, value: history[nextIndex] ?? cursor.draft };
}
