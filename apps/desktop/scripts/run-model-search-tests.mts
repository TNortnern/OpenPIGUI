import assert from "node:assert/strict";
import {
  matchesModelSearch,
  normalizeModelSearchText,
  tokenizeModelSearchQuery,
} from "../src/model-search.ts";

assert.equal(normalizeModelSearchText("GLM-5.2"), "glm 5.2");
assert.equal(normalizeModelSearchText("fireworks/glm_5.2"), "fireworks glm 5.2");
assert.deepEqual(tokenizeModelSearchQuery("  glm-5.2  "), ["glm", "5.2"]);

const wafer = ["wafer", "Wafer", "GLM-5.2", "GLM-5.2"];
const fireworks = ["fireworks", "Fireworks", "glm-5.2-fast", "GLM 5.2 Fast"];

assert.equal(matchesModelSearch("glm 5.2", wafer), true);
assert.equal(matchesModelSearch("glm 5.2", fireworks), true);
assert.equal(matchesModelSearch("glm-5.2", wafer), true);
assert.equal(matchesModelSearch("fireworks glm", fireworks), true);
assert.equal(matchesModelSearch("fireworks glm", wafer), false);
assert.equal(matchesModelSearch("", wafer), true);
assert.equal(matchesModelSearch("   ", fireworks), true);
assert.equal(matchesModelSearch("openai", wafer), false);

console.log("model-search tests passed");
