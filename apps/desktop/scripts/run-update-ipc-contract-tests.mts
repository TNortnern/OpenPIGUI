/**
 * Contract tests for update IPC coordination (main-process bridge).
 *
 * Run from repo root (or apps/desktop):
 *   node --experimental-strip-types apps/desktop/scripts/run-update-ipc-contract-tests.mts
 */
import assert from "node:assert/strict";
import {
  UpdateIpcBridge,
  type UpdateBroadcastWindow,
} from "../electron/update-ipc-bridge.ts";
import {
  createInitialUpdateState,
  type ConfigurableUpdateServiceAdapter,
  type UpdateState,
} from "../electron/update-service.ts";
import { desktopIpc } from "../src/ipc.ts";

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

class FakeAdapter implements ConfigurableUpdateServiceAdapter {
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

class FakeWindow implements UpdateBroadcastWindow {
  readonly sent: Array<{ channel: string; payload: UpdateState }> = [];
  destroyed = false;
  readonly id: number;

  constructor(id: number) {
    this.id = id;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  send(channel: string, payload: UpdateState): void {
    this.sent.push({ channel, payload });
  }
}

function createBridge(windows: FakeWindow[], adapter = new FakeAdapter()) {
  const bridge = UpdateIpcBridge.create({
    adapter,
    currentVersion: "1.0.0",
    enabled: true,
    getWindows: () => windows,
    canPublishToWindow: (window) => !window.isDestroyed(),
    stateChangedChannel: desktopIpc.updateStateChanged,
  });
  bridge.start();
  for (const window of windows) {
    window.sent.length = 0;
  }
  return { bridge, service: bridge.service, adapter, windows };
}

console.log("update-ipc contract");

test("getUpdateState returns the initial idle snapshot", () => {
  const { bridge } = createBridge([]);
  const state = bridge.getUpdateState();
  assert.deepEqual(state, createInitialUpdateState("1.0.0"));
});

test("checkForUpdates delegates to the service and returns the latest snapshot", async () => {
  const { bridge, adapter } = createBridge([]);
  const promise = bridge.checkForUpdates();
  adapter.emit("checking-for-update");
  const state = await promise;
  assert.equal(state.phase, "checking");
  assert.equal(adapter.checkCalls, 1);
});

test("manual retry after error triggers another adapter check", async () => {
  const { bridge, adapter } = createBridge([]);
  adapter.emit("checking-for-update");
  adapter.emit("error", new Error("offline"));
  assert.equal(bridge.getUpdateState().canRetry, true);

  await bridge.checkForUpdates();
  assert.equal(adapter.checkCalls, 1);

  adapter.emit("checking-for-update");
  await bridge.checkForUpdates();
  assert.equal(adapter.checkCalls, 2);
});

test("restartToUpdate rejects before the package is downloaded", () => {
  const { bridge, adapter } = createBridge([]);
  adapter.emit("checking-for-update");
  adapter.emit("update-available", { version: "1.0.1" });
  const result = bridge.restartToUpdate();
  assert.deepEqual(result, { accepted: false });
  assert.equal(adapter.quitCalls, 0);
});

test("restartToUpdate accepts only after download completes", () => {
  const { bridge, adapter } = createBridge([]);
  adapter.emit("checking-for-update");
  adapter.emit("update-available", { version: "1.0.1" });
  adapter.emit("update-downloaded", { version: "1.0.1" });
  const result = bridge.restartToUpdate();
  assert.deepEqual(result, { accepted: true });
  bridge.installDownloadedUpdate();
  assert.equal(adapter.quitCalls, 1);
});

test("state changes broadcast to every publishable window", () => {
  const windows = [new FakeWindow(1), new FakeWindow(2)];
  const { adapter } = createBridge(windows);
  adapter.emit("checking-for-update");
  for (const window of windows) {
    assert.equal(window.sent.length, 1);
    assert.equal(window.sent[0]?.channel, desktopIpc.updateStateChanged);
    assert.equal(window.sent[0]?.payload.phase, "checking");
  }
});

test("destroyed windows are skipped during broadcast", () => {
  const live = new FakeWindow(1);
  const dead = new FakeWindow(2);
  dead.destroyed = true;
  const { adapter } = createBridge([live, dead]);
  adapter.emit("checking-for-update");
  assert.equal(live.sent.length, 1);
  assert.equal(dead.sent.length, 0);
});

test("renderer listeners receive broadcasts and cleanup removes them", () => {
  const { bridge, adapter } = createBridge([]);
  const seen: UpdateState[] = [];
  const unsubscribe = bridge.subscribeRendererListener((state) => {
    seen.push(state);
  });
  adapter.emit("checking-for-update");
  assert.equal(seen.length, 2);
  assert.equal(seen[1]?.phase, "checking");
  unsubscribe();
  adapter.emit("update-not-available", { version: "1.0.0" });
  assert.equal(seen.length, 2);
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
  console.log(`All ${passed} update IPC contract tests passed`);
}
