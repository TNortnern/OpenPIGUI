import assert from "node:assert/strict";
import {
  createOptimisticUserMessage,
  mergeOptimisticTranscript,
  reconcileOptimisticUserMessages,
} from "../src/optimistic-composer.ts";

const pending = createOptimisticUserMessage({
  id: "client-1",
  text: "hello",
});
assert.equal(pending.kind, "message");
assert.equal(pending.role, "user");
assert.equal(pending.id, "client-1");
assert.equal(pending.text, "hello");

const merged = mergeOptimisticTranscript([], [pending]);
assert.equal(merged.length, 1);
assert.equal(merged[0]?.id, "client-1");

const withServer = mergeOptimisticTranscript(
  [{ kind: "message", id: "client-1", role: "user", text: "hello", createdAt: pending.createdAt }],
  [pending],
);
assert.equal(withServer.length, 1);

const remaining = reconcileOptimisticUserMessages(
  [pending, createOptimisticUserMessage({ id: "client-2", text: "next" })],
  [{ kind: "message", id: "client-1", role: "user", text: "hello", createdAt: pending.createdAt }],
);
assert.deepEqual(
  remaining.map((message) => message.id),
  ["client-2"],
);

console.log("optimistic-composer tests passed");
