import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("surfaces update status, retry, and restart through the sidebar control", async () => {
  test.setTimeout(90_000);

  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("update-control");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
    envOverrides: { PI_APP_UPDATE_FAKE: "1" },
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Update control thread");

    const control = window.getByTestId("update-control");
    await expect(control).toHaveCount(0);

    await harness.electronApp.evaluate(() => {
      const hooks = (globalThis as {
        __PI_APP_TEST_HOOKS?: {
          simulateUpdateEventForTest?: (event: { type: string; version?: string; percent?: number; error?: unknown }) => void;
        };
      }).__PI_APP_TEST_HOOKS;
      hooks?.simulateUpdateEventForTest?.({ type: "checking-for-update" });
    });
    await expect(control).toBeVisible();
    await expect(control).toContainText("Checking for updates");

    await harness.electronApp.evaluate(() => {
      const hooks = (globalThis as {
        __PI_APP_TEST_HOOKS?: {
          simulateUpdateEventForTest?: (event: { type: string; version?: string }) => void;
        };
      }).__PI_APP_TEST_HOOKS;
      hooks?.simulateUpdateEventForTest?.({ type: "update-available", version: "9.9.9" });
    });
    await expect(control).toContainText("9.9.9");

    await harness.electronApp.evaluate(() => {
      const hooks = (globalThis as {
        __PI_APP_TEST_HOOKS?: {
          simulateUpdateEventForTest?: (event: { type: string; percent?: number }) => void;
        };
      }).__PI_APP_TEST_HOOKS;
      hooks?.simulateUpdateEventForTest?.({ type: "download-progress", percent: 42 });
    });
    await expect(control).toContainText("Downloading");

    await harness.electronApp.evaluate(() => {
      const hooks = (globalThis as {
        __PI_APP_TEST_HOOKS?: {
          simulateUpdateEventForTest?: (event: { type: string; version?: string }) => void;
        };
      }).__PI_APP_TEST_HOOKS;
      hooks?.simulateUpdateEventForTest?.({ type: "update-downloaded", version: "9.9.9" });
    });
    await expect(window.getByTestId("update-restart")).toBeVisible();

    await window.getByTestId("update-restart").click();
    await expect
      .poll(async () =>
        harness.electronApp.evaluate(() => {
          const hooks = (globalThis as {
            __PI_APP_TEST_HOOKS?: { getUpdateRestartCalls?: () => number };
          }).__PI_APP_TEST_HOOKS;
          return hooks?.getUpdateRestartCalls?.() ?? 0;
        }),
      )
      .toBe(1);

    await harness.electronApp.evaluate(() => {
      const hooks = (globalThis as {
        __PI_APP_TEST_HOOKS?: {
          simulateUpdateEventForTest?: (event: { type: string; error?: unknown }) => void;
        };
      }).__PI_APP_TEST_HOOKS;
      hooks?.simulateUpdateEventForTest?.({ type: "error", error: new Error("offline") });
    });
    await expect(control).toContainText("failed");
    await window.getByTestId("update-retry").click();
    await harness.electronApp.evaluate(() => {
      const hooks = (globalThis as {
        __PI_APP_TEST_HOOKS?: {
          simulateUpdateEventForTest?: (event: { type: string }) => void;
        };
      }).__PI_APP_TEST_HOOKS;
      hooks?.simulateUpdateEventForTest?.({ type: "checking-for-update" });
    });
    await expect(control).toContainText("Checking for updates");
  } finally {
    await harness.close();
  }
});
