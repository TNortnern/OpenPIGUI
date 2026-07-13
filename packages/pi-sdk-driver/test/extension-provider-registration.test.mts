import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, ModelRegistry, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { RuntimeSupervisor } from "../dist/runtime-supervisor.js";

async function withTempAgentDir(fn: (agentDir: string, workspacePath: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "pi-ext-providers-"));
  const agentDir = join(root, "agent");
  const workspacePath = join(root, "workspace");
  try {
    await mkdir(agentDir, { recursive: true });
    await mkdir(workspacePath, { recursive: true });
    await writeFile(join(agentDir, "auth.json"), "{}\n", "utf8");
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: {} }, null, 2), "utf8");
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ packages: [], enabledModels: [] }, null, 2),
      "utf8",
    );
    await fn(agentDir, workspacePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("runtime snapshot includes models from extension registerProvider", async () => {
  await withTempAgentDir(async (agentDir, workspacePath) => {
    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
    const supervisor = new RuntimeSupervisor({
      agentDir,
      authStorage,
      modelRegistry,
      extensionFactories: [
        (pi: ExtensionAPI) => {
          pi.registerProvider("ext-demo", {
            name: "Extension Demo",
            baseUrl: "https://example.test",
            apiKey: "test-key-not-an-env-ref",
            api: "openai-completions",
            models: [
              {
                id: "demo-model",
                name: "Demo Model",
                input: ["text"],
                contextWindow: 32_000,
                maxTokens: 4096,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              },
            ],
          });
        },
      ],
    });

    const snapshot = await supervisor.getRuntimeSnapshot({
      workspaceId: "ws-1",
      path: workspacePath,
    });

    const model = snapshot.models.find(
      (entry) => entry.providerId === "ext-demo" && entry.modelId === "demo-model",
    );
    assert.ok(model, "extension-registered model should appear in runtime snapshot");
    assert.equal(model.available, true);
    assert.equal(model.providerName, "Extension Demo");
    assert.deepEqual(model.thinkingLevels, ["off"]);

    const provider = snapshot.providers.find((entry) => entry.id === "ext-demo");
    assert.ok(provider, "extension provider should appear in runtime snapshot");
    assert.equal(provider.name, "Extension Demo");
    assert.equal(provider.hasAuth, true);
  });
});
