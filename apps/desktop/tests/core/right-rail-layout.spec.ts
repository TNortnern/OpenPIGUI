import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  desktopShortcut,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("opens a shared right rail with deterministic mode switching and horizontal resize", async () => {
  test.setTimeout(90_000);

  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("right-rail-layout");
  let persistedWidth = 0;

  const firstRun = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await firstRun.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Right rail thread");

    const terminalButton = window.getByLabel("Toggle terminal");
    const changesButton = window.getByLabel("Toggle changes");
    const filesButton = window.getByLabel("Toggle files");
    const browserButton = window.getByLabel("Toggle browser");
    await expect(terminalButton).toHaveAttribute("aria-pressed", "false");
    await expect(changesButton).toHaveAttribute("aria-pressed", "false");
    await expect(filesButton).toHaveAttribute("aria-pressed", "false");
    await expect(browserButton).toHaveAttribute("aria-pressed", "false");

    const actionLabels = await window.locator(".topbar__actions button").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );
    expect(actionLabels).toEqual(["Toggle terminal", "Toggle changes", "Toggle files", "Toggle browser"]);

    await expect(window.getByTestId("right-rail")).toHaveCount(0);

    await window.getByLabel("Toggle terminal").click();
    const rail = window.getByTestId("right-rail");
    await expect(rail).toBeVisible();
    await expect(terminalButton).toHaveAttribute("aria-pressed", "true");
    await expect(window.getByTestId("integrated-terminal")).toBeVisible();

    const conversation = window.locator(".conversation, .canvas").first();
    const conversationBox = await conversation.boundingBox();
    const railBox = await rail.boundingBox();
    expect(conversationBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    if (conversationBox && railBox) {
      expect(railBox.x).toBeGreaterThanOrEqual(conversationBox.x + conversationBox.width - 2);
    }

    // Same-mode toggle closes.
    await window.keyboard.press(desktopShortcut("J"));
    await expect(window.getByTestId("right-rail")).toHaveCount(0);

    // Different mode switches in place.
    await window.getByLabel("Toggle changes").click();
    await expect(window.locator(".diff-panel")).toBeVisible();
    await window.getByLabel("Toggle files").click();
    await expect(window.locator(".diff-panel")).toBeVisible();
    await expect(window.getByTestId("integrated-terminal")).toHaveCount(0);
    await window.getByLabel("Toggle terminal").click();
    await expect(window.getByTestId("integrated-terminal")).toBeVisible();
    await expect(window.locator(".diff-panel")).toHaveCount(0);

    // Horizontal resize updates rail width and persists into app state.
    // Drive the handle by coordinates (left edge sits under the body without force).
    const handle = window.getByTestId("right-rail-resize-handle");
    await expect(handle).toBeVisible();
    const before = await rail.boundingBox();
    expect(before).not.toBeNull();
    if (!before) {
      throw new Error("Expected rail box");
    }
    const startX = before.x + 1;
    const startY = before.y + 48;
    await window.mouse.move(startX, startY);
    await window.mouse.down();
    await window.mouse.move(startX - 100, startY, { steps: 8 });
    await window.mouse.up();
    await expect
      .poll(async () => (await rail.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before.width + 20);

    await expect
      .poll(async () => (await getDesktopState(window)).rightRail.width, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(before.width + 20);

    persistedWidth = (await getDesktopState(window)).rightRail.width;
    expect(persistedWidth).toBeGreaterThan(before.width + 20);
  } finally {
    await firstRun.close();
  }

  // Criterion 5: rail width restored after relaunch (same userDataDir, no initialWorkspaces seed).
  const secondRun = await launchDesktop(userDataDir, { testMode: "background" });
  try {
    const window = await secondRun.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await expect
      .poll(async () => (await getDesktopState(window)).rightRail.width, { timeout: 15_000 })
      .toBe(persistedWidth);

    // Open terminal so the CSS width is applied to the live rail geometry.
    await window.getByLabel("Toggle terminal").click();
    const rail = window.getByTestId("right-rail");
    await expect(rail).toBeVisible();
    await expect
      .poll(async () => Math.round((await rail.boundingBox())?.width ?? 0), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(persistedWidth - 2);
  } finally {
    await secondRun.close();
  }
});
