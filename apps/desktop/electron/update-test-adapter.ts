import type { ConfigurableUpdateServiceAdapter } from "./update-service";

/** In-memory updater adapter for Playwright update-control proofs. */
export class UpdateTestAdapter implements ConfigurableUpdateServiceAdapter {
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  checkCalls = 0;
  quitCalls = 0;
  autoDownload = false;
  autoInstallOnAppQuit = false;
  channel = "";
  allowPrerelease = false;

  on(event: string, listener: (...args: unknown[]) => void): void {
    const bucket = this.listeners.get(event) ?? new Set();
    bucket.add(listener);
    this.listeners.set(event, bucket);
  }

  async checkForUpdates(): Promise<void> {
    this.checkCalls += 1;
    this.emit("checking-for-update");
  }

  quitAndInstall(): void {
    this.quitCalls += 1;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

let sharedTestAdapter: UpdateTestAdapter | undefined;

export function getUpdateTestAdapter(): UpdateTestAdapter {
  if (!sharedTestAdapter) {
    sharedTestAdapter = new UpdateTestAdapter();
  }
  return sharedTestAdapter;
}

export function createUpdateTestAdapter(): ConfigurableUpdateServiceAdapter {
  return getUpdateTestAdapter();
}

export function isUpdateFakeAdapterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PI_APP_UPDATE_FAKE === "1";
}
