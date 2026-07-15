import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  QueuedComposerMessage,
  SessionContextUsage,
  SessionRecord,
  WorkspaceRecord,
  WorktreeRecord,
} from "./desktop-state";
import {
  contextUsageSummary,
  formatElapsedSince,
  formatTokenCount,
} from "./composer-context-usage";
import {
  BranchIcon,
  CloseIcon,
  GripIcon,
  TerminalIcon,
  WorkingDotsIcon,
  WorktreeIcon,
} from "./icons";
import type { TerminalPanelSnapshot, TerminalSessionSnapshot } from "./ipc";
import { multitaskPillLabel, shouldShowMultitask } from "./multitask-status";
import type { TranscriptMessage } from "./timeline-types";

type StatusPanel = "none" | "working" | "terminal" | "context";

export interface WorkingAgentEntry {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly kind: "running" | "queued";
  readonly modelLabel?: string;
  readonly childThreadId?: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly prompt?: string;
}

interface ComposerStatusChromeProps {
  readonly selectedSession: SessionRecord;
  readonly selectedWorkspace: WorkspaceRecord;
  readonly selectedWorktree?: WorktreeRecord;
  readonly runningLabel: string;
  readonly transcript: readonly TranscriptMessage[];
  readonly contextUsage?: SessionContextUsage;
  readonly terminalVisible: boolean;
  readonly queuedMessages?: readonly QueuedComposerMessage[];
  readonly peerWorkingAgents?: readonly WorkingAgentEntry[];
  readonly onStopRun: () => void;
  readonly onShowTerminal?: () => void;
  readonly onSelectWorkingAgent?: (agentId: string) => void;
  readonly onInspectWorkingAgent?: (agent: WorkingAgentEntry) => void;
  readonly children: ReactNode;
}

