import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import type { WorkspaceRecord } from "./desktop-state";
import { CloseIcon, MaximizeIcon, MinimizeIcon, PlusIcon, RefreshIcon } from "./icons";
import type { TerminalPanelSnapshot, TerminalSessionSnapshot, TerminalSize } from "./ipc";
import { appendTerminalReplay } from "./terminal-model";

interface TerminalPanelProps {
  readonly workspace: WorkspaceRecord;
  readonly sessionId: string;
  readonly isTakeover: boolean;
  readonly onToggleTakeover: () => void;
  readonly onHide: () => void;
}

export function TerminalPanel({
  workspace,
  sessionId,
  isTakeover,
  onToggleTakeover,
  onHide,
}: TerminalPanelProps) {
  const api = window.piApp;
  const panelRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const activeTerminalIdRef = useRef("");
  const lastSizeRef = useRef<TerminalSize>({ cols: 80, rows: 24 });
  const [panel, setPanel] = useState<TerminalPanelSnapshot | null>(null);
  const [error, setError] = useState<string>("");

  const activeSession = useMemo(
    () => panel?.sessions.find((session) => session.id === panel.activeSessionId),
    [panel],
  );

  const requestPanel = useCallback(async () => {
    if (!api) {
      return null;
    }
    try {
      const nextPanel = await api.ensureTerminalPanel(workspace.id, sessionId, lastSizeRef.current);
      setPanel(nextPanel);
      setError("");
      return nextPanel;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [api, sessionId, workspace.id]);

  useEffect(() => {
    setPanel(null);
    setError("");
    void requestPanel();
  }, [requestPanel]);

  const createTerminal = useCallback(async () => {
    if (!api) {
      return;
    }
    const nextPanel = await api.createTerminalSession(workspace.id, sessionId, lastSizeRef.current);
    setPanel(nextPanel);
  }, [api, sessionId, workspace.id]);

  const setActiveTerminal = useCallback(async (terminalId: string) => {
    if (!api) {
      return;
    }
    const nextPanel = await api.setActiveTerminalSession(workspace.id, sessionId, terminalId);
    setPanel(nextPanel);
  }, [api, sessionId, workspace.id]);

  const closeTerminal = useCallback(async (terminalId: string) => {
    if (!api) {
      return;
    }
    const nextPanel = await api.closeTerminalSession(terminalId);
    if (nextPanel) {
      setPanel(nextPanel);
    } else {
      setPanel(null);
      onHide();
    }
  }, [api, onHide]);

  const restartTerminal = useCallback(async () => {
    if (!api || !activeSession) {
      return;
    }
    const nextPanel = await api.restartTerminalSession(activeSession.id, lastSizeRef.current);
    terminalRef.current?.reset();
    setPanel(nextPanel);
  }, [activeSession, api]);

  const fitAndResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const terminalId = activeTerminalIdRef.current;
    const container = containerRef.current;
    if (!api || !terminalId || !terminal || !fitAddon || !container) {
      return;
    }
    // Skip fit while the rail has not laid out yet — FitAddon can report 0×0 and
    // a zero-size PTY resize leaves shells unresponsive until a later good fit.
    if (container.clientWidth < 20 || container.clientHeight < 20) {
      return;
    }
    fitAddon.fit();
    const nextSize = {
      cols: Math.max(2, terminal.cols),
      rows: Math.max(1, terminal.rows),
    };
    if (nextSize.cols === lastSizeRef.current.cols && nextSize.rows === lastSizeRef.current.rows) {
      return;
    }
    lastSizeRef.current = nextSize;
    void api.resizeTerminal(terminalId, nextSize);
  }, [api]);

  useEffect(() => {
    const panelElement = panelRef.current;
    if (!api || !panelElement) {
      return undefined;
    }
    const markFocused = () => {
      void api.setTerminalFocused(true);
    };
    const markBlurred = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && panelElement.contains(event.relatedTarget)) {
        return;
      }
      void api.setTerminalFocused(false);
    };
    panelElement.addEventListener("focusin", markFocused);
    panelElement.addEventListener("focusout", markBlurred);
    return () => {
      panelElement.removeEventListener("focusin", markFocused);
      panelElement.removeEventListener("focusout", markBlurred);
      void api.setTerminalFocused(false);
    };
  }, [api]);

  useEffect(() => {
    if (!api) {
      return undefined;
    }
    const removeData = api.onTerminalData((event) => {
      setPanel((currentPanel) => updateSession(currentPanel, event.terminalId, (session) => ({
        ...session,
        ...appendTerminalReplay(session.replay, event.data, session.truncated),
      })));
      if (event.terminalId === activeTerminalIdRef.current) {
        terminalRef.current?.write(event.data);
      }
    });
    const removeExit = api.onTerminalExit((event) => {
      setPanel((currentPanel) => updateSession(currentPanel, event.terminalId, (session) => ({
        ...session,
        status: "exited",
        exitCode: event.exitCode,
        signal: event.signal,
      })));
    });
    const removeError = api.onTerminalError((event) => {
      setPanel((currentPanel) => updateSession(currentPanel, event.terminalId, (session) => ({
        ...session,
        status: "error",
        ...appendTerminalReplay(session.replay, `${event.message}\r\n`, session.truncated),
      })));
    });
    return () => {
      removeData();
      removeExit();
      removeError();
    };
  }, [api]);

  useEffect(() => {
    const container = containerRef.current;
    if (!api || !container || !activeSession) {
      return undefined;
    }

    activeTerminalIdRef.current = activeSession.id;
    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      fontFamily: "Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontSize: 12,
      scrollback: 2_000,
      theme: {
        background: "#0f1117",
        foreground: "#d7dae0",
        cursor: "#f2f4f8",
        selectionBackground: "#39557a",
      },
    });
    const fitAddon = new FitAddon();
    const clipboardAddon = new ClipboardAddon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      void api.openExternal(uri);
    });

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(clipboardAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }
      const commandModifier = api.platform === "darwin" ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();
      if (commandModifier && !event.shiftKey && key === "t") {
        void createTerminal();
        return false;
      }
      if (api.platform === "darwin" && event.metaKey) {
        const sequence = macTerminalSequenceForEvent(event);
        if (sequence) {
          void api.writeTerminal(activeSession.id, sequence);
          return false;
        }
      }
      return true;
    });
    terminal.onData((data) => {
      void api.writeTerminal(activeSession.id, data);
    });
    terminal.onTitleChange((title) => {
      void api.setTerminalTitle(activeSession.id, title);
      setPanel((currentPanel) => updateSession(currentPanel, activeSession.id, (session) => ({
        ...session,
        title: title.trim() || session.title,
      })));
    });
    terminal.open(container);
    if (activeSession.replay) {
      terminal.write(activeSession.replay);
    }
    terminal.focus();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    window.requestAnimationFrame(() => {
      fitAndResize();
      window.requestAnimationFrame(fitAndResize);
    });
    // Delayed fits cover CSS grid settling after mode switches / first open.
    const fitTimers = [50, 150, 400].map((ms) => window.setTimeout(() => fitAndResize(), ms));

    // A fast shell can print its first prompt between ensurePanel and the renderer
    // subscribing to terminalData. Re-read the bounded replay after mount so a
    // newly opened terminal never remains visually blank.
    let cancelled = false;
    const backfillTimer = window.setTimeout(() => {
      void api.ensureTerminalPanel(workspace.id, sessionId, lastSizeRef.current).then((fresh) => {
        if (cancelled || terminalRef.current !== terminal) return;
        const freshSession = fresh.sessions.find((entry) => entry.id === activeSession.id);
        const firstLine = terminal.buffer.active.getLine(0)?.translateToString(true).trim() ?? "";
        if (freshSession?.replay && !firstLine) {
          terminal.reset();
          terminal.write(freshSession.replay);
        }
        setPanel(fresh);
      }).catch(() => undefined);
    }, 250);

    const resizeObserver = new ResizeObserver(() => fitAndResize());
    resizeObserver.observe(container);
    if (container.parentElement) {
      resizeObserver.observe(container.parentElement);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(backfillTimer);
      for (const timer of fitTimers) {
        window.clearTimeout(timer);
      }
      resizeObserver.disconnect();
      fitAddonRef.current = null;
      terminalRef.current = null;
      activeTerminalIdRef.current = "";
      terminal.dispose();
    };
  }, [activeSession?.id, api, createTerminal, fitAndResize, sessionId, workspace.id]);

  return (
    <section
      ref={panelRef}
      className={`terminal-panel${isTakeover ? " terminal-panel--takeover" : ""}`}
      data-pi-terminal="true"
      data-testid="integrated-terminal"
    >
      <div className="terminal-panel__toolbar">
        <div className="terminal-panel__tabs" role="tablist" aria-label="Terminal sessions">
          {(panel?.sessions ?? []).map((session) => (
            <div
              key={session.id}
              className={`terminal-panel__tab-item${session.id === panel?.activeSessionId ? " terminal-panel__tab-item--active" : ""}`}
            >
              <button
                className="terminal-panel__tab"
                type="button"
                role="tab"
                aria-selected={session.id === panel?.activeSessionId}
                data-testid="terminal-tab"
                onClick={() => void setActiveTerminal(session.id)}
              >
                <span className={`terminal-panel__status terminal-panel__status--${session.status}`} />
                <span className="terminal-panel__tab-title">{session.title}</span>
              </button>
              <button
                type="button"
                className="terminal-panel__tab-close"
                aria-label={`Close ${session.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTerminal(session.id);
                }}
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
        <div className="terminal-panel__actions">
          <button type="button" className="icon-button terminal-panel__action" title="New terminal" aria-label="New terminal" onClick={() => void createTerminal()}>
            <PlusIcon />
          </button>
          <button type="button" className="icon-button terminal-panel__action" title="Restart terminal" aria-label="Restart terminal" onClick={() => void restartTerminal()}>
            <RefreshIcon />
          </button>
          <button
            type="button"
            className="icon-button terminal-panel__action"
            title={isTakeover ? "Restore terminal" : "Maximize terminal"}
            aria-label={isTakeover ? "Restore terminal" : "Maximize terminal"}
            onClick={onToggleTakeover}
          >
            {isTakeover ? <MinimizeIcon /> : <MaximizeIcon />}
          </button>
          <button type="button" className="icon-button terminal-panel__action" title="Hide terminal" aria-label="Hide terminal" onClick={onHide}>
            <CloseIcon />
          </button>
        </div>
      </div>
      {error ? (
        <div className="terminal-panel__error">{error}</div>
      ) : (
        <div className="terminal-panel__viewport" ref={containerRef} />
      )}
    </section>
  );
}

function updateSession(
  panel: TerminalPanelSnapshot | null,
  terminalId: string,
  update: (session: TerminalSessionSnapshot) => TerminalSessionSnapshot,
): TerminalPanelSnapshot | null {
  if (!panel) {
    return panel;
  }
  return {
    ...panel,
    sessions: panel.sessions.map((session) => session.id === terminalId ? update(session) : session),
  };
}

function macTerminalSequenceForEvent(event: KeyboardEvent): string | undefined {
  switch (event.key) {
    case "ArrowLeft":
    case "ArrowUp":
      return "\x01";
    case "ArrowRight":
    case "ArrowDown":
      return "\x05";
    case "Backspace":
      return "\x15";
    case "Delete":
      return "\x0b";
    default:
      return undefined;
  }
}
