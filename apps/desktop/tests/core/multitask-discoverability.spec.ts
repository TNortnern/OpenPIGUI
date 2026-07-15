import { expect, test } from "@playwright/test";
import { join } from "node:path";
import type { SessionDriverEvent, SessionQueuedMessage, SessionRef, WorkspaceRef } from "@pi-gui/session-driver";
import {
  createNamedThread,
  emitTestSessionEvent,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
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

test("shows Multitask badge while running and keeps the composer typeable", async () => {
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
    await expect(window.getByTestId("composer-multitask-badge")).toBeVisible();
    await expect(window.getByTestId("composer-multitask-badge")).toContainText("Enter spawns");

    // No Multitask overlay dialog — composer stays typeable.
    await expect(window.getByRole("dialog", { name: "Multitask" })).toHaveCount(0);
    const composer = window.getByTestId("composer");
    await composer.fill("spawn this as a peer agent");
    await expect(composer).toHaveValue("spawn this as a peer agent");

    await window.getByTestId("composer-status-working-pill").click();
    await expect(window.getByRole("dialog", { name: /Working/i })).toBeVisible();

    const queuedMessage: SessionQueuedMessage = {
      id: "queued-multitask-1",
      mode: "followUp",
      text: "legacy queued follow-up",
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await emitRunningSnapshot(harness, window, [queuedMessage]);
    await expect(window.getByTestId("composer-status-multitask-pill")).toHaveText(/Multitask · 1/);
    await expect(window.getByTestId("composer-multitask-badge")).toContainText(/Multitask · 1/);
    await expect(window.getByTestId("queued-composer-message")).toContainText("legacy queued follow-up");
  } finally {
    await harness.close();
  }
});

test("autocompletes and triggers /multitask from the slash menu", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("multitask-slash");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Multitask slash");
    const composer = window.getByTestId("composer");

    await composer.fill("/multit");
    await expect(window.getByTestId("slash-menu")).toBeVisible({ timeout: 15_000 });
    await expect(window.getByTestId("slash-menu")).toContainText("/multitask");
    await composer.press("Tab");
    await expect(composer).toHaveValue("/multitask");
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
    await expect(window.getByTestId("composer-multitask-badge")).toBeVisible();
    await expect(window.getByTestId("composer-multitask-badge")).toContainText("Multitask");

    await emitRunningSnapshot(harness, window);
    await expect(window.getByTestId("composer-status-working-pill")).toBeVisible({ timeout: 15_000 });
    await composer.fill("/multit");
    await expect(window.getByTestId("slash-menu")).toBeVisible();
    await expect(window.getByTestId("slash-menu")).toContainText("/multitask");
    await expect(window.getByTestId("slash-menu")).not.toContainText("/model");
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
    await expect(window.getByTestId("composer-multitask-badge")).toBeVisible();
    await expect(window.getByTestId("queued-composer-messages")).toHaveCount(0);
  } finally {
    await harness.close();
  }
});

test("Enter while running spawns a peer agent and bumps Working count", async () => {
  test.setTimeout(120_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("multitask-spawn");
  await seedAgentDir(agentDir, {
    enabledModels: ["openai/gpt-5", "openai/gpt-4o"],
    withDefaultModel: true,
    withOpenAiAuth: true,
  });
  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Multitask spawn");
    const before = await selectedSessionContext(window);

    await emitRunningSnapshot(harness, window);
    await expect(window.getByTestId("composer-status-working-pill")).toBeVisible({ timeout: 15_000 });
    await expect(window.getByTestId("composer-status-working-pill")).toHaveText(/1 Working/);

    const composer = window.getByTestId("composer");
    await composer.fill("do this in parallel");
    await composer.press("Enter");
    await expect(composer).toHaveValue("", { timeout: 15_000 });

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        if (state.lastError) {
          throw new Error(state.lastError);
        }
        return state.orchestrationChildren.filter(
          (child) => child.parentSessionId === before.sessionRef.sessionId,
        ).length;
      }, { timeout: 30_000 })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const workspace = state.workspaces.find((entry) => entry.id === before.sessionRef.workspaceId);
        return workspace?.sessions.length ?? 0;
      }, { timeout: 30_000 })
      .toBeGreaterThan(1);

    // Stay on the parent chat while the peer agent is tracked.
    const after = await getDesktopState(window);
    expect(after.selectedSessionId).toBe(before.sessionRef.sessionId);
    const child = after.orchestrationChildren.find(
      (entry) => entry.parentSessionId === before.sessionRef.sessionId,
    );
    expect(child).toBeTruthy();

    // Spawn refreshes catalog state from the driver, which clears the harness's fake
    // parent "running" stamp. Re-stamp parent + child so Working counts both peers.
    await emitRunningSnapshot(harness, window);
    const childRunAt = new Date().toISOString();
    await emitTestSessionEvent(harness, {
      type: "sessionUpdated",
      sessionRef: {
        workspaceId: child!.childWorkspaceId,
        sessionId: child!.childSessionId,
      },
      timestamp: childRunAt,
      runId: "multitask-spawn-child-run",
      snapshot: {
        ref: {
          workspaceId: child!.childWorkspaceId,
          sessionId: child!.childSessionId,
        },
        workspace: before.workspace,
        title: child!.title,
        status: "running",
        updatedAt: childRunAt,
        preview: "Working…",
        runningRunId: "multitask-spawn-child-run",
        queuedMessages: [],
      },
    });

    await expect(window.getByTestId("composer-status-working-pill")).toHaveText(/2 Working/, {
      timeout: 15_000,
    });
  } finally {
    await harness.close();
  }
});