export function ComposerStatusChrome({
  selectedSession,
  selectedWorkspace,
  selectedWorktree,
  runningLabel,
  transcript,
  contextUsage,
  terminalVisible,
  queuedMessages = [],
  peerWorkingAgents = [],
  onStopRun,
  onShowTerminal,
  onSelectWorkingAgent,
  onInspectWorkingAgent,
  children,
}: ComposerStatusChromeProps) {
  const [panel, setPanel] = useState<StatusPanel>("none");
  const [terminalPanel, setTerminalPanel] = useState<TerminalPanelSnapshot | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isWorking = selectedSession.status === "running";
  const branchName =
    selectedWorktree?.branchName ??
    selectedWorkspace.branchName ??
    (selectedWorkspace.kind === "worktree" ? selectedWorktree?.name : undefined) ??
    selectedWorkspace.name;
  const isWorktree = selectedWorkspace.kind === "worktree" || Boolean(selectedWorktree);
  const usageSummary = useMemo(() => contextUsageSummary(contextUsage), [contextUsage]);
  const workingDetail = useMemo(() => deriveWorkingDetail(transcript, runningLabel), [transcript, runningLabel]);

  const workingAgents = useMemo<readonly WorkingAgentEntry[]>(() => {
    const agents: WorkingAgentEntry[] = [];
    if (isWorking) {
      agents.push({
        id: selectedSession.id,
        title: selectedSession.title || "Agent",
        detail: workingDetail,
        kind: "running",
        workspaceId: selectedWorkspace.id,
        sessionId: selectedSession.id,
        modelLabel: selectedSession.config
          ? `${selectedSession.config.provider ?? ""}/${selectedSession.config.modelId ?? ""}`.replace(/^\/|\/$/g, "")
          : undefined,
      });
    }
    for (const peer of peerWorkingAgents) {
      if (peer.id === selectedSession.id) {
        continue;
      }
      agents.push(peer);
    }
    for (const queued of queuedMessages) {
      agents.push({
        id: `queued:${queued.id}`,
        title: queued.mode === "steer" ? "Steer" : "Follow-up",
        detail: queued.text.trim() || "Queued message",
        kind: "queued",
      });
    }
    return agents;
  }, [
    isWorking,
    peerWorkingAgents,
    queuedMessages,
    selectedSession.id,
    selectedSession.title,
    selectedSession.config,
    selectedWorkspace.id,
    workingDetail,
  ]);

  const workingCount = workingAgents.filter((agent) => agent.kind === "running").length;
  const queuedCount = workingAgents.filter((agent) => agent.kind === "queued").length;
  const showMultitask = shouldShowMultitask(isWorking);

  const terminalSessions = terminalPanel?.sessions ?? [];
  const runningTerminals = terminalSessions.filter((session) => session.status === "running");
  const terminalCount = terminalVisible ? Math.max(1, runningTerminals.length || terminalSessions.length) : 0;
  const showActivity = isWorking || terminalCount > 0 || showMultitask;

  useEffect(() => {
    if (!showActivity && panel !== "context") {
      return;
    }
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [showActivity, panel]);

  useEffect(() => {
    if (!terminalVisible) {
      setTerminalPanel(null);
      if (panel === "terminal") {
        setPanel("none");
      }
      return;
    }
    const api = window.piApp;
    if (!api) {
      return;
    }
    let cancelled = false;
    void api
      .ensureTerminalPanel(selectedWorkspace.id, selectedSession.id)
      .then((next) => {
        if (!cancelled) {
          setTerminalPanel(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTerminalPanel(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [terminalVisible, selectedWorkspace.id, selectedSession.id, panel]);

  useEffect(() => {
    if (panel === "none") {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setPanel("none");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel("none");
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [panel]);

  useEffect(() => {
    if (!isWorking && panel === "working") {
      setPanel("none");
    }
  }, [isWorking, panel]);

  const togglePanel = (next: StatusPanel) => {
    setPanel((current) => (current === next ? "none" : next));
  };

  return (
    <div className="composer-status" ref={rootRef} data-testid="composer-status">
      {(isWorking || terminalCount > 0 || showMultitask) ? (
        <div className="composer-status__pills" data-testid="composer-status-pills">
          {isWorking ? (
            <button
              type="button"
              className={`composer-status__pill${panel === "working" ? " composer-status__pill--active" : ""}`}
              data-testid="composer-status-working-pill"
              aria-expanded={panel === "working"}
              onClick={() => togglePanel("working")}
            >
              <WorkingDotsIcon />
              <span>{Math.max(1, workingCount)} Working</span>
            </button>
          ) : null}
          {showMultitask ? (
            <span
              className="composer-status__pill composer-status__pill--badge"
              data-testid="composer-status-multitask-pill"
              title="Type in the composer to queue a follow-up. ⌘Enter steers the current run."
            >
              {multitaskPillLabel(queuedCount)}
            </span>
          ) : null}
          {terminalCount > 0 ? (
            <button
              type="button"
              className={`composer-status__pill${panel === "terminal" ? " composer-status__pill--active" : ""}`}
              data-testid="composer-status-terminal-pill"
              aria-expanded={panel === "terminal"}
              onClick={() => {
                onShowTerminal?.();
                togglePanel("terminal");
              }}
            >
              <span>{terminalCount} Terminal</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="composer-status__surface">{children}</div>

      <div className="composer-status__footer">
        <div className="composer-status__branch" title={branchName} data-testid="composer-status-branch">
          <BranchIcon />
          <span className="composer-status__branch-name">{branchName}</span>
          {isWorktree ? (
            <span className="composer-status__worktree" data-testid="composer-status-worktree">
              <WorktreeIcon />
              <span>Worktree</span>
            </span>
          ) : null}
        </div>

        <div className="composer-status__footer-right">
          {usageSummary.tokensPerSecondLabel ? (
            <span className="composer-status__tps" data-testid="composer-status-tps">
              {usageSummary.tokensPerSecondLabel}
            </span>
          ) : null}
          {usageSummary.contextWindow != null ? (
            <button
              type="button"
              className={`composer-status__context${panel === "context" ? " composer-status__context--active" : ""}`}
              data-testid="composer-status-context"
              aria-expanded={panel === "context"}
              aria-label="Context usage"
              onClick={() => togglePanel("context")}
            >
              <span className="composer-status__context-primary">
                {usageSummary.percentLabel
                  ? `${usageSummary.percentLabel} context used`
                  : "Context usage"}
              </span>
              {usageSummary.tokensLabel ? (
                <span className="composer-status__context-secondary">{usageSummary.tokensLabel}</span>
              ) : null}
            </button>
          ) : null}

          {showActivity ? (
            <span className="composer-status__spinner" aria-hidden="true" data-testid="composer-status-spinner" />
          ) : null}
        </div>
      </div>

      {panel === "working" && workingAgents.length > 0 ? (
        <StatusCard
          title={`${Math.max(1, workingCount)} Working`}
          onClose={() => setPanel("none")}
          headerActions={(
            <button type="button" className="composer-status__text-action" onClick={onStopRun}>
              Stop All
            </button>
          )}
        >
          {workingAgents.map((agent) => (
            <div key={agent.id} className="composer-status__item composer-status__item--working">
              <GripIcon />
              <button
                type="button"
                className="composer-status__item-body composer-status__item-body--button"
                data-testid={`composer-status-agent-${agent.id}`}
                onClick={() => onInspectWorkingAgent?.(agent)}
              >
                <span className="composer-status__item-title">{agent.title}</span>
                <span className="composer-status__item-meta">
                  {[agent.modelLabel, agent.detail].filter(Boolean).join(" · ")}
                </span>
              </button>
              {agent.kind === "running" ? (
                <button
                  type="button"
                  className="composer-status__text-action"
                  onClick={() => {
                    if (agent.id !== selectedSession.id) {
                      onSelectWorkingAgent?.(agent.id);
                    }
                    onStopRun();
                  }}
                >
                  Stop
                </button>
              ) : (
                <span className="composer-status__item-badge">Queued</span>
              )}
            </div>
          ))}
        </StatusCard>
      ) : null}

      {panel === "terminal" && terminalCount > 0 ? (
        <StatusCard
          title={`${terminalCount} Terminal Running`}
          onClose={() => setPanel("none")}
        >
          {(runningTerminals.length > 0 ? runningTerminals : terminalSessions).map((session) => (
            <TerminalStatusRow key={session.id} session={session} nowMs={nowMs} />
          ))}
          {terminalSessions.length === 0 ? (
            <div className="composer-status__item">
              <TerminalIcon />
              <div className="composer-status__item-body">
                <span className="composer-status__item-title">Terminal</span>
                <span className="composer-status__item-meta">Open</span>
              </div>
            </div>
          ) : null}
        </StatusCard>
      ) : null}

      {panel === "context" && usageSummary.contextWindow != null ? (
        <ContextUsagePanel
          usage={contextUsage}
          summary={usageSummary}
          onClose={() => setPanel("none")}
        />
      ) : null}
    </div>
  );
}

function StatusCard({
  title,
  className,
  onClose,
  headerActions,
  children,
}: {
  readonly title: string;
  readonly className?: string;
  readonly onClose: () => void;
  readonly headerActions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className={`composer-status__card${className ? ` ${className}` : ""}`} role="dialog" aria-label={title}>
      <div className="composer-status__card-header">
        <span className="composer-status__card-title">{title}</span>
        <div className="composer-status__card-actions">
          {headerActions}
          <button type="button" className="composer-status__icon-action" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="composer-status__card-body">{children}</div>
    </div>
  );
}

function TerminalStatusRow({
  session,
  nowMs,
}: {
  readonly session: TerminalSessionSnapshot;
  readonly nowMs: number;
}) {
  const elapsed = formatElapsedSince(session.startedAt, nowMs);
  return (
    <div className="composer-status__item">
      <TerminalIcon />
      <div className="composer-status__item-body">
        <span className="composer-status__item-title">{session.title || "Terminal"}</span>
        {elapsed ? <span className="composer-status__item-meta">{elapsed}</span> : null}
      </div>
    </div>
  );
}

function ContextUsagePanel({
  usage,
  summary,
  onClose,
}: {
  readonly usage: SessionContextUsage | undefined;
  readonly summary: ReturnType<typeof contextUsageSummary>;
  readonly onClose: () => void;
}) {
  const tokens = summary.tokens;
  const windowSize = summary.contextWindow ?? 0;
  const usedRatio =
    tokens != null && windowSize > 0 ? Math.max(0, Math.min(1, tokens / windowSize)) : 0;
  const percentLabel = summary.percentLabel ?? (tokens == null ? "—" : "0%");

  return (
    <div className="composer-status__card composer-status__card--context" role="dialog" aria-label="Context Usage">
      <div className="composer-status__card-header">
        <span className="composer-status__card-title">Context Usage</span>
        <div className="composer-status__card-actions">
          <button type="button" className="composer-status__icon-action" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="composer-status__context-summary">
        <span>{percentLabel === "—" ? "Unknown" : `${percentLabel} Full`}</span>
        <span>
          {tokens != null
            ? `~${formatTokenCount(tokens)} / ${formatTokenCount(windowSize)} Tokens`
            : `— / ${formatTokenCount(windowSize)} Tokens`}
        </span>
      </div>
      {summary.tokensPerSecondLabel ? (
        <div className="composer-status__context-summary" data-testid="composer-status-context-tps">
          <span>Recent speed</span>
          <span>{summary.tokensPerSecondLabel}</span>
        </div>
      ) : null}
      <div className="composer-status__context-bar" aria-hidden="true">
        {tokens != null ? (
          <span
            className="composer-status__context-bar-segment composer-status__context-bar-segment--conversation"
            style={{ width: `${usedRatio * 100}%` }}
          />
        ) : null}
      </div>
      <ul className="composer-status__context-legend">
        <li>
          <span className="composer-status__swatch composer-status__swatch--conversation" />
          <span>Conversation</span>
          <span className="composer-status__legend-value">
            {tokens != null ? formatTokenCount(tokens) : "—"}
          </span>
        </li>
        {usage?.tokens == null ? (
          <li className="composer-status__legend-note">
            Token totals refresh after the next model response
            {usage ? " (e.g. post-compaction)." : "."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function deriveWorkingDetail(transcript: readonly TranscriptMessage[], runningLabel: string): string {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const item = transcript[index];
    if (!item) {
      continue;
    }
    if (item.kind === "tool" && item.status === "running") {
      return item.label || item.toolName;
    }
    if (item.kind === "activity" && item.label && item.label !== "Stopped") {
      return item.detail ?? item.label;
    }
  }
  return runningLabel.replace(/^Working(?:…| for )?/i, "").trim() || "Working…";
}
