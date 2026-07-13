import { basename } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("sidebar thread click selects without requiring a drag", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("sidebar-click-select");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);

    await createNamedThread(window, "Thread A", { workspaceName: basename(workspacePath) });
    await createNamedThread(window, "Thread B", { workspaceName: basename(workspacePath) });

    await expect(window.locator(".topbar__session")).toHaveText("Thread B");

    const threadA = window.locator(".session-row", { hasText: "Thread A" });
    await expect(threadA).toHaveAttribute("data-composer-draggable", "true");

    const select = threadA.locator(".session-row__select");
    const box = await select.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }

    // Real pointer press/release with no movement — must select, not only drag.
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.mouse.down();
    await window.mouse.up();

    await expect(window.locator(".topbar__session")).toHaveText("Thread A");
    await expect(threadA).toHaveClass(/session-row--active/);
  } finally {
    await harness.close();
  }
});
