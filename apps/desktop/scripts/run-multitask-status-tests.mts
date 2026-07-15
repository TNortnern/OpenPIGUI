import assert from "node:assert/strict";
import {
  MULTITASK_SLASH_COMMAND,
  filterSlashCommandsWhileRunning,
  matchesMultitaskSlashQuery,
  multitaskPillLabel,
  shouldShowMultitask,
} from "../src/multitask-status.ts";

assert.equal(shouldShowMultitask(false), false);
assert.equal(shouldShowMultitask(true), true);
assert.equal(multitaskPillLabel(0), "Multitask");
assert.equal(multitaskPillLabel(1), "Multitask · 1");
assert.equal(multitaskPillLabel(3), "Multitask · 3");

assert.equal(MULTITASK_SLASH_COMMAND, "/multitask");
assert.equal(matchesMultitaskSlashQuery("/"), true);
assert.equal(matchesMultitaskSlashQuery("/multit"), true);
assert.equal(matchesMultitaskSlashQuery("/multitask"), true);
assert.equal(matchesMultitaskSlashQuery("/model"), false);

const hostCommands = [
  { command: "/multitask", availableWhileRunning: true },
  { command: "/model", availableWhileRunning: undefined },
  { command: "/status", availableWhileRunning: false },
] as const;

assert.deepEqual(
  filterSlashCommandsWhileRunning(hostCommands, false).map((command) => command.command),
  ["/multitask", "/model", "/status"],
);
assert.deepEqual(
  filterSlashCommandsWhileRunning(hostCommands, true).map((command) => command.command),
  ["/multitask"],
);

console.log("multitask-status tests passed");
