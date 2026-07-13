import type { RuntimeSkillRecord, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";

const SKILL_TOKEN_RE = /\/skill:([^\s]+)/g;

function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type ComposerSkillDraftPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "skill"; readonly token: string; readonly label: string };

export function extractSkillDollarQuery(text: string): { query: string; dollarIndex: number } | null {
  const match = /(?:^|\s)\$([^\s]*)$/.exec(text);
  if (!match) {
    return null;
  }
  const query = match[1] ?? "";
  const dollarIndex = text.length - query.length - 1;
  return { query, dollarIndex };
}

export function listComposerSkills(runtime: RuntimeSnapshot | undefined): readonly RuntimeSkillRecord[] {
  if (!runtime?.settings.enableSkillCommands) {
    return [];
  }
  return runtime.skills.filter((skill) => skill.enabled);
}

export function formatSkillSourceLabel(skill: RuntimeSkillRecord, workspacePath?: string): string {
  if (workspacePath && skill.filePath.startsWith(workspacePath)) {
    return "Project";
  }
  const source = skill.source.toLowerCase();
  if (source === "user" || source.includes("user") || source.includes("personal")) {
    return "Personal";
  }
  if (source === "project" || source.includes("project")) {
    return "Project";
  }
  return titleCase(skill.source) || "Personal";
}

export function skillChipLabel(skillName: string): string {
  return titleCase(skillName);
}

export function splitComposerDraftSkills(
  draft: string,
  labelForCommand: (commandName: string) => string,
): readonly ComposerSkillDraftPart[] {
  const parts: ComposerSkillDraftPart[] = [];
  let lastIndex = 0;
  for (const match of draft.matchAll(SKILL_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ kind: "text", text: draft.slice(lastIndex, index) });
    }
    const commandName = match[1] ?? "";
    parts.push({
      kind: "skill",
      token: match[0],
      label: labelForCommand(commandName),
    });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < draft.length) {
    parts.push({ kind: "text", text: draft.slice(lastIndex) });
  }
  return parts;
}

export function draftHasSkillChips(draft: string): boolean {
  SKILL_TOKEN_RE.lastIndex = 0;
  return SKILL_TOKEN_RE.test(draft);
}

/** Range to delete as one chip when Backspace lands on/after a `/skill:…` token. */
export function skillTokenRangeForBackspace(draft: string, cursor: number): { start: number; end: number } | undefined {
  if (cursor <= 0) {
    return undefined;
  }
  for (const match of draft.matchAll(SKILL_TOKEN_RE)) {
    const start = match.index ?? 0;
    const tokenEnd = start + match[0].length;
    const end = draft[tokenEnd] === " " ? tokenEnd + 1 : tokenEnd;
    if (cursor > start && cursor <= end) {
      return { start, end };
    }
  }
  return undefined;
}
