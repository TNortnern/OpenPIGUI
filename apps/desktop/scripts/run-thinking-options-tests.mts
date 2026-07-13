import assert from "node:assert/strict";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import {
  modelSupportsThinkingSelector,
  thinkingOptionsForModel,
} from "../src/thinking-options.ts";

function runtimeWithModels(
  models: RuntimeSnapshot["models"],
): RuntimeSnapshot {
  return {
    workspace: { workspaceId: "ws", path: "/tmp" },
    providers: [],
    models,
    skills: [],
    extensions: [],
    settings: { enableSkillCommands: true, enabledModelPatterns: [] },
  };
}

const grok = runtimeWithModels([
  {
    providerId: "xai",
    providerName: "xAI",
    modelId: "grok-4.5",
    label: "Grok 4.5",
    available: true,
    authType: "api_key",
    reasoning: true,
    thinkingLevels: ["off", "minimal", "low", "medium", "high"],
    supportsImages: true,
  },
]);

const plain = runtimeWithModels([
  {
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-4o",
    label: "GPT-4o",
    available: true,
    authType: "api_key",
    reasoning: false,
    thinkingLevels: ["off"],
    supportsImages: true,
  },
]);

assert.deepEqual(
  thinkingOptionsForModel(grok, "xai", "grok-4.5").map((option) => option.value),
  ["off", "minimal", "low", "medium", "high"],
);
assert.equal(modelSupportsThinkingSelector(grok, "xai", "grok-4.5"), true);
assert.equal(modelSupportsThinkingSelector(plain, "openai", "gpt-4o"), false);
assert.deepEqual(thinkingOptionsForModel(plain, "openai", "gpt-4o").map((o) => o.value), ["off"]);

console.log("thinking-options tests passed");
