import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  createEmptyBrowserState,
  normalizeBrowserUrl,
  type BrowserStateSnapshot,
  type BrowserTarget,
} from "./browser-model";
import { CloseIcon, RefreshIcon } from "./icons";

export interface BrowserPanelProps {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly rememberedUrl?: string;
  readonly onRememberUrl?: (url: string) => void;
}

export function BrowserPanel({
  workspaceId,
  sessionId,
  rememberedUrl,
  onRememberUrl,
}: BrowserPanelProps) {
  const api = window.piApp as BrowserPanelApi | undefined;
  const target: BrowserTarget = { workspaceId, sessionId };
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const editingRef = useRef(false);
  const boundsRafRef = useRef<number | null>(null);
  const lastBoundsRef = useRef<string>("");

  const [state, setState] = useState<BrowserStateSnapshot>(() =>
    createEmptyBrowserState(target),
  );
  const [addressValue, setAddressValue] = useState(rememberedUrl ?? "");
  const [addressError, setAddressError] = useState("");
  const [chromeError, setChromeError] = useState("");

  const applyState = useCallback((next: BrowserStateSnapshot) => {
    if (next.target.workspaceId !== workspaceId || next.target.sessionId !== sessionId) {
      return;
    }
    setState(next);
    if (!editingRef.current) {
      setAddressValue(next.url || rememberedUrl || "");
    }
    if (next.error?.description) {
      setChromeError(next.error.description);
    } else if (next.crashed) {
      setChromeError("Page crashed");
    } else {
      setChromeError("");
    }
  }, [rememberedUrl, sessionId, workspaceId]);

  const publishBounds = useCallback(() => {
    const apiLocal = api;
    const viewport = viewportRef.current;
    if (!apiLocal?.setBrowserBounds || !viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height)),
    };
    const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
    if (key === lastBoundsRef.current) {
      return;
    }
    lastBoundsRef.current = key;
    void apiLocal.setBrowserBounds(bounds);
  }, [api]);

  const scheduleBounds = useCallback(() => {
    if (boundsRafRef.current != null) {
      return;
    }
    boundsRafRef.current = window.requestAnimationFrame(() => {
      boundsRafRef.current = null;
      publishBounds();
    });
  }, [publishBounds]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const panelTarget: BrowserTarget = { workspaceId, sessionId };

    void (async () => {
      if (!api?.ensureBrowserPanel) {
        return;
      }
      try {
        const next = await api.ensureBrowserPanel(panelTarget);
        if (cancelled) {
          return;
        }
        applyState(next);
        if (rememberedUrl && !next.url) {
          const normalized = normalizeBrowserUrl(rememberedUrl);
          if (normalized.ok && api.navigateBrowser) {
            const navigated = await api.navigateBrowser({
              ...panelTarget,
              url: normalized.url,
              source: "address-bar",
            });
            if (!cancelled) {
              applyState(navigated);
            }
          }
        }
        publishBounds();
        await api.setBrowserVisible?.(true, panelTarget);
      } catch (error) {
        if (!cancelled) {
          setChromeError(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    if (api?.onBrowserStateChanged) {
      unsubscribe = api.onBrowserStateChanged((next) => {
        if (!cancelled) {
          applyState(next);
        }
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (boundsRafRef.current != null) {
        window.cancelAnimationFrame(boundsRafRef.current);
        boundsRafRef.current = null;
      }
      // Hide native surface synchronously on unmount.
      void api?.setBrowserVisible?.(false, panelTarget);
    };
  }, [api, applyState, publishBounds, rememberedUrl, sessionId, workspaceId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      scheduleBounds();
    });
    observer.observe(viewport);
    scheduleBounds();
    window.addEventListener("resize", scheduleBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBounds);
    };
  }, [scheduleBounds]);

  useEffect(() => {
    // Keep the native view aligned when chrome reflows (title/error lines).
    scheduleBounds();
  }, [addressError, chromeError, scheduleBounds, state.loading, state.title]);

  const navigateToAddress = useCallback(async () => {
    if (!api?.navigateBrowser) {
      setAddressError("Browser is not available");
      return;
    }
    const normalized = normalizeBrowserUrl(addressValue);
    if (!normalized.ok) {
      setAddressError(normalized.error);
      return;
    }
    setAddressError("");
    editingRef.current = false;
    addressInputRef.current?.blur();
    try {
      const next = await api.navigateBrowser({
        ...target,
        url: normalized.url,
        source: "address-bar",
      });
      applyState(next);
      onRememberUrl?.(normalized.url);
      setAddressValue(normalized.url);
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : String(error));
    }
  }, [addressValue, api, applyState, onRememberUrl, sessionId, workspaceId]);

  const handleAddressSubmit = (event: FormEvent) => {
    event.preventDefault();
    void navigateToAddress();
  };

  const handleAddressKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      editingRef.current = false;
      setAddressError("");
      setAddressValue(state.url || rememberedUrl || "");
      addressInputRef.current?.blur();
    }
  };

  const runNav = async (action: () => Promise<BrowserStateSnapshot> | undefined) => {
    try {
      const next = await action();
      if (next) {
        applyState(next);
      }
    } catch (error) {
      setChromeError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleBack = () => {
    if (!api?.browserBack || !state.canGoBack) {
      return;
    }
    void runNav(() => api.browserBack!(target));
  };

  const handleForward = () => {
    if (!api?.browserForward || !state.canGoForward) {
      return;
    }
    void runNav(() => api.browserForward!(target));
  };

  const handleReloadOrStop = () => {
    if (state.loading) {
      if (!api?.browserStop) {
        return;
      }
      void runNav(() => api.browserStop!(target));
      return;
    }
    if (!api?.browserReload) {
      return;
    }
    void runNav(() => api.browserReload!(target));
  };

  const handleOpenExternal = () => {
    if (api?.openBrowserExternal) {
      void api.openBrowserExternal();
      return;
    }
    const url = state.url || addressValue;
    if (url && api?.openExternal) {
      void api.openExternal(url);
    }
  };

  const handleDesignMode = () => {
    if (!api?.setBrowserDesignMode) return;
    void runNav(() => api.setBrowserDesignMode!(target, !state.designMode));
  };

  const statusLabel = state.loading
    ? "Loading…"
    : state.crashed
      ? "Crashed"
      : state.title || state.url || "New page";

  return (
    <section className="browser-panel" data-testid="integrated-browser" data-pi-browser="true">
      <div className="browser-panel__toolbar">
        <div className="browser-panel__nav">
          <button
            type="button"
            className="icon-button browser-panel__nav-button"
            title="Back"
            aria-label="Back"
            disabled={!state.canGoBack}
            onClick={handleBack}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className="icon-button browser-panel__nav-button"
            title="Forward"
            aria-label="Forward"
            disabled={!state.canGoForward}
            onClick={handleForward}
          >
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className="icon-button browser-panel__nav-button"
            title={state.loading ? "Stop" : "Reload"}
            aria-label={state.loading ? "Stop" : "Reload"}
            onClick={handleReloadOrStop}
          >
            {state.loading ? <CloseIcon /> : <RefreshIcon />}
          </button>
        </div>

        <form className="browser-panel__address-form" onSubmit={handleAddressSubmit}>
          <input
            ref={addressInputRef}
            className="browser-panel__address"
            data-testid="browser-address"
            type="text"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Enter URL"
            value={addressValue}
            aria-label="Address"
            aria-invalid={addressError ? true : undefined}
            onChange={(event) => {
              editingRef.current = true;
              setAddressValue(event.target.value);
              if (addressError) {
                setAddressError("");
              }
            }}
            onFocus={() => {
              editingRef.current = true;
            }}
            onBlur={() => {
              editingRef.current = false;
            }}
            onKeyDown={handleAddressKeyDown}
          />
        </form>

        <div className="browser-panel__meta" title={statusLabel}>
          <span className="browser-panel__title">{statusLabel}</span>
        </div>

        <div className="browser-panel__actions">
          <button
            type="button"
            className={`browser-panel__design-toggle${state.designMode ? " browser-panel__design-toggle--active" : ""}`}
            aria-pressed={state.designMode}
            data-testid="browser-design-mode"
            title="Select an element to add as design context"
            onClick={handleDesignMode}
          >
            {state.designMode ? "Selecting…" : "Design"}
          </button>
          <button
            type="button"
            className="icon-button browser-panel__action"
            title="Open in external browser"
            aria-label="Open in external browser"
            disabled={!state.url && !addressValue}
            onClick={handleOpenExternal}
          >
            <ExternalLinkIcon />
          </button>
        </div>
      </div>

      {addressError || chromeError ? (
        <div className="browser-panel__error" data-testid="browser-error" role="alert">
          {addressError || chromeError}
        </div>
      ) : null}

      {state.designMode ? (
        <div className="browser-panel__design-hint" data-testid="browser-design-hint">
          Hover the page, then click an element to capture its design context. Press Design again to cancel.
        </div>
      ) : null}

      {state.selectedElement ? (
        <div className="browser-panel__selection" data-testid="browser-design-selection">
          <span className="browser-panel__selection-label">Selected</span>
          <code>{state.selectedElement.cssPath}</code>
          {state.selectedElement.text ? <span>{state.selectedElement.text}</span> : null}
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(
              `Design context: ${state.selectedElement!.tagName} at ${state.selectedElement!.cssPath}\nText: ${state.selectedElement!.text}\nURL: ${state.selectedElement!.url}`,
            )}
          >Copy context</button>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className="browser-panel__viewport-anchor"
        data-testid="browser-viewport-anchor"
      />
    </section>
  );
}

function ExternalLinkIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d="M8.2 5.2H5.6A1.6 1.6 0 0 0 4 6.8v7.6A1.6 1.6 0 0 0 5.6 16h7.6a1.6 1.6 0 0 0 1.6-1.6v-2.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M11.2 4h4.8v4.8M15.8 4.2 9.4 10.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** Subset of PiDesktopApi used by the browser chrome; optional for gradual preload rollout. */
interface BrowserPanelApi {
  readonly ensureBrowserPanel?: (target: BrowserTarget) => Promise<BrowserStateSnapshot>;
  readonly navigateBrowser?: (input: {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly url: string;
    readonly source: "address-bar" | "link" | "agent";
  }) => Promise<BrowserStateSnapshot>;
  readonly browserBack?: (target: BrowserTarget) => Promise<BrowserStateSnapshot>;
  readonly browserForward?: (target: BrowserTarget) => Promise<BrowserStateSnapshot>;
  readonly browserReload?: (target: BrowserTarget) => Promise<BrowserStateSnapshot>;
  readonly browserStop?: (target: BrowserTarget) => Promise<BrowserStateSnapshot>;
  readonly setBrowserDesignMode?: (target: BrowserTarget, enabled: boolean) => Promise<BrowserStateSnapshot>;
  readonly setBrowserBounds?: (bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }) => Promise<void>;
  readonly setBrowserVisible?: (visible: boolean, target?: BrowserTarget) => Promise<void>;
  readonly openBrowserExternal?: () => Promise<void>;
  readonly openExternal?: (url: string) => Promise<void>;
  readonly onBrowserStateChanged?: (listener: (state: BrowserStateSnapshot) => void) => () => void;
}
