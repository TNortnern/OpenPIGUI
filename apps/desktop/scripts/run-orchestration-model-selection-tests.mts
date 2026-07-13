/**
 * Pure resolver tests for child-thread model routing.
 *
 * Run from repo root (or apps/desktop):
 *   node --experimental-strip-types apps/desktop/scripts/run-orchestration-model-selection-tests.mts
 */
import assert from "node:assert/strict";
import type { RuntimeModelRecord } from "@pi-gui/session-driver";
import {
  ChildModelResolutionError,
  resolveChildModelSelection,
} from "../electron/orchestration-model-selection.ts";

const tests: Array<{ name: string; fn: () => void }> = [];

function test(name: string, fn: () => void): void {
  tests.push({ name, fn });
}

function model(
  providerId: string,
  modelId: string,
  available = true,
): RuntimeModelRecord {
  return {
    providerId,
    providerName: providerId,
    modelId,
    label: modelId,
    available,
    authType: "api-key",
    reasoning: false,
    supportsImages: false,
  };
}

const catalog = [
  model("openai", "gpt-5"),
  model("openai", "gpt-4o"),
  model("anthropic", "claude-sonnet-4"),
];

console.log("orchestration-model-selection");

test("provider + model resolves an exact available pair", () => {
  const resolved = resolveChildModelSelection({
    request: { provider: "openai", modelId: "gpt-4o" },
    models: catalog,
  });
  assert.deepEqual(resolved, {
    provider: "openai",
    modelId: "gpt-4o",
    source: "explicit",
  });
});

test("provider + model rejects unavailable auth", () => {
  assert.throws(
    () =>
      resolveChildModelSelection({
        request: { provider: "openai", modelId: "gpt-5" },
        models: [model("openai", "gpt-5", false)],
      }),
    ChildModelResolutionError,
  );
});

test("model only infers a unique provider", () => {
  const resolved = resolveChildModelSelection({
    request: { modelId: "gpt-4o" },
    models: catalog,
  });
  assert.equal(resolved.source, "discovered");
  assert.equal(resolved.provider, "openai");
});

test("model only rejects duplicate ids across providers", () => {
  assert.throws(
    () =>
      resolveChildModelSelection({
        request: { modelId: "shared-model" },
        models: [model("openai", "shared-model"), model("anthropic", "shared-model")],
      }),
    /ambiguous/i,
  );
});

test("provider only resolves a single eligible model", () => {
  const resolved = resolveChildModelSelection({
    request: { provider: "anthropic" },
    models: catalog,
  });
  assert.equal(resolved.modelId, "claude-sonnet-4");
});

test("provider only rejects multiple eligible models", () => {
  assert.throws(
    () =>
      resolveChildModelSelection({
        request: { provider: "openai" },
        models: catalog,
      }),
    /ambiguous/i,
  );
});

test("neither inherits the parent active model", () => {
  const resolved = resolveChildModelSelection({
    request: {},
    parent: { provider: "openai", modelId: "gpt-5" },
    models: catalog,
  });
  assert.equal(resolved.source, "inherited");
});

test("neither falls back to configured default when parent is stale", () => {
  const resolved = resolveChildModelSelection({
    request: {},
    parent: { provider: "openai", modelId: "missing-model" },
    defaultSelection: { provider: "openai", modelId: "gpt-4o" },
    models: catalog,
  });
  assert.equal(resolved.source, "default");
  assert.equal(resolved.modelId, "gpt-4o");
});

test("normalizes provider and model casing", () => {
  const resolved = resolveChildModelSelection({
    request: { provider: "OpenAI", modelId: "GPT-4O" },
    models: catalog,
  });
  assert.equal(resolved.provider, "openai");
  assert.equal(resolved.modelId, "gpt-4o");
});

let passed = 0;
let failed = 0;

for (const entry of tests) {
  try {
    entry.fn();
    passed += 1;
    console.log(`  ok  - ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${entry.name}`);
    console.error(error);
  }
}

console.log("");
if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`All ${passed} orchestration model selection tests passed`);
}
