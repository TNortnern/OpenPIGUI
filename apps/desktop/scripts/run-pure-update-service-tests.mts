/**
 * Pure unit tests for the typed background update service.
 *
 * Run from repo root (or apps/desktop):
 *   node --experimental-strip-types apps/desktop/scripts/run-pure-update-service-tests.mts
 */
import assert from "node:assert/strict";
import {
  INITIAL_UPDATE_CHECK_DELAY_MS,
  POLL_UPDATE_INTERVAL_MS,
  applyUpdaterEvent,
  clampUpdatePercent,
  createInitialUpdateState,
  isUpdateServiceEnabled,
  reduceUpdateState,
  resolveUpdateChannelPolicy,
  sanitizeUpdateError,
  type UpdateServiceAdapter,
  UpdateService,
} from "../electron/update-service.ts";

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

function baseState(version = "1.0.0") {
  return createInitialUpdateState(version);
}

console.log("update-service helpers");

test("clampUpdatePercent clamps below zero and above 100", () => {
  assert.equal(clampUpdatePercent(-5), 0);
  assert.equal(clampUpdatePercent(0), 0);
  assert.equal(clampUpdatePercent(42.7), 42.7);
  assert.equal(clampUpdatePercent(100), 100);
  assert.equal(clampUpdatePercent(150), 100);
  assert.equal(clampUpdatePercent(Number.NaN), 0);
  assert.equal(clampUpdatePercent(Number.POSITIVE_INFINITY), 100);
});

