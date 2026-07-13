import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  seedForkSessionFixture,
  selectSession,
} from "../helpers/electron-app";

test("copies canonical markdown from user and assistant messages with accessible feedback", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("message-actions-workspace");
  await seedAgentDir(agentDir);
  await seedForkSessionFixture(agentDir, workspacePath);

  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await selectSession(window, "Fork fixture session");
    const transcript = window.getByTestId("transcript");
    await expect(transcript).toContainText("Second fork answer");

    const userMessage = transcript.locator(".timeline-item--user").first();
    await userMessage.hover();
    await userMessage.getByTestId("copy-message").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(userMessage.getByText("Copied")).toBeVisible();
    await expect
      .poll(async () => harness.electronApp.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("First fork question");

    const assistantMessage = transcript.locator(".timeline-item--assistant", { hasText: "Second fork answer" });
    await assistantMessage.hover();
    await assistantMessage.getByTestId("copy-message").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(assistantMessage.getByText("Copied")).toBeVisible();
    await expect
      .poll(async () => harness.electronApp.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("Second fork answer");

    await expect(userMessage.getByTestId("fork-from-message")).toHaveCount(0);
  } finally {
    await harness.close();
  }
});
