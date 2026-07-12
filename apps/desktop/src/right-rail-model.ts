export type RightRailMode = "changes" | "files" | "terminal" | "browser";

export interface RightRailSessionState {
  readonly open: boolean;
  readonly mode: RightRailMode;
  readonly takeover: boolean;
  readonly browserUrl?: string;
}

export interface RightRailPreferences {
  readonly width: number;
  readonly lastMode: RightRailMode;
  readonly bySession: Readonly<Record<string, RightRailSessionState>>;
}

export interface RightRailPanelDefinition {
  readonly id: RightRailMode;
  readonly label: string;
  readonly testId: string;
  readonly requiresThread: boolean;
  readonly supportsTakeover: boolean;
  readonly nativeSurface: boolean;
}

export const DEFAULT_RIGHT_RAIL_WIDTH = 420;
export const MIN_RIGHT_RAIL_WIDTH = 320;
export const MAX_RIGHT_RAIL_WIDTH = 840;
export const CONVERSATION_MIN_WIDTH = 420;
export const MAX_BROWSER_URL_LENGTH = 8 * 1024;
export const MAX_RIGHT_RAIL_SESSION_ENTRIES = 200;

export const rightRailPanels: readonly RightRailPanelDefinition[] = [
  { id: "changes", label: "Changes", testId: "right-rail-mode-changes", requiresThread: true, supportsTakeover: true, nativeSurface: false },
  { id: "files", label: "Files", testId: "right-rail-mode-files", requiresThread: true, supportsTakeover: true, nativeSurface: false },
  { id: "terminal", label: "Terminal", testId: "right-rail-mode-terminal", requiresThread: true, supportsTakeover: true, nativeSurface: false },
  { id: "browser", label: "Browser", testId: "right-rail-mode-browser", requiresThread: true, supportsTakeover: true, nativeSurface: true },
];

export const RIGHT_RAIL_MODES: readonly RightRailMode[] = ["changes", "files", "terminal", "browser"];

export function isRightRailMode(value: unknown): value is RightRailMode {
  return value === "changes" || value === "files" || value === "terminal" || value === "browser";
}

export function createDefaultRightRailPreferences(): RightRailPreferences {
  return {
    width: DEFAULT_RIGHT_RAIL_WIDTH,
    lastMode: "changes",
    bySession: {},
  };
}

export function createDefaultRightRailSessionState(mode: RightRailMode = "changes"): RightRailSessionState {
  return {
    open: false,
    mode,
    takeover: false,
  };
}

export function clampRightRailWidth(width: number, viewportWidth = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_RIGHT_RAIL_WIDTH;
  }
  const maxForViewport = Number.isFinite(viewportWidth)
    ? Math.max(MIN_RIGHT_RAIL_WIDTH, viewportWidth - CONVERSATION_MIN_WIDTH)
    : MAX_RIGHT_RAIL_WIDTH;
  const maxWidth = Math.min(MAX_RIGHT_RAIL_WIDTH, maxForViewport);
  return Math.min(maxWidth, Math.max(MIN_RIGHT_RAIL_WIDTH, Math.round(width)));
}

/**
 * Toggle or switch the primary rail mode.
 * - Same mode while open → close
 * - Different mode → open that mode
 * - Closed + any mode → open that mode
 */
export function applyRightRailModeToggle(
  current: RightRailSessionState,
  mode: RightRailMode,
): RightRailSessionState {
  if (current.open && current.mode === mode) {
    return {
      ...current,
      open: false,
      takeover: false,
    };
  }
  return {
    ...current,
    open: true,
    mode,
    takeover: current.open ? current.takeover : false,
  };
}

export function applyRightRailClose(current: RightRailSessionState): RightRailSessionState {
  if (!current.open && !current.takeover) {
    return current;
  }
  return {
    ...current,
    open: false,
    takeover: false,
  };
}

export function applyRightRailTakeoverToggle(current: RightRailSessionState): RightRailSessionState {
  if (!current.open) {
    return current;
  }
  return {
    ...current,
    takeover: !current.takeover,
  };
}

export function getRightRailSessionState(
  preferences: RightRailPreferences,
  sessionKey: string,
): RightRailSessionState {
  const existing = preferences.bySession[sessionKey];
  if (!existing) {
    return createDefaultRightRailSessionState(preferences.lastMode);
  }
  return existing;
}

export function setRightRailSessionState(
  preferences: RightRailPreferences,
  sessionKey: string,
  sessionState: RightRailSessionState,
): RightRailPreferences {
  if (!sessionKey) {
    return preferences;
  }
  const nextBySession = { ...preferences.bySession, [sessionKey]: sessionState };
  return {
    width: preferences.width,
    lastMode: sessionState.open ? sessionState.mode : preferences.lastMode,
    bySession: pruneRightRailSessionMap(nextBySession),
  };
}

export function pruneRightRailSessionMap(
  bySession: Readonly<Record<string, RightRailSessionState>>,
  activeKeys?: ReadonlySet<string>,
): Record<string, RightRailSessionState> {
  const entries = Object.entries(bySession).filter(([key, value]) => {
    if (!key || !value) {
      return false;
    }
    if (activeKeys && !activeKeys.has(key)) {
      return false;
    }
    return true;
  });

  if (entries.length <= MAX_RIGHT_RAIL_SESSION_ENTRIES) {
    return Object.fromEntries(entries);
  }

  // Prefer keeping open rails; then keep the most recently listed entries.
  const open = entries.filter(([, state]) => state.open);
  const closed = entries.filter(([, state]) => !state.open);
  const retained = [
    ...open.slice(-MAX_RIGHT_RAIL_SESSION_ENTRIES),
    ...closed,
  ].slice(-MAX_RIGHT_RAIL_SESSION_ENTRIES);
  return Object.fromEntries(retained);
}

export function decodeRightRailPreferences(value: unknown): RightRailPreferences {
  if (!value || typeof value !== "object") {
    return createDefaultRightRailPreferences();
  }
  const candidate = value as Record<string, unknown>;
  const width = clampRightRailWidth(typeof candidate.width === "number" ? candidate.width : DEFAULT_RIGHT_RAIL_WIDTH);
  const lastMode = isRightRailMode(candidate.lastMode) ? candidate.lastMode : "changes";
  const bySessionRaw = candidate.bySession;
  const bySession: Record<string, RightRailSessionState> = {};
  if (bySessionRaw && typeof bySessionRaw === "object" && !Array.isArray(bySessionRaw)) {
    for (const [key, entry] of Object.entries(bySessionRaw as Record<string, unknown>)) {
      if (!key || !entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const mode = isRightRailMode(record.mode) ? record.mode : lastMode;
      const browserUrl =
        typeof record.browserUrl === "string" && record.browserUrl.length <= MAX_BROWSER_URL_LENGTH
          ? record.browserUrl
          : undefined;
      bySession[key] = {
        open: record.open === true,
        mode,
        takeover: record.takeover === true,
        ...(browserUrl ? { browserUrl } : {}),
      };
    }
  }
  return {
    width,
    lastMode,
    bySession: pruneRightRailSessionMap(bySession),
  };
}
