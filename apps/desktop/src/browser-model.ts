/** Keep in sync with right-rail-model MAX_BROWSER_URL_LENGTH. */
const MAX_BROWSER_URL_LENGTH = 8 * 1024;

export interface BrowserTarget {
  readonly workspaceId: string;
  readonly sessionId: string;
}

export interface BrowserBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BrowserStateSnapshot {
  readonly target: BrowserTarget;
  readonly url: string;
  readonly title: string;
  readonly loading: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly visible: boolean;
  readonly crashed: boolean;
  readonly designMode: boolean;
  readonly selectedElement?: BrowserElementSelection;
  readonly error?: {
    readonly code: number;
    readonly description: string;
    readonly validatedUrl?: string;
  };
}

export interface BrowserElementSelection {
  readonly url: string;
  readonly tagName: string;
  readonly id?: string;
  readonly classNames: readonly string[];
  readonly text: string;
  readonly cssPath: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface BrowserSelectionCapture {
  readonly data: string;
  readonly mimeType: "image/png";
  readonly width: number;
  readonly height: number;
  readonly selector: string;
}

export interface BrowserNavigateInput extends BrowserTarget {
  readonly url: string;
  readonly source: "address-bar" | "link" | "agent";
}

export type BrowserPermissionKind =
  | "media"
  | "geolocation"
  | "notifications"
  | "clipboard-read"
  | "unknown";

export interface BrowserPermissionRequest {
  readonly id: string;
  readonly permission: BrowserPermissionKind;
  readonly origin: string;
}

export type BrowserPermissionResponse = {
  readonly id: string;
  readonly allow: boolean;
};

export type NormalizeBrowserUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly error: string };

const ALLOWED_MAIN_FRAME_SCHEMES = new Set(["http:", "https:"]);
const INTERNAL_BLANK = "about:blank";

export const BROWSER_SESSION_PARTITION = "persist:pi-gui-browser";
export const DOWNLOADS_UNSUPPORTED_MESSAGE = "Downloads are not supported yet";

export function createEmptyBrowserState(target: BrowserTarget = { workspaceId: "", sessionId: "" }): BrowserStateSnapshot {
  return {
    target,
    url: "",
    title: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    visible: false,
    crashed: false,
    designMode: false,
  };
}

/**
 * Normalize user/agent navigation input.
 * - about:blank is allowed as an internal initial page
 * - host-like inputs get https://
 * - only http/https main-frame navigations are accepted
 */
export function normalizeBrowserUrl(rawInput: string): NormalizeBrowserUrlResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a URL" };
  }
  if (trimmed.length > MAX_BROWSER_URL_LENGTH) {
    return { ok: false, error: "URL is too long" };
  }
  if (trimmed.toLowerCase() === INTERNAL_BLANK) {
    return { ok: true, url: INTERNAL_BLANK };
  }

  let candidate = trimmed;
  // Treat host:port (e.g. localhost:8080) as a hostname, not a custom scheme.
  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)
    || /^about:/i.test(candidate)
    || /^(javascript|data|blob|file|devtools|chrome|chrome-extension):/i.test(candidate);
  if (!hasExplicitScheme) {
    if (looksLikeHostname(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return { ok: false, error: "Enter a valid http(s) URL" };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "Enter a valid http(s) URL" };
  }

  if (parsed.protocol === "about:" && parsed.pathname === "blank") {
    return { ok: true, url: INTERNAL_BLANK };
  }

  if (!ALLOWED_MAIN_FRAME_SCHEMES.has(parsed.protocol)) {
    return { ok: false, error: `Scheme not allowed: ${parsed.protocol.replace(/:$/, "")}` };
  }

  if (!parsed.hostname) {
    return { ok: false, error: "Enter a valid http(s) URL" };
  }

  return { ok: true, url: parsed.toString() };
}

export function isAllowedBrowserNavigationUrl(url: string): boolean {
  return normalizeBrowserUrl(url).ok;
}

export function clampBrowserBounds(
  bounds: BrowserBounds,
  contentBounds: { readonly width: number; readonly height: number },
): BrowserBounds {
  const width = Math.max(0, Math.min(Math.round(bounds.width), Math.max(0, Math.round(contentBounds.width))));
  const height = Math.max(0, Math.min(Math.round(bounds.height), Math.max(0, Math.round(contentBounds.height))));
  const x = Math.max(0, Math.min(Math.round(bounds.x), Math.max(0, Math.round(contentBounds.width) - width)));
  const y = Math.max(0, Math.min(Math.round(bounds.y), Math.max(0, Math.round(contentBounds.height) - height)));
  return { x, y, width, height };
}

export function isValidBrowserBounds(value: unknown): value is BrowserBounds {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Number.isFinite(candidate.width) &&
    Number.isFinite(candidate.height) &&
    (candidate.width as number) >= 0 &&
    (candidate.height as number) >= 0
  );
}

/** MVP: deny every permission request. */
export function shouldAllowBrowserPermission(_permission: string): boolean {
  return false;
}

/** MVP: never create popup windows; same-panel navigation may reuse the validated URL. */
export function resolveBrowserPopupAction(url: string): { readonly action: "deny" } | { readonly action: "navigate-same"; readonly url: string } {
  const normalized = normalizeBrowserUrl(url);
  if (!normalized.ok) {
    return { action: "deny" };
  }
  return { action: "navigate-same", url: normalized.url };
}

function looksLikeHostname(value: string): boolean {
  if (value.includes(" ") || value.includes("\\")) {
    return false;
  }
  if (value.startsWith(".") || value.endsWith(".")) {
    return false;
  }
  // localhost, IPv4, or dotted hostname with a TLD-like segment
  if (value === "localhost" || value.startsWith("localhost:") || value.startsWith("127.0.0.1") || value.startsWith("[::1]")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value)) {
    return true;
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(value);
}
