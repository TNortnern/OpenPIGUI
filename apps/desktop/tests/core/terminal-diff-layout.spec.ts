import { basename } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  createNamedThread,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectTerminalInRightRail(window: Page): Promise<void> {
  const terminal = window.getByTestId("integrated-terminal");
  const rail = window.getByTestId("right-rail");
  const conversation = window.locator(".conversation, .canvas").first();

  await expect(terminal).toBeVisible();
  await expect(rail).toBeVisible();

  const terminalBox = await terminal.boundingBox();
  const railBox = await rail.boundingBox();
  const conversationBox = await conversation.boundingBox();
  expect(terminalBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  if (!terminalBox || !railBox) {
    throw new Error("Expected terminal and right-rail boxes");
  }

  // Terminal lives inside the right rail, not under the composer.
  expect(terminalBox.x).toBeGreaterThanOrEqual(railBox.x - 1);
  expect(terminalBox.width).toBeLessThanOrEqual(railBox.width + 2);

  if (conversationBox) {
    expect(railBox.x).toBeGreaterThanOrEqual(conversationBox.x + conversationBox.width - 2);
  }
}

async function waitForShellAndRunMarker(window: Page, workspacePath: string, marker: string): Promise<void> {
  const terminal = window.getByTestId("integrated-terminal");
  const shellText = async () => ((await terminal.locator(".xterm-rows").innerText()) ?? "").replace(/\s+/g, " ").trim();
  const looksReady = (text: string) =>
    text.length > 0 &&
    (new RegExp(`${escapeRegExp(basename(workspacePath))}|[#$%]`).test(text) || text.length > 3);

  await terminal.locator(".xterm").click();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await expect.poll(async () => looksReady(await shellText()), { timeout: attempt === 0 ? 12_000 : 20_000 }).toBe(true);
      break;
    } catch {
      if (attempt === 1) {
        throw new Error("Integrated terminal shell never became ready after restart");
      }
      await window.getByLabel("Restart terminal").click();
      await terminal.locator(".xterm").click();
    }
  }

  await terminal.locator(".xterm").click();
  await window.keyboard.type(`echo ${marker}`);
  await window.keyboard.press("Enter");
  await expect(terminal.locator(".xterm-rows")).toContainText(marker, { timeout: 15_000 });
}

test("hosts Terminal in the right rail and switches modes without bottom docking", async () => {
  test.setTimeout(90_000);

  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("terminal-diff-layout");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Terminal and Changes layout");

    // Open Terminal first so the PTY is live before layout mode churn.
    await window.getByLabel("Toggle terminal").click();
    await expectTerminalInRightRail(window);
    await expect(window.locator(".diff-panel")).toHaveCount(0);

    // Composer remains visible when not in takeover; terminal is to the right, not below.
    await expect(window.getByTestId("composer")).toBeVisible();
    const terminalBox = await window.getByTestId("integrated-terminal").boundingBox();
    const composerBox = await window.getByTestId("composer").boundingBox();
    expect(terminalBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    if (terminalBox && composerBox) {
      expect(terminalBox.x).toBeGreaterThanOrEqual(composerBox.x + composerBox.width - 2);
    }

    // Distinctive output before mode-switching (Criterion 2: replay survives mode switch).
    await waitForShellAndRunMarker(window, workspacePath, "__PI_RAIL_REPLAY_OK__");

    // Switch to Changes — terminal unmounts but PTYs stay alive in main.
    await window.getByLabel("Toggle changes").click();
    const diffPanel = window.locator(".diff-panel");
    await expect(diffPanel.locator(".diff-panel__title")).toContainText("Changes");
    await expect(window.getByTestId("right-rail")).toBeVisible();
    await expect(window.getByTestId("integrated-terminal")).toHaveCount(0);

    // Reopen Terminal and assert prior output is replayed.
    await window.getByLabel("Toggle terminal").click();
    await expectTerminalInRightRail(window);
    await expect(window.locator(".diff-panel")).toHaveCount(0);
    await expect(window.getByTestId("integrated-terminal").locator(".xterm-rows")).toContainText(
      "__PI_RAIL_REPLAY_OK__",
      { timeout: 15_000 },
    );

    // Takeover geometry: expands into the conversation column.
    const beforeTakeover = await window.getByTestId("integrated-terminal").boundingBox();
    await window.getByLabel("Maximize terminal").click();
    await expect(window.getByTestId("integrated-terminal")).toHaveClass(/terminal-panel--takeover/);
    await expect(window.getByTestId("composer")).toHaveCount(0);
    await expect(window.getByTestId("right-rail")).toHaveClass(/right-rail--takeover/);

    const takeover = await window.getByTestId("integrated-terminal").boundingBox();
    const beforeArea = (beforeTakeover?.width ?? 0) * (beforeTakeover?.height ?? 0);
    const takeoverArea = (takeover?.width ?? 0) * (takeover?.height ?? 0);
    expect(takeoverArea).toBeGreaterThan(beforeArea * 0.9);
    expect(takeover?.width ?? 0).toBeGreaterThanOrEqual((beforeTakeover?.width ?? 0) - 1);

    await window.getByLabel("Restore terminal").click();
    await expect(window.getByTestId("integrated-terminal")).not.toHaveClass(/terminal-panel--takeover/);
    await expect(window.getByTestId("composer")).toBeVisible();
    await expectTerminalInRightRail(window);
    // Replay still present after takeover restore.
    await expect(window.getByTestId("integrated-terminal").locator(".xterm-rows")).toContainText(
      "__PI_RAIL_REPLAY_OK__",
    );
  } finally {
    await harness.close();
  }
});
