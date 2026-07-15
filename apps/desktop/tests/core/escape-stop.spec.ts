import { expect, test } from "@playwright/test";
import type { SessionDriverEvent, SessionRef, WorkspaceRef } from "@pi-gui/session-driver";
import {
  createNamedThread,
  emitTestSessionEvent,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
} from "../helpers/electron-app";

async function selectedSessionContext(window: Parameters<typeof getDesktopState>[0]): Promise<{
  readonly sessionRef: SessionRef;
  readonly workspace: WorkspaceRef;
  readonly title: string;
}> {
  const state = await getDesktopState(window);
  const workspace = state.workspaces.find((entry) => entry.id === state.selectedWorkspaceId);
  if (!workspace) {
    throw new Error("Expected a selected workspace");
  }
  const session = workspace.sessions.find((entry) => entry.id === state.selectedSessionId);
  if (!session) {
    throw new Error("Expected a selected session");
  }
  return {
    sessionRef: {
      workspaceId: workspace.id,
      sessionId: session.id,
    },
    workspace: {
      workspaceId: workspace.id,
      path: workspace.path,
      displayName: workspace.name,
    },
    title: session.title,
  };
}

async function emitRunningSnapshot(
  harness: Awaited<ReturnType<typeof launchDesktop>>,
  window: Parameters<typeof getDesktopState>[0],
): Promise<void> {
  const context = await selectedSessionContext(window);
  const timestamp = new Date().toISOString();
  const event: Extract<SessionDriverEvent, { type: "sessionUpdated" }> = {
    type: "sessionUpdated",
    sessionRef: context.sessionRef,
    timestamp,
    snapshot: {
      ref: context.sessionRef,
      workspace: context.workspace,
      title: context.title,
      status: "running",
      updatedAt: timestamp,
      preview: "Working…",
      queuedMessages: [],
    },
  };
  await emitTestSessionEvent(harness, event);
}

test("Escape stops a running prompt from the composer", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("escape-stop-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Escape stop thread");
    await emitRunningSnapshot(harness, window);

    await expect(window.getByTestId("composer-status-working-pill")).toBeVisible({ timeout: 15_000 });
    await expect(window.getByRole("button", { name: "Stop run" })).toBeVisible();

    const composer = window.getByTestId("composer");
    await composer.click();
    await composer.press("Escape");

    await expect(window.getByRole("button", { name: "Send message" })).toBeVisible({ timeout: 15_000 });
    await expect(window.getByTestId("composer-status-working-pill")).toHaveCount(0);
  } finally {
    await harness.close();
  }
});
