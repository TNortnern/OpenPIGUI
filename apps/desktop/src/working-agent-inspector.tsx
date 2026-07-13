import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { trapDialogFocus } from "./dialog-focus";
import { CloseIcon, MaximizeIcon, MinimizeIcon, PlusIcon, StopSquareIcon } from "./icons";

export interface WorkingAgentInspectorMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly text: string;
  readonly createdAt?: string;
}

export interface WorkingAgentInspectorTarget {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly prompt: string;
  readonly modelLabel?: string;
  readonly thinkingLabel?: string;
  readonly messages: readonly WorkingAgentInspectorMessage[];
  readonly streaming?: boolean;
  readonly canFollowUp: boolean;
  readonly followUpHint: string;
  readonly kind: "session" | "child" | "queued";
  readonly childThreadId?: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
}

interface WorkingAgentInspectorProps {
  readonly target: WorkingAgentInspectorTarget;
  readonly onClose: () => void;
  readonly onStop: () => void;
  readonly onSendFollowUp: (text: string) => void | Promise<void>;
}

export function WorkingAgentInspector({
  target,
  onClose,
  onStop,
  onSendFollowUp,
}: WorkingAgentInspectorProps) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [target.id]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [target.messages, target.streaming]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      trapDialogFocus(event, dialogRef.current);
      return;
    }
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onClose();
    }
  };

  const submitFollowUp = async () => {
    const text = draft.trim();
    if (!text || !target.canFollowUp || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onSendFollowUp(text);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitFollowUp();
  };

  return (
    <div
      className="agent-inspector-backdrop"
      data-testid="agent-inspector-backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || submitting) {
          return;
        }
        onClose();
      }}
    >
      <div
        aria-modal="true"
        className={`agent-inspector${expanded ? " agent-inspector--expanded" : ""}`}
        data-testid="agent-inspector"
        ref={dialogRef}
        role="dialog"
        aria-label={target.title}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="agent-inspector__header">
          <div className="agent-inspector__heading">
            <h2 className="agent-inspector__title">{target.title}</h2>
            <span className="agent-inspector__status">{target.statusLabel}</span>
          </div>
          <div className="agent-inspector__header-actions">
            <button
              type="button"
              className="agent-inspector__icon-btn"
              aria-label={expanded ? "Shrink inspector" : "Expand inspector"}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
            <button
              type="button"
              className="agent-inspector__icon-btn"
              aria-label="Close agent inspector"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <section className="agent-inspector__section">
          <div className="agent-inspector__section-label">User prompt</div>
          <div className="agent-inspector__prompt" data-testid="agent-inspector-prompt">
            {target.prompt.trim() || "No prompt captured yet."}
          </div>
        </section>

        <section className="agent-inspector__section agent-inspector__section--transcript">
          <div className="agent-inspector__section-label-row">
            <div className="agent-inspector__section-label">Live transcript</div>
            <div className="agent-inspector__stream-meta">
              {target.streaming ? (
                <>
                  <span className="agent-inspector__stream-dot" aria-hidden="true" />
                  <span>Assistant · Streaming</span>
                </>
              ) : (
                <span>{target.statusLabel}</span>
              )}
            </div>
          </div>
          <div className="agent-inspector__transcript" ref={transcriptRef} data-testid="agent-inspector-transcript">
            {target.messages.length === 0 ? (
              <div className="agent-inspector__empty">Waiting for agent output…</div>
            ) : (
              target.messages.map((message) => (
                <div
                  key={message.id}
                  className={`agent-inspector__message agent-inspector__message--${message.role}`}
                >
                  <div className="agent-inspector__message-role">
                    {message.role === "tool" ? "Tool" : message.role === "user" ? "User" : message.role === "system" ? "System" : "Assistant"}
                  </div>
                  <div className="agent-inspector__message-text">{message.text}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <form className="agent-inspector__footer" onSubmit={handleSubmit}>
          <button type="button" className="agent-inspector__attach" aria-label="Attach files" disabled title="Attachments for subagent follow-ups are not wired yet">
            <PlusIcon />
            <span>Attach</span>
          </button>
          <div className="agent-inspector__composer">
            <textarea
              ref={inputRef}
              className="agent-inspector__input"
              data-testid="agent-inspector-follow-up"
              placeholder={target.canFollowUp ? "Send follow-up to subagent…" : target.followUpHint}
              value={draft}
              disabled={!target.canFollowUp || submitting}
              rows={1}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submitFollowUp();
                }
              }}
            />
            <div className="agent-inspector__composer-meta">
              {(target.modelLabel || target.thinkingLabel) ? (
                <span className="agent-inspector__model" data-testid="agent-inspector-model">
                  {[target.modelLabel, target.thinkingLabel].filter(Boolean).join(" · ")}
                </span>
              ) : null}
              <span className="agent-inspector__shortcut">⌘↵</span>
            </div>
          </div>
          <button
            type="button"
            className="button button--primary button--cta-icon agent-inspector__stop"
            aria-label="Stop agent"
            data-testid="agent-inspector-stop"
            onClick={onStop}
          >
            <StopSquareIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
