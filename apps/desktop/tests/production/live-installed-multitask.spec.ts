import { expect, test } from "@playwright/test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createNamedThread,
  getDesktopState,
  launchDesktopByExecutable,
  makeUserDataDir,
  makeWorkspace,
} from "../helpers/electron-app";

const installedExecutable = "/Applications/OpenPIGUI.app/Contents/MacOS/OpenPIGUI";
const realAgentDir = join(homedir(), ".pi", "agent");

test("LIVE installed app: Enter while running spawns peer and Working shows 2+", async () => {
  test.setTimeout(360_000);

  const userDataDir = await makeUserDataDir("pi-gui-live-multitask-");
  const workspacePath = await makeWorkspace("live-multitask-proof");

  const harness = await launchDesktopByExecutable(installedExecutable, userDataDir, {
    agentDir: realAgentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
    inheritParentEnv: true,
    scrubProviderEnv: false,
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Live multitask proof");
    const composer = window.getByTestId("composer");
    await composer.waitFor({ timeout: 30_000 });

    await composer.fill(
      "Reply with exactly: PARENT_STARTED. Then use the shell tool to run: sleep 120. After that reply PARENT_DONE.",
    );
    await composer.press("Enter");

    await expect(window.getByTestId("composer-status-working-pill")).toBeVisible({ timeout: 120_000 });
    await expect(window.getByTestId("composer-status-working-pill")).toHaveText(/1 Working/);

    await expect(composer).toHaveValue("", { timeout: 30_000 });
    await composer.fill("Reply with exactly: CHILD_STARTED and then use shell: sleep 60");
    await composer.press("Enter");
    await expect(composer).toHaveValue("", { timeout: 30_000 });

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        if (state.lastError) {
          throw new Error(state.lastError);
        }
        return state.orchestrationChildren.length;
      }, { timeout: 90_000 })
      .toBeGreaterThan(0);

    await expect(window.getByTestId("composer-status-working-pill")).toHaveText(/[2-9] Working/, {
      timeout: 90_000,
    });

    await window.getByTestId("composer-status-working-pill").click();
    await expect(window.getByRole("dialog", { name: /Working/i })).toBeVisible();
    await expect(window.getByRole("dialog", { name: /Working/i })).toContainText(/Working/);
    await window.screenshot({ path: "/tmp/live-multitask-working-2.png" });

    const finalState = await getDesktopState(window);
    console.log(
      JSON.stringify(
        {
          lastError: finalState.lastError ?? null,
          selectedSessionId: finalState.selectedSessionId,
          children: finalState.orchestrationChildren.map((child) => ({
            title: child.title,
            status: child.status,
            parent: child.parentSessionId,
            child: child.childSessionId,
          })),
          runningSessions: finalState.workspaces
            .find((workspace) => workspace.id === finalState.selectedWorkspaceId)
            ?.sessions.filter((session) => session.status === "running")
            .map((session) => ({ id: session.id, title: session.title })),
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
  }
});
