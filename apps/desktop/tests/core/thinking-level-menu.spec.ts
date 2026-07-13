import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
  seedAgentDir,
} from "../helpers/electron-app";

test("thinking level dropdown keeps full labels and aligned descriptions", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("thinking-level-menu-workspace");
  await seedAgentDir(agentDir);
  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await openNewThread(window);

    const thinkingBadge = window.locator(".new-thread__hint .model-selector__badge").nth(1);
    await expect(thinkingBadge).toBeVisible();
    await thinkingBadge.click();

    const dropdown = window.locator(".model-selector__dropdown--thinking");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText("Thinking Level");

    // Seeded default is openai/gpt-5 — pi supports minimal..high (not xhigh/max).
    const expectedLabels = ["Minimal", "Low", "Medium", "High"];
    for (const label of expectedLabels) {
      const row = dropdown.locator(".model-selector__item--thinking").filter({ hasText: label }).first();
      await expect(row).toBeVisible();
      const labelEl = row.locator(".model-selector__item-label");
      await expect(labelEl).toHaveText(label);
      const truncated = await labelEl.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
      expect(truncated, `${label} should not be ellipsized`).toBe(false);
    }

    await expect(dropdown.locator(".model-selector__item--thinking").filter({ hasText: "Extra High" })).toHaveCount(0);
    await expect(dropdown.locator(".model-selector__item--thinking").filter({ hasText: "Max" })).toHaveCount(0);

    await expect(dropdown.locator(".model-selector__item-meta").filter({
      hasText: "Balances speed and reasoning depth",
    })).toBeVisible();
  } finally {
    await harness.close();
  }
});
