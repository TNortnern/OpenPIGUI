import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveTokensPerSecond } from "../dist/index.js";

function sessionWithAssistant(options: {
  readonly output: number;
  readonly timestamp: number;
}): Parameters<typeof deriveTokensPerSecond>[0] {
  return {
    messages: [
      { role: "user", content: "hi", timestamp: options.timestamp - 5_000 },
      {
        role: "assistant",
        content: "hello",
        timestamp: options.timestamp,
        usage: { output: options.output },
      },
    ],
  } as Parameters<typeof deriveTokensPerSecond>[0];
}

describe("deriveTokensPerSecond", () => {
  it("returns null without a generation start (avoids TTFT-inflated prior-message math)", () => {
    const session = sessionWithAssistant({ output: 100, timestamp: 10_000 });
    assert.equal(deriveTokensPerSecond(session, null), null);
    assert.equal(deriveTokensPerSecond(session, undefined), null);
  });

  it("uses first-delta → message-end window instead of prior message timestamp", () => {
    // Prior message was 5s earlier (would be ~20 tok/s). Generation ran 1s → 100 tok/s.
    const session = sessionWithAssistant({ output: 100, timestamp: 10_000 });
    assert.equal(deriveTokensPerSecond(session, 9_000, 10_000), 100);
  });

  it("returns null when the generation window is empty or inverted", () => {
    const session = sessionWithAssistant({ output: 50, timestamp: 10_000 });
    assert.equal(deriveTokensPerSecond(session, 10_000, 10_000), null);
    assert.equal(deriveTokensPerSecond(session, 11_000, 10_000), null);
  });
});
