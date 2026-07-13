import assert from "node:assert/strict";
import {
  isModelPatternEnabled,
  modelPatternKey,
  nextScopedPatternsAfterProviderToggle,
  nextScopedPatternsAfterToggle,
  providerVisibilityState,
  showAllScopedPatterns,
} from "../src/model-visibility.ts";

const available = [
  "anthropic/opus",
  "anthropic/sonnet",
  "openai/gpt",
  "ollama/glm",
] as const;

assert.equal(modelPatternKey("anthropic", "opus"), "anthropic/opus");
assert.equal(isModelPatternEnabled([], "anthropic/opus"), true);
assert.equal(isModelPatternEnabled(["anthropic/opus"], "openai/gpt"), false);
assert.equal(providerVisibilityState([], ["anthropic/opus", "anthropic/sonnet"]), "all");
assert.equal(providerVisibilityState(["anthropic/opus"], ["anthropic/opus", "anthropic/sonnet"]), "some");
assert.equal(providerVisibilityState(["openai/gpt"], ["anthropic/opus", "anthropic/sonnet"]), "none");

{
  const next = nextScopedPatternsAfterToggle({
    currentPatterns: [],
    availablePatterns: available,
    pattern: "openai/gpt",
    enable: false,
  });
  assert.deepEqual(next, ["anthropic/opus", "anthropic/sonnet", "ollama/glm"]);
}

{
  const next = nextScopedPatternsAfterToggle({
    currentPatterns: ["anthropic/opus"],
    availablePatterns: available,
    pattern: "openai/gpt",
    enable: true,
  });
  assert.deepEqual(next, ["anthropic/opus", "openai/gpt"]);
}

{
  const next = nextScopedPatternsAfterToggle({
    currentPatterns: ["anthropic/opus"],
    availablePatterns: available,
    pattern: "anthropic/opus",
    enable: false,
  });
  assert.equal(next, undefined);
}

{
  const next = nextScopedPatternsAfterToggle({
    currentPatterns: ["anthropic/opus", "anthropic/sonnet", "openai/gpt", "ollama/glm"],
    availablePatterns: available,
    pattern: "openai/gpt",
    enable: true,
  });
  assert.deepEqual(next, []);
}

{
  const next = nextScopedPatternsAfterProviderToggle({
    currentPatterns: [],
    availablePatterns: available,
    providerPatterns: ["anthropic/opus", "anthropic/sonnet"],
    enable: false,
  });
  assert.deepEqual(next, ["openai/gpt", "ollama/glm"]);
}

{
  const next = nextScopedPatternsAfterProviderToggle({
    currentPatterns: ["openai/gpt"],
    availablePatterns: available,
    providerPatterns: ["anthropic/opus", "anthropic/sonnet"],
    enable: true,
  });
  assert.deepEqual(next, ["openai/gpt", "anthropic/opus", "anthropic/sonnet"]);
}

{
  const next = nextScopedPatternsAfterProviderToggle({
    currentPatterns: ["anthropic/opus", "anthropic/sonnet"],
    availablePatterns: available,
    providerPatterns: ["anthropic/opus", "anthropic/sonnet"],
    enable: false,
  });
  assert.equal(next, undefined);
}

{
  const next = nextScopedPatternsAfterProviderToggle({
    currentPatterns: ["openai/gpt", "ollama/glm"],
    availablePatterns: available,
    providerPatterns: ["anthropic/opus", "anthropic/sonnet"],
    enable: true,
  });
  assert.deepEqual(next, []);
}

assert.deepEqual(showAllScopedPatterns(), []);

console.log("model-visibility: ok");
