export type UpdatePhase =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "error";

export interface UpdateState {
  readonly phase: UpdatePhase;
  readonly currentVersion: string;
  readonly availableVersion?: string;
  readonly percent?: number;
  readonly message?: string;
  readonly canRetry: boolean;
  readonly canRestart: boolean;
}

export interface UpdateServiceAdapter {
  checkForUpdates(): Promise<void>;
  quitAndInstall(): void;
  on(event: string, listener: (...args: any[]) => void): void;
}

export interface UpdateServiceEnablement {
  readonly isDev: boolean;
  readonly isPackaged: boolean;
  readonly testMode?: string;
  readonly controlledFeedOverride: boolean;
}

export interface UpdateChannelPolicy {
  readonly channel: string;
  readonly allowPrerelease: boolean;
}

export type UpdaterEvent =
  | { readonly type: "checking-for-update" }
  | { readonly type: "update-available"; readonly version: string }
  | { readonly type: "update-not-available"; readonly version: string }
  | { readonly type: "download-progress"; readonly percent: number }
  | { readonly type: "update-downloaded"; readonly version: string }
  | { readonly type: "error"; readonly error: unknown };

export const INITIAL_UPDATE_CHECK_DELAY_MS = 15_000;
export const POLL_UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

const GENERIC_UPDATE_ERROR = "The update check failed.";

export interface UpdateServiceClock {
  setTimeout(fn: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, interval: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ConfigurableUpdateServiceAdapter extends UpdateServiceAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  channel: string;
  allowPrerelease: boolean;
}

export interface UpdateServiceOptions {
  readonly adapter: ConfigurableUpdateServiceAdapter;
  readonly clock?: UpdateServiceClock;
  readonly currentVersion: string;
  readonly enabled: boolean;
  readonly onStateChange?: (state: UpdateState) => void;
}

export function clampUpdatePercent(percent: number): number {
  if (Number.isNaN(percent)) {
    return 0;
  }
  if (!Number.isFinite(percent)) {
    return percent > 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, percent));
}

export function sanitizeUpdateError(error: unknown): string {
  if (!(error instanceof Error)) {
    return GENERIC_UPDATE_ERROR;
  }

  let message = error.message || GENERIC_UPDATE_ERROR;
  message = message.replace(/\/(?:Users|home|var|tmp|private|Volumes)[^\s,)]+/gi, "[path]");
  message = message.replace(/[A-Za-z]:\\[^\s,)]+/g, "[path]");
  message = message.replace(/https?:\/\/[^@\s]+@[^\s]+/gi, "[url]");
  message = message.replace(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[redacted]");
  message = message.split("\n")[0]?.trim() || GENERIC_UPDATE_ERROR;
  if (!message || /ENOENT|EPERM|EACCES|stack|node_modules/i.test(message)) {
    return GENERIC_UPDATE_ERROR;
  }
  return `The update check failed. ${message}`;
}

function parsePrereleaseLabel(version: string): string | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(version.trim());
  if (!match?.[4]) {
    return undefined;
  }
  const label = match[4].split(".")[0]?.toLowerCase() ?? "";
  if (label.startsWith("beta")) {
    return "beta";
  }
  if (label.startsWith("alpha")) {
    return "alpha";
  }
  if (label.startsWith("rc")) {
    return "rc";
  }
  return label;
}

export function resolveUpdateChannelPolicy(currentVersion: string): UpdateChannelPolicy {
  const prerelease = parsePrereleaseLabel(currentVersion);
  if (!prerelease) {
    return { channel: "latest", allowPrerelease: false };
  }
  return { channel: prerelease, allowPrerelease: true };
}

export function isUpdateServiceEnabled(input: UpdateServiceEnablement): boolean {
  if (input.controlledFeedOverride) {
    return true;
  }
  if (input.isDev || !input.isPackaged || Boolean(input.testMode)) {
    return false;
  }
  return true;
}

export function resolveUpdateServiceEnablementFromEnv(env: NodeJS.ProcessEnv = process.env): UpdateServiceEnablement {
  return {
    isDev: Boolean(env.ELECTRON_RENDERER_URL),
    isPackaged: env.PI_APP_IS_PACKAGED === "1",
    testMode: env.PI_APP_TEST_MODE,
    controlledFeedOverride: env.PI_APP_UPDATE_CONTROLLED_FEED === "1",
  };
}

export function createInitialUpdateState(
  currentVersion: string,
  options?: { readonly enabled?: boolean },
): UpdateState {
  const enabled = options?.enabled ?? true;
  return {
    phase: enabled ? "idle" : "disabled",
    currentVersion,
    canRetry: false,
    canRestart: false,
  };
}

export function reduceUpdateState(state: UpdateState, event: UpdaterEvent): UpdateState {
  if (state.phase === "disabled") {
    return state;
  }

  switch (event.type) {
    case "checking-for-update":
      return {
        ...state,
        phase: "checking",
        message: undefined,
        percent: undefined,
        canRetry: false,
        canRestart: false,
      };
    case "update-available":
      return {
        ...state,
        phase: "available",
        availableVersion: event.version,
        message: undefined,
        percent: undefined,
        canRetry: false,
        canRestart: false,
      };
    case "update-not-available":
      return {
        ...state,
        phase: "up-to-date",
        availableVersion: undefined,
        message: undefined,
        percent: undefined,
        canRetry: false,
        canRestart: false,
      };
    case "download-progress":
      return {
        ...state,
        phase: "downloading",
        percent: clampUpdatePercent(event.percent),
        canRetry: false,
        canRestart: false,
      };
    case "update-downloaded":
      return {
        ...state,
        phase: "downloaded",
        availableVersion: event.version,
        percent: undefined,
        message: undefined,
        canRetry: false,
        canRestart: true,
      };
    case "error":
      return {
        ...state,
        phase: "error",
        message: sanitizeUpdateError(event.error),
        percent: undefined,
        canRetry: true,
        canRestart: false,
      };
    default:
      return state;
  }
}

