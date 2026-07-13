import assert from "node:assert/strict";
import {
  isSessionRowClick,
  SESSION_ROW_CLICK_MOVE_THRESHOLD_PX,
} from "../src/session-row-pointer.ts";

assert.equal(SESSION_ROW_CLICK_MOVE_THRESHOLD_PX, 6);
assert.equal(isSessionRowClick(null, { x: 0, y: 0 }), false);
assert.equal(isSessionRowClick({ x: 10, y: 10 }, { x: 10, y: 10 }), true);
assert.equal(isSessionRowClick({ x: 10, y: 10 }, { x: 14, y: 12 }), true);
assert.equal(isSessionRowClick({ x: 10, y: 10 }, { x: 20, y: 10 }), false);
assert.equal(isSessionRowClick({ x: 0, y: 0 }, { x: 3, y: 4 }, 5), false);
assert.equal(isSessionRowClick({ x: 0, y: 0 }, { x: 3, y: 4 }, 6), true);

console.log("session-row-pointer checks passed");
