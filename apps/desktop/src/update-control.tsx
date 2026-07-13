import { useMemo } from "react";
import type { UpdateState } from "./ipc";

export interface UpdateControlActions {
  readonly onRetry: () => void;
  readonly onRestart: () => void;
  readonly restartDisabled?: boolean;
}

interface UpdateControlProps extends UpdateControlActions {
  readonly state: UpdateState;
}

export function UpdateControl({ state, onRetry, onRestart, restartDisabled = false }: UpdateControlProps) {
  const content = useMemo(() => describeUpdateControl(state), [state]);
  if (!content) {
    return null;
  }

  return (
    <section
      aria-live="polite"
      className="update-control"
      data-testid="update-control"
      data-update-phase={state.phase}
    >
      <p className="update-control__status">{content.status}</p>
      {content.showProgress ? (
        <progress
          aria-label={`Downloading version ${state.availableVersion ?? "update"}`}
          className="update-control__progress"
          max={100}
          value={state.percent ?? 0}
        />
      ) : null}
      {content.primaryAction === "restart" ? (
        <button
          className="update-control__action update-control__action--primary"
          data-testid="update-restart"
          disabled={restartDisabled}
          type="button"
          onClick={onRestart}
        >
          Update &amp; Restart
        </button>
      ) : null}
      {content.primaryAction === "retry" ? (
        <button
          className="update-control__action"
          data-testid="update-retry"
          type="button"
          onClick={onRetry}
        >
          Retry update
        </button>
      ) : null}
    </section>
  );
}

function describeUpdateControl(state: UpdateState): {
  readonly status: string;
  readonly showProgress: boolean;
  readonly primaryAction?: "restart" | "retry";
} | null {
  switch (state.phase) {
    case "disabled":
    case "idle":
      return null;
    case "checking":
      return { status: "Checking for updates…", showProgress: false };
    case "available":
      return {
        status: state.availableVersion ? `Update ${state.availableVersion} available` : "Update available",
        showProgress: false,
      };
    case "downloading":
      return {
        status: state.availableVersion
          ? `Downloading ${state.availableVersion}${state.percent != null ? ` (${Math.round(state.percent)}%)` : ""}`
          : "Downloading update",
        showProgress: state.percent != null,
      };
    case "downloaded":
      return {
        status: state.availableVersion ? `Ready to install ${state.availableVersion}` : "Update ready to install",
        showProgress: false,
        primaryAction: "restart",
      };
    case "up-to-date":
      return { status: "You're up to date", showProgress: false };
    case "error":
      return {
        status: state.message ?? "Update check failed",
        showProgress: false,
        primaryAction: state.canRetry ? "retry" : undefined,
      };
    default:
      return null;
  }
}
