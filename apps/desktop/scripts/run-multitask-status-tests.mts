import assert from "node:assert/strict";
import { multitaskPillLabel, shouldShowMultitask } from "../src/multitask-status.ts";

assert.equal(shouldShowMultitask(false), false);
assert.equal(shouldShowMultitask(true), true);
assert.equal(multitaskPillLabel(0), "Multitask");
assert.equal(multitaskPillLabel(1), "Multitask · 1");
assert.equal(multitaskPillLabel(3), "Multitask · 3");

console.log("multitask-status tests passed");