export function applyUpdaterEvent(state: UpdateState, ...events: readonly UpdaterEvent[]): UpdateState {
  return events.reduce((next, event) => reduceUpdateState(next, event), state);
}

function readVersion(info: unknown): string | undefined {
  if (!info || typeof info !== "object") {
    return undefined;
  }
  const version = (info as { version?: unknown }).version;
  return typeof version === "string" && version.length > 0 ? version : undefined;
}

function readPercent(progress: unknown): number {
  if (!progress || typeof progress !== "object") {
    return 0;
  }
  const percent = (progress as { percent?: unknown }).percent;
  return typeof percent === "number" ? percent : 0;
}

const defaultClock: UpdateServiceClock = {
  setTimeout: (fn, delay) => setTimeout(fn, delay),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
  setInterval: (fn, interval) => setInterval(fn, interval),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

export class UpdateService {
  private readonly options: UpdateServiceOptions;
  private state: UpdateState;
  private readonly clock: UpdateServiceClock;
  private initialTimeout: unknown;
  private pollInterval: unknown;
  private inFlightCheck: Promise<void> | undefined;
  private stopped = true;

  constructor(options: UpdateServiceOptions) {
    this.options = options;
    this.clock = options.clock ?? defaultClock;
    this.state = createInitialUpdateState(options.currentVersion, {
      enabled: options.enabled,
    });
  }

  getState(): UpdateState {
    return this.state;
  }

  start(): void {
    if (!this.options.enabled || !this.stopped) {
      return;
    }
    this.stopped = false;
    this.configureAdapter();
    this.bindAdapterEvents();
    this.initialTimeout = this.clock.setTimeout(() => {
      void this.checkForUpdates();
    }, INITIAL_UPDATE_CHECK_DELAY_MS);
    this.pollInterval = this.clock.setInterval(() => {
      void this.checkForUpdates();
    }, POLL_UPDATE_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.initialTimeout !== undefined) {
      this.clock.clearTimeout(this.initialTimeout);
      this.initialTimeout = undefined;
    }
    if (this.pollInterval !== undefined) {
      this.clock.clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    this.inFlightCheck = undefined;
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!this.options.enabled || this.state.phase === "disabled") {
      return this.state;
    }
    if (this.inFlightCheck) {
      await this.inFlightCheck;
      return this.state;
    }
    this.inFlightCheck = this.options.adapter.checkForUpdates().finally(() => {
      this.inFlightCheck = undefined;
    });
    await this.inFlightCheck;
    return this.state;
  }

  restartToUpdate(): { readonly accepted: boolean } {
    if (this.state.phase !== "downloaded") {
      return { accepted: false };
    }
    this.options.adapter.quitAndInstall();
    return { accepted: true };
  }

  private configureAdapter(): void {
    const policy = resolveUpdateChannelPolicy(this.options.currentVersion);
    this.options.adapter.autoDownload = true;
    this.options.adapter.autoInstallOnAppQuit = true;
    this.options.adapter.channel = policy.channel;
    this.options.adapter.allowPrerelease = policy.allowPrerelease;
  }

  private bindAdapterEvents(): void {
    const { adapter } = this.options;
    adapter.on("checking-for-update", () => {
      this.publish(reduceUpdateState(this.state, { type: "checking-for-update" }));
    });
    adapter.on("update-available", (info: unknown) => {
      const version = readVersion(info) ?? this.state.availableVersion ?? "unknown";
      this.publish(reduceUpdateState(this.state, { type: "update-available", version }));
    });
    adapter.on("update-not-available", (info: unknown) => {
      const version = readVersion(info) ?? this.state.currentVersion;
      this.publish(reduceUpdateState(this.state, { type: "update-not-available", version }));
    });
    adapter.on("download-progress", (progress: unknown) => {
      this.publish(
        reduceUpdateState(this.state, {
          type: "download-progress",
          percent: readPercent(progress),
        }),
      );
    });
    adapter.on("update-downloaded", (info: unknown) => {
      const version = readVersion(info) ?? this.state.availableVersion ?? "unknown";
      this.publish(reduceUpdateState(this.state, { type: "update-downloaded", version }));
    });
    adapter.on("error", (error: unknown) => {
      this.publish(reduceUpdateState(this.state, { type: "error", error }));
    });
  }

  private publish(next: UpdateState): void {
    this.state = next;
    this.options.onStateChange?.(next);
  }
}

export function createUpdateServiceEnablement(
  env: NodeJS.ProcessEnv = process.env,
  isPackaged = false,
): boolean {
  return isUpdateServiceEnabled({
    ...resolveUpdateServiceEnablementFromEnv(env),
    isPackaged,
  });
}
