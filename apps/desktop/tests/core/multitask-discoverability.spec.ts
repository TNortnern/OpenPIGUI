import { expect, test } from "@playwright/test";
import type { SessionDriverEvent, SessionQueuedMessage, SessionRef, WorkspaceRef } from "@pi-gui/session-driver";
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
  queuedMessages: readonly SessionQueuedMessage[] = [],
): Promise<void> {
  const context = await selectedSessionContext(window);
  const timestamp = new Date().toISOString();
  const event: Extract<SessionDriverEvent, { type: "sessionUpdated" }> = {
    type: "sessionUpdated",
    sessionRef: context.sessionRef,
    timestamp,
    runId: "multitask-discoverability-run",
    snapshot: {
      ref: context.sessionRef,
      workspace: context.workspace,
      title: context.title,
      status: "running",
      updatedAt: timestamp,
      preview: "Working…",
      runningRunId: "multitask-discoverability-run",
      queuedMessages,
    },
  };
  await emitTestSessionEvent(harness, event);
}

test("shows Multitask and Working pills while a prompt is running", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("multitask-discoverability");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Multitask discoverability");

    await emitRunningSnapshot(harness, window);
    await expect(window.getByTestId("composer-status-working-pill")).toBeVisible({ timeout: 15_000 });
    // Multitask must appear as soon as a run is active — not only after a follow-up is queued.
    await expect(window.getByTestId("composer-status-multitask-pill")).toBeVisible();
    await expect(window.getByTestId("composer-status-multitask-pill")).toHaveText(/Multitask/);

    await window.getByTestId("composer-status-working-pill").click();
    await expect(window.getByRole("dialog", { name: /Working/i })).toBeVisible();

    await window.getByTestId("composer-status-multitask-pill").click();
    const multitaskDialog = window.getByRole("dialog", { name: "Multitask" });
    await expect(multitaskDialog).toBeVisible();
    await expect(multitaskDialog).toContainText("Enter queues it next. ⌘Enter steers the current run.");
    const dialogLayout = await multitaskDialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        viewportWidth: window.innerWidth,
        hasHorizontalOverflow: element.scrollWidth > element.clientWidth,
      };
    });
    expect(dialogLayout.left).toBeGreaterThanOrEqual(0);
    expect(dialogLayout.right).toBeLessThanOrEqual(dialogLayout.viewportWidth);
    expect(dialogLayout.hasHorizontalOverflow).toBe(false);

    const queuedMessage: SessionQueuedMessage = {
      id: "queued-multitask-1",
      mode: "followUp",
      text: "queue this after the run",
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await emitRunningSnapshot(harness, window, [queuedMessage]);
    await expect(window.getByTestId("composer-status-multitask-pill")).toHaveText(/Multitask · 1/);
    await expect(window.getByTestId("queued-composer-message")).toContainText("queue this after the run");
  } finally {
    await harness.close();
  }
});
