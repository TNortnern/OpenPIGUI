import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("routes child threads to explicitly requested models without orphan sessions", async () => {
  test.setTimeout(90_000);

  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("orchestration-model-routing");
  await seedAgentDir(agentDir, {
    enabledModels: ["openai/gpt-5", "openai/gpt-4o"],
    withDefaultModel: true,
  });

  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Routing parent");

    const state = await getDesktopState(window);
    const session = state.workspaces.find((entry) => entry.id === workspace.id)?.sessions[0];
    expect(session).toBeTruthy();
    expect(workspace.id).toBeTruthy();
    expect(session!.id).toBeTruthy();

    const before = await getDesktopState(window);
    const beforeSessions = before.workspaces.find((entry) => entry.id === workspace.id)?.sessions.length ?? 0;
    const beforeChildren = before.orchestrationChildren.length;

    const result = await harness.electronApp.evaluate(
      async (_modules, payload) => {
        const { workspaceId, sessionId } = payload as { workspaceId: string; sessionId: string };
        const hooks = (globalThis as {
          __PI_APP_TEST_HOOKS?: {
            runOrchestrationRuntimeTool?: (input: {
              toolName: string;
              sessionRef: { workspaceId: string; sessionId: string };
              params: Record<string, string>;
            }) => Promise<{ details?: Record<string, unknown> }>;
          };
        }).__PI_APP_TEST_HOOKS;
        return hooks?.runOrchestrationRuntimeTool?.({
          toolName: "create_child_thread",
          toolCallId: "test-routing-success",
          sessionRef: { workspaceId, sessionId },
          params: {
            prompt: "Investigate routing",
            provider: "openai",
            model: "gpt-4o",
          },
        });
      },
      { workspaceId: workspace.id, sessionId: session!.id },
    );

    expect(result?.details?.resolvedModel).toBe("gpt-4o");
    expect(result?.details?.resolvedProvider).toBe("openai");

    const after = await getDesktopState(window);
    const afterSessions = after.workspaces.find((entry) => entry.id === workspace.id)?.sessions.length ?? 0;
    expect(afterSessions).toBe(beforeSessions + 1);
    expect(after.orchestrationChildren.length).toBe(beforeChildren + 1);

    const ambiguous = await harness.electronApp.evaluate(
      async (_modules, payload) => {
        const { workspaceId, sessionId } = payload as { workspaceId: string; sessionId: string };
        const hooks = (globalThis as {
          __PI_APP_TEST_HOOKS?: {
            runOrchestrationRuntimeTool?: (input: {
              toolName: string;
              sessionRef: { workspaceId: string; sessionId: string };
              params: Record<string, string>;
            }) => Promise<{ details?: Record<string, unknown> }>;
          };
        }).__PI_APP_TEST_HOOKS;
        return hooks?.runOrchestrationRuntimeTool?.({
          toolName: "create_child_thread",
          toolCallId: "test-routing-failure",
          sessionRef: { workspaceId, sessionId },
          params: {
            prompt: "Should fail",
            provider: "openai",
            model: "missing-model",
          },
        });
      },
      { workspaceId: workspace.id, sessionId: session!.id },
    );

    expect(ambiguous?.details?.error).toBeTruthy();

    const unchanged = await getDesktopState(window);
    expect(unchanged.orchestrationChildren.length).toBe(after.orchestrationChildren.length);
  } finally {
    await harness.close();
  }
});
