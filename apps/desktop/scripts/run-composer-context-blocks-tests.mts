import assert from "node:assert/strict";
import {
  appendComposerContextBlock,
  COMPOSER_THREAD_MIME,
  formatAttachedChatBlock,
  formatTerminalSelectionBlock,
  parseThreadDropPayload,
  serializeThreadDropPayload,
} from "../src/composer-context-blocks.ts";

assert.equal(formatTerminalSelectionBlock("   \n  "), "");
assert.equal(
  formatTerminalSelectionBlock("ls -la\nREADME.md\n"),
  ["```text terminal", "ls -la\nREADME.md", "```"].join("\n"),
);

const chatBlock = formatAttachedChatBlock({
  workspaceId: "ws-1",
  sessionId: "sess-9",
  title: "Fix login",
  preview: "user: what broke?\nassistant: the token refresh",
});
assert.match(chatBlock, /sessionId: `sess-9`/);
assert.match(chatBlock, /workspaceId: `ws-1`/);
assert.match(chatBlock, /title: Fix login/);
assert.match(chatBlock, /token refresh/);
assert.match(chatBlock, /full transcript was not injected/i);

const longPreview = "x".repeat(2_500);
const truncated = formatAttachedChatBlock({
  workspaceId: "ws",
  sessionId: "s",
  title: "t",
  preview: longPreview,
});
assert.match(truncated, /preview truncated/);
assert.ok(!truncated.includes("x".repeat(2_100)));

assert.equal(appendComposerContextBlock("", "block"), "block\n");
assert.equal(appendComposerContextBlock("hello", "block"), "hello\n\nblock\n");
assert.equal(appendComposerContextBlock("hello\n\n", "block"), "hello\n\nblock\n");
assert.equal(appendComposerContextBlock("keep", "  "), "keep");

const payload = {
  workspaceId: "ws-a",
  sessionId: "sess-b",
  title: "Thread",
  preview: "hi",
};
const raw = serializeThreadDropPayload(payload);
assert.equal(parseThreadDropPayload(raw)?.sessionId, "sess-b");
assert.equal(parseThreadDropPayload("{not-json"), null);
assert.equal(parseThreadDropPayload(JSON.stringify({ sessionId: "only" })), null);
assert.equal(COMPOSER_THREAD_MIME, "application/x-openpigui-thread");

console.log("composer-context-blocks checks passed");
