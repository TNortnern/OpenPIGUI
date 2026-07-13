import assert from "node:assert/strict";
import {
  draftHasSkillChips,
  extractSkillDollarQuery,
  formatSkillSourceLabel,
  skillChipLabel,
  skillTokenRangeForBackspace,
  splitComposerDraftSkills,
} from "../src/composer-skill-tokens.ts";

assert.deepEqual(extractSkillDollarQuery("hello $"), { query: "", dollarIndex: 6 });
assert.deepEqual(extractSkillDollarQuery("use $ani"), { query: "ani", dollarIndex: 4 });
assert.equal(extractSkillDollarQuery("price is $50 and more"), null);
assert.equal(extractSkillDollarQuery("no trigger"), null);

assert.equal(skillChipLabel("animate"), "Animate");
assert.equal(skillChipLabel("agent-browser"), "Agent Browser");

assert.equal(
  formatSkillSourceLabel(
    {
      name: "animate",
      description: "x",
      filePath: "/Users/me/.pi/agent/skills/animate/SKILL.md",
      baseDir: "/Users/me/.pi/agent/skills/animate",
      source: "user",
      enabled: true,
      disableModelInvocation: false,
      slashCommand: "/skill:animate",
    },
    "/repo",
  ),
  "Personal",
);

assert.equal(
  formatSkillSourceLabel(
    {
      name: "ship",
      description: "x",
      filePath: "/repo/.pi/skills/ship/SKILL.md",
      baseDir: "/repo/.pi/skills/ship",
      source: "path",
      enabled: true,
      disableModelInvocation: false,
      slashCommand: "/skill:ship",
    },
    "/repo",
  ),
  "Project",
);

assert.equal(draftHasSkillChips("hi /skill:animate please"), true);
assert.equal(draftHasSkillChips("hi $animate"), false);

const parts = splitComposerDraftSkills("hi /skill:animate now", (name) => skillChipLabel(name));
assert.deepEqual(parts, [
  { kind: "text", text: "hi " },
  { kind: "skill", token: "/skill:animate", label: "Animate" },
  { kind: "text", text: " now" },
]);

assert.deepEqual(skillTokenRangeForBackspace("hi /skill:animate ", 17), { start: 3, end: 18 });
assert.equal(skillTokenRangeForBackspace("hi /skill:animate ", 2), undefined);

console.log("composer-skill-tokens checks passed");
