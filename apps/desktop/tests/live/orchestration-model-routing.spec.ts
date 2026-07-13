import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  createNamedThread,
  getDesktopState,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("spawns child threads on explicitly requested live models", async () => {
  const auth = getRealAuthConfig();
  test.skip(!auth.enabled, auth.skipReason);
  test.setTimeout(180_000);

  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("live-orchestration-model-routing");
  await seedAgentDir(agentDir, {
    enabledModels: ["openai/gpt-5", "openai/gpt-4o"],
    withDefaultModel: true,
  });

  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    realAuthSourceDir: auth.sourceDir,
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Live routing parent");
    const state = await getDesktopState(window);
    const session = state.workspaces.find((entry) => entry.id === workspace.id)?.sessions[0];
    expect(session).toBeTruthy();

    const result = await harness.electronApp.evaluate(
      async (_modules, { workspaceId, sessionId }) => {
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
          sessionRef: { workspaceId, sessionId },
          params: {
            prompt: "Live routing proof",
            model: "gpt-4o",
          },
        });
      },
      { workspaceId: workspace.id, sessionId: session!.id },
    );

    expect(result?.details?.resolvedModel).toBe("gpt-4o");
  } finally {
    await harness.close();
  }
});
