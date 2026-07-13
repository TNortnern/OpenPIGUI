import { basename } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("starts a new thread from a project header while another project stays selected", async () => {
  test.setTimeout(90_000);

  const userDataDir = await makeUserDataDir();
  const workspaceA = await makeWorkspace("workspace-new-thread-a");
  const workspaceB = await makeWorkspace("workspace-new-thread-b");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspaceA, workspaceB],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const projectA = await waitForWorkspaceByPath(window, workspaceA);
    const projectB = await waitForWorkspaceByPath(window, workspaceB);

    await window
      .locator(".workspace-row", { hasText: basename(workspaceB) })
      .locator(".workspace-row__select")
      .click();
    await expect.poll(async () => (await getDesktopState(window)).selectedWorkspaceId).toBe(projectB.id);

    await window
      .locator(".workspace-row", { hasText: basename(workspaceA) })
      .hover();
    await window.getByRole("button", { name: `New thread in ${basename(workspaceA)}` }).click();
    await expect.poll(async () => (await getDesktopState(window)).activeView).toBe("new-thread");

    await expect.poll(async () => {
      const state = await getDesktopState(window);
      return state.selectedWorkspaceId;
    }).toBe(projectA.id);
  } finally {
    await harness.close();
  }
});
