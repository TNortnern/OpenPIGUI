import assert from "node:assert/strict";
import {
  contextUsageSummary,
  formatContextPercent,
  formatElapsedSince,
  formatTokenCount,
  formatTokensPerSecond,
} from "../src/composer-context-usage.ts";

assert.equal(formatTokenCount(495), "495");
assert.equal(formatTokenCount(1200), "1.2K");
assert.equal(formatTokenCount(9800), "9.8K");
assert.equal(formatTokenCount(103_000), "103K");
assert.equal(formatTokenCount(1_100_000), "1.1M");

assert.equal(formatContextPercent(40.2), "40%");
assert.equal(formatContextPercent(null), undefined);

assert.deepEqual(
  contextUsageSummary({
    tokens: 102_600,
    contextWindow: 256_000,
    percent: 40.078,
  }),
  {
    percentLabel: "40%",
    tokensLabel: "103K / 256K tokens",
    percent: 40.078,
    tokens: 102_600,
    contextWindow: 256_000,
    tokensPerSecond: null,
  },
);

assert.equal(formatTokensPerSecond(12.34), "12.3");
assert.equal(formatTokensPerSecond(120), "120");
assert.equal(
  contextUsageSummary({
    tokens: 1000,
    contextWindow: 10_000,
    percent: 10,
    tokensPerSecond: 42.5,
  }).tokensPerSecondLabel,
  "42.5 tok/s",
);

assert.equal(formatElapsedSince(new Date(Date.now() - 47_000).toISOString(), Date.now()), "47s");
assert.equal(formatElapsedSince(new Date(Date.now() - (30 * 60 + 47) * 1000).toISOString(), Date.now()), "30m 47s");

console.log("composer-context-usage tests passed");
