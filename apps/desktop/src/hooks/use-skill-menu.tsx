import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import type { RuntimeSkillRecord, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import {
  extractSkillDollarQuery,
  formatSkillSourceLabel,
  listComposerSkills,
  skillChipLabel,
  skillTokenRangeForBackspace,
} from "../composer-skill-tokens";
import { nextMenuIndex } from "./use-slash-menu";

export interface SkillMenuOption {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly sourceLabel: string;
  readonly slashCommand: string;
  readonly skill: RuntimeSkillRecord;
}

interface UseSkillMenuParams {
  readonly composerDraft: string;
  readonly setComposerDraft: (draft: string) => void;
  readonly composerRef: RefObject<HTMLTextAreaElement | null>;
  readonly runtime?: RuntimeSnapshot;
}

export interface SkillMenuState {
  readonly showSkillMenu: boolean;
  readonly skillOptions: readonly SkillMenuOption[];
  readonly selectedIndex: number;
  readonly handleSkillKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  readonly insertSkill: (option: SkillMenuOption) => void;
}

export function useSkillMenu({
  composerDraft,
  setComposerDraft,
  composerRef,
  runtime,
}: UseSkillMenuParams): SkillMenuState {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [suppressed, setSuppressed] = useState(false);

  const skillMatch = useMemo(() => (suppressed ? null : extractSkillDollarQuery(composerDraft)), [composerDraft, suppressed]);

  useEffect(() => {
    setSuppressed(false);
  }, [composerDraft]);

  const skillOptions = useMemo(() => {
    if (!skillMatch) {
      return [];
    }
    const query = skillMatch.query.toLowerCase();
    const workspacePath = runtime?.workspace.path;
    return listComposerSkills(runtime)
      .filter((skill) => {
        if (!query) {
          return true;
        }
        return [skill.name, skill.description, skill.slashCommand].some((value) =>
          value.toLowerCase().includes(query),
        );
      })
      .map<SkillMenuOption>((skill) => ({
        id: skill.filePath,
        name: skill.name,
        label: skillChipLabel(skill.name),
        description: skill.description,
        sourceLabel: formatSkillSourceLabel(skill, workspacePath),
        slashCommand: skill.slashCommand,
        skill,
      }));
  }, [runtime, skillMatch]);

  const showSkillMenu = skillOptions.length > 0;

  useEffect(() => {
    setSelectedIndex(0);
  }, [skillOptions.length, skillMatch?.query]);

  const insertSkill = useCallback(
    (option: SkillMenuOption) => {
      if (!skillMatch) {
        return;
      }
      const before = composerDraft.slice(0, skillMatch.dollarIndex);
      const afterCursor = composerDraft.slice(skillMatch.dollarIndex + 1 + skillMatch.query.length);
      const inserted = `${option.slashCommand} `;
      const newDraft = `${before}${inserted}${afterCursor}`;
      setComposerDraft(newDraft);
      setSuppressed(true);
      requestAnimationFrame(() => {
        const textarea = composerRef.current;
        if (textarea) {
          const newPos = before.length + inserted.length;
          textarea.setSelectionRange(newPos, newPos);
          textarea.focus();
        }
      });
    },
    [composerDraft, composerRef, setComposerDraft, skillMatch],
  );

  const handleSkillKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (event.key === "Backspace" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const textarea = event.currentTarget;
        if (textarea.selectionStart === textarea.selectionEnd) {
          const range = skillTokenRangeForBackspace(composerDraft, textarea.selectionStart);
          if (range) {
            event.preventDefault();
            const next = `${composerDraft.slice(0, range.start)}${composerDraft.slice(range.end)}`;
            setComposerDraft(next);
            requestAnimationFrame(() => {
              composerRef.current?.setSelectionRange(range.start, range.start);
            });
            return true;
          }
        }
      }

      if (!showSkillMenu) {
        return false;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => nextMenuIndex(prev, 1, skillOptions.length));
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => nextMenuIndex(prev, -1, skillOptions.length));
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSuppressed(true);
        return true;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        const option = skillOptions[selectedIndex];
        if (!option) {
          return false;
        }
        event.preventDefault();
        insertSkill(option);
        return true;
      }
      return false;
    },
    [composerDraft, composerRef, insertSkill, selectedIndex, setComposerDraft, showSkillMenu, skillOptions],
  );

  return {
    showSkillMenu,
    skillOptions,
    selectedIndex: showSkillMenu ? selectedIndex % skillOptions.length : 0,
    handleSkillKeyDown,
    insertSkill,
  };
}
