import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
} from "../helpers/electron-app";

test("composer error banner can be dismissed without sending another message", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("composer-error-dismiss-workspace");
  await seedAgentDir(agentDir);

  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Dismiss error session");

    const composer = window.getByTestId("composer");
    await composer.fill("/tree bogus");
    await expect(window.getByTestId("slash-menu")).toHaveCount(0);
    await composer.press("Enter");

    const banner = window.getByTestId("composer-error-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("/tree does not take arguments.");
    await expect(window.getByTestId("composer-error-dismiss")).toBeVisible();

    await window.getByTestId("composer-error-dismiss").click();
    await expect(banner).toHaveCount(0);
    await expect.poll(async () => (await getDesktopState(window)).lastError ?? null).toBeNull();
  } finally {
    await harness.close();
  }
});