test("sanitizeUpdateError strips paths, stacks, and credentials", () => {
  const raw = new Error(
    "ENOENT: /Users/secret/project/node_modules/electron-updater failed at https://user:token@api.github.com/repos/foo/bar",
  );
  raw.stack = "Error: boom\n    at /Users/secret/project/electron/update-service.ts:12:34";
  const message = sanitizeUpdateError(raw);
  assert.match(message, /update check failed/i);
  assert.doesNotMatch(message, /\/Users\//);
  assert.doesNotMatch(message, /node_modules/);
  assert.doesNotMatch(message, /token@/);
  assert.doesNotMatch(message, /at \//);
});

test("sanitizeUpdateError falls back for unknown values", () => {
  assert.equal(sanitizeUpdateError(undefined), "The update check failed.");
  assert.equal(sanitizeUpdateError(42), "The update check failed.");
});

test("resolveUpdateChannelPolicy keeps stable releases on latest without prereleases", () => {
  assert.deepEqual(resolveUpdateChannelPolicy("1.2.3"), {
    channel: "latest",
    allowPrerelease: false,
  });
  assert.deepEqual(resolveUpdateChannelPolicy("0.1.0"), {
    channel: "latest",
    allowPrerelease: false,
  });
});

test("resolveUpdateChannelPolicy maps prerelease builds to matching channels", () => {
  assert.deepEqual(resolveUpdateChannelPolicy("1.0.0-beta.2"), {
    channel: "beta",
    allowPrerelease: true,
  });
  assert.deepEqual(resolveUpdateChannelPolicy("1.0.0-alpha.1"), {
    channel: "alpha",
    allowPrerelease: true,
  });
  assert.deepEqual(resolveUpdateChannelPolicy("1.0.0-rc.3"), {
    channel: "rc",
    allowPrerelease: true,
  });
});

test("isUpdateServiceEnabled is false for dev, unpackaged, and automated tests", () => {
  assert.equal(
    isUpdateServiceEnabled({
      isDev: true,
      isPackaged: true,
      testMode: undefined,
      controlledFeedOverride: false,
    }),
    false,
  );
  assert.equal(
    isUpdateServiceEnabled({
      isDev: false,
      isPackaged: false,
      testMode: undefined,
      controlledFeedOverride: false,
    }),
    false,
  );
  assert.equal(
    isUpdateServiceEnabled({
      isDev: false,
      isPackaged: true,
      testMode: "background",
      controlledFeedOverride: false,
    }),
    false,
  );
});

test("isUpdateServiceEnabled allows packaged production unless only blocked by override absence", () => {
  assert.equal(
    isUpdateServiceEnabled({
      isDev: false,
      isPackaged: true,
      testMode: undefined,
      controlledFeedOverride: false,
    }),
    true,
  );
  assert.equal(
    isUpdateServiceEnabled({
      isDev: true,
      isPackaged: false,
      testMode: "background",
      controlledFeedOverride: true,
    }),
    true,
  );
});

console.log("update-state transitions");

test("disabled state stays disabled for updater events", () => {
  const state = createInitialUpdateState("1.0.0", { enabled: false });
  assert.equal(state.phase, "disabled");
  const next = reduceUpdateState(state, { type: "checking-for-update" });
  assert.equal(next.phase, "disabled");
});

test("idle transitions to checking on checking-for-update", () => {
  const next = reduceUpdateState(baseState(), { type: "checking-for-update" });
  assert.equal(next.phase, "checking");
  assert.equal(next.canRetry, false);
  assert.equal(next.canRestart, false);
});

test("checking transitions to available on update-available", () => {
  const checking = reduceUpdateState(baseState("0.9.0"), { type: "checking-for-update" });
  const next = reduceUpdateState(checking, {
    type: "update-available",
    version: "1.0.0",
  });
  assert.equal(next.phase, "available");
  assert.equal(next.availableVersion, "1.0.0");
});

test("checking transitions to up-to-date on update-not-available", () => {
  const checking = reduceUpdateState(baseState("1.0.0"), { type: "checking-for-update" });
  const next = reduceUpdateState(checking, {
    type: "update-not-available",
    version: "1.0.0",
  });
  assert.equal(next.phase, "up-to-date");
  assert.equal(next.availableVersion, undefined);
});

test("available transitions to downloading with clamped progress", () => {
  const available = applyUpdaterEvent(
    baseState("0.9.0"),
    { type: "checking-for-update" },
    { type: "update-available", version: "1.0.0" },
  );
  const next = reduceUpdateState(available, { type: "download-progress", percent: 155 });
  assert.equal(next.phase, "downloading");
  assert.equal(next.percent, 100);
});

test("downloading transitions to downloaded on update-downloaded", () => {
  const downloading = applyUpdaterEvent(
    baseState("0.9.0"),
    { type: "checking-for-update" },
    { type: "update-available", version: "1.0.0" },
    { type: "download-progress", percent: 50 },
  );
  const next = reduceUpdateState(downloading, {
    type: "update-downloaded",
    version: "1.0.0",
  });
  assert.equal(next.phase, "downloaded");
  assert.equal(next.canRestart, true);
  assert.equal(next.percent, undefined);
});

test("checking transitions to sanitized error with retry affordance", () => {
  const checking = reduceUpdateState(baseState(), { type: "checking-for-update" });
  const next = reduceUpdateState(checking, {
    type: "error",
    error: new Error("secret at /Users/me/.ssh/id_rsa"),
  });
  assert.equal(next.phase, "error");
  assert.equal(next.canRetry, true);
  assert.match(next.message ?? "", /update check failed/i);
  assert.doesNotMatch(next.message ?? "", /\/Users\//);
});

test("error clears to checking when a retry check starts", () => {
  const errored = applyUpdaterEvent(baseState(), { type: "checking-for-update" }, {
    type: "error",
    error: new Error("network down"),
  });
  const next = reduceUpdateState(errored, { type: "checking-for-update" });
  assert.equal(next.phase, "checking");
  assert.equal(next.message, undefined);
});

console.log("update-service lifecycle");

class FakeAdapter implements UpdateServiceAdapter {
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

class FakeClock {
  now = 0;
  private readonly timeouts: Array<{ at: number; fn: () => void }> = [];
  private readonly intervals: Array<{ every: number; fn: () => void; nextAt: number }> = [];

  setTimeout(fn: () => void, delay: number): ReturnType<typeof setTimeout> {
    this.timeouts.push({ at: this.now + delay, fn });
    return this.timeouts.length as ReturnType<typeof setTimeout>;
  }

  clearTimeout(): void {}

  setInterval(fn: () => void, interval: number): ReturnType<typeof setInterval> {
    this.intervals.push({ every: interval, fn, nextAt: this.now + interval });
    return this.intervals.length as ReturnType<typeof setInterval>;
  }

  clearInterval(): void {}

  tick(ms: number): void {
    this.now += ms;
    const dueTimeouts = this.timeouts.filter((entry) => entry.at <= this.now);
    this.timeouts.splice(
      0,
      this.timeouts.length,
      ...this.timeouts.filter((entry) => entry.at > this.now),
    );
    for (const entry of dueTimeouts) {
      entry.fn();
    }
    for (const entry of this.intervals) {
      while (entry.nextAt <= this.now) {
        entry.fn();
        entry.nextAt += entry.every;
      }
    }
  }
}

test("UpdateService reports disabled state in dev without controlled-feed override", () => {
  const adapter = new FakeAdapter();
  const clock = new FakeClock();
  const service = new UpdateService({
    adapter,
    clock,
    currentVersion: "1.0.0",
    enabled: false,
  });
  assert.equal(service.getState().phase, "disabled");
  service.start();
  clock.tick(INITIAL_UPDATE_CHECK_DELAY_MS + 1);
  assert.equal(adapter.checkCalls, 0);
  service.stop();
});

test("UpdateService configures adapter policy, timers, and deduped checks", async () => {
  const adapter = new FakeAdapter();
  const clock = new FakeClock();
  const service = new UpdateService({
    adapter,
    clock,
    currentVersion: "0.1.0-beta.1",
    enabled: true,
  });

  service.start();
  assert.equal(adapter.autoDownload, true);
  assert.equal(adapter.autoInstallOnAppQuit, true);
  assert.deepEqual(resolveUpdateChannelPolicy("0.1.0-beta.1"), {
    channel: "beta",
    allowPrerelease: true,
  });
  assert.equal(adapter.channel, "beta");
  assert.equal(adapter.allowPrerelease, true);

  clock.tick(INITIAL_UPDATE_CHECK_DELAY_MS);
  await Promise.resolve();
  assert.equal(adapter.checkCalls, 1);

  const first = service.checkForUpdates();
  const second = service.checkForUpdates();
  adapter.emit("checking-for-update");
  await Promise.all([first, second]);
  assert.equal(adapter.checkCalls, 2);

  clock.tick(POLL_UPDATE_INTERVAL_MS);
  assert.equal(adapter.checkCalls, 3);
  service.stop();
});

test("UpdateService installDownloadedUpdate delegates to adapter only when downloaded", () => {
  const adapter = new FakeAdapter();
  const service = new UpdateService({
    adapter,
    clock: new FakeClock(),
    currentVersion: "1.0.0",
    enabled: true,
  });
  service.start();
  service.installDownloadedUpdate();
  assert.equal(adapter.quitCalls, 0);

  adapter.emit("checking-for-update");
  adapter.emit("update-available", { version: "1.0.0" });
  adapter.emit("update-downloaded", { version: "1.0.0" });
  assert.deepEqual(service.restartToUpdate(), { accepted: true });
  service.installDownloadedUpdate();
  assert.equal(adapter.quitCalls, 1);
  service.stop();
});

let passed = 0;
let failed = 0;

for (const entry of tests) {
  try {
    await entry.fn();
    passed += 1;
    console.log(`  ok  - ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${entry.name}`);
    console.error(error);
  }
}

console.log("");
if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exitCode = 1;
} else if (passed === 0) {
  console.error("No tests ran");
  process.exitCode = 1;
} else {
  console.log(`All ${passed} pure update-service tests passed`);
}
