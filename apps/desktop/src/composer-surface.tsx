import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode, type RefObject, type UIEvent } from "react";
import type { ComposerAttachment } from "./desktop-state";
import type { MentionOption } from "./hooks/use-mention-menu";
import type { SkillMenuOption } from "./hooks/use-skill-menu";
import type {
  ComposerSlashCommand,
  ComposerSlashCommandSection,
  ComposerSlashOption,
  ComposerSlashOptionEmptyState,
} from "./composer-commands";
import { draftHasSkillChips, skillChipLabel, splitComposerDraftSkills } from "./composer-skill-tokens";
import { hasFilesInDataTransfer } from "./composer-attachments";
import { hasThreadDropInDataTransfer } from "./composer-context-blocks";
import { ExtensionDock, type ExtensionDockModel } from "./extension-session-ui";
import { ExtensionIcon, FileIcon, ModelIcon, ReasoningIcon, SettingsIcon, SkillIcon, SparkIcon, StatusIcon } from "./icons";
import { QueuedComposerMessages } from "./queued-composer-messages";

type ExtensionMentionOption = Extract<MentionOption, { kind: "extension" }>;
type FileMentionOption = Extract<MentionOption, { kind: "file" }>;
type ComposerDragKind = "files" | "thread" | null;

interface ComposerSurfaceProps {
  readonly lastError?: string;
  readonly onDismissLastError?: () => void;
  readonly activeSlashCommand?: ComposerSlashCommand;
  readonly activeSlashCommandMeta?: string;
  readonly topNotice?: ReactNode;
  readonly composerDraft: string;
  readonly setComposerDraft: (draft: string) => void;
  readonly composerRef: RefObject<HTMLTextAreaElement | null>;
  readonly attachments: readonly ComposerAttachment[];
  /** When set, shows a Multitask mode chip above the input (Cursor-style; no overlay). */
  readonly multitaskLabel?: string;
  readonly queuedMessages: readonly import("./desktop-state").QueuedComposerMessage[];
  readonly editingQueuedMessageId?: string;
  readonly slashSections: readonly ComposerSlashCommandSection[];
  readonly slashOptions: readonly ComposerSlashOption[];
  readonly selectedSlashCommand?: ComposerSlashCommand;
  readonly selectedSlashOption?: ComposerSlashOption;
  readonly showSlashMenu: boolean;
  readonly showSlashOptionMenu: boolean;
  readonly slashOptionEmptyState?: ComposerSlashOptionEmptyState;
  readonly onClearSlashCommand: () => void;
  readonly onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onComposerPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  readonly onComposerDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly onRemoveAttachment: (attachmentId: string) => void;
  readonly onEditQueuedMessage: (messageId: string) => void;
  readonly onCancelQueuedEdit: () => void;
  readonly onRemoveQueuedMessage: (messageId: string) => void;
  readonly onSteerQueuedMessage: (messageId: string) => void;
  readonly onSelectSlashCommand: (command: ComposerSlashCommand) => void;
  readonly onSelectSlashOption: (option: ComposerSlashOption) => void;
  readonly showMentionMenu: boolean;
  readonly mentionOptions: readonly MentionOption[];
  readonly selectedMentionIndex: number;
  readonly onSelectMention: (option: MentionOption) => void;
  readonly onEnableMentionExtension: (option: ExtensionMentionOption) => void;
  readonly showSkillMenu?: boolean;
  readonly skillOptions?: readonly SkillMenuOption[];
  readonly selectedSkillIndex?: number;
  readonly onSelectSkill?: (option: SkillMenuOption) => void;
  readonly skillChipSkills?: readonly { readonly name: string; readonly slashCommand: string }[];
  readonly textareaLabel: string;
  readonly textareaTestId: string;
  readonly textareaPlaceholder: string;
  readonly textareaClassName?: string;
  readonly extensionDock?: ExtensionDockModel;
  readonly extensionDockExpanded?: boolean;
  readonly onToggleExtensionDock?: () => void;
  readonly footer: ReactNode;
}

export function ComposerSurface({
  lastError,
  onDismissLastError,
  activeSlashCommand,
  activeSlashCommandMeta,
  topNotice,
  composerDraft,
  setComposerDraft,
  composerRef,
  attachments,
  multitaskLabel,
  queuedMessages,
  editingQueuedMessageId,
  slashSections,
  slashOptions,
  selectedSlashCommand,
  selectedSlashOption,
  showSlashMenu,
  showSlashOptionMenu,
  slashOptionEmptyState,
  onClearSlashCommand,
  onComposerKeyDown,
  onComposerPaste,
  onComposerDrop,
  onRemoveAttachment,
  onEditQueuedMessage,
  onCancelQueuedEdit,
  onRemoveQueuedMessage,
  onSteerQueuedMessage,
  onSelectSlashCommand,
  onSelectSlashOption,
  showMentionMenu,
  mentionOptions,
  selectedMentionIndex,
  onSelectMention,
  onEnableMentionExtension,
  showSkillMenu = false,
  skillOptions = [],
  selectedSkillIndex = 0,
  onSelectSkill,
  skillChipSkills = [],
  textareaLabel,
  textareaTestId,
  textareaPlaceholder,
  textareaClassName,
  extensionDock,
  extensionDockExpanded = false,
  onToggleExtensionDock,
  footer,
}: ComposerSurfaceProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragKind, setDragKind] = useState<ComposerDragKind>(null);
  const dragDepthRef = useRef(0);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const showSkillChips = draftHasSkillChips(composerDraft);
  const skillLabelByCommand = useMemo(() => {
    const map = new Map<string, string>();
    for (const skill of skillChipSkills) {
      const commandName = skill.slashCommand.replace(/^\/+/, "").replace(/^skill:/, "");
      map.set(commandName.toLowerCase(), skillChipLabel(skill.name));
    }
    return map;
  }, [skillChipSkills]);
  const draftParts = useMemo(
    () =>
      splitComposerDraftSkills(composerDraft, (commandName) => {
        return skillLabelByCommand.get(commandName.toLowerCase()) ?? skillChipLabel(commandName);
      }),
    [composerDraft, skillLabelByCommand],
  );

  useEffect(() => {
    const textarea = composerRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) {
      return;
    }
    mirror.scrollTop = textarea.scrollTop;
  }, [composerDraft, composerRef, showSkillChips]);

  const clearDragState = () => {
    dragDepthRef.current = 0;
    setIsDragActive(false);
    setDragKind(null);
  };

  const resolveDragKind = (dataTransfer: DataTransfer | null | undefined): ComposerDragKind => {
    if (hasThreadDropInDataTransfer(dataTransfer)) {
      return "thread";
    }
    if (hasFilesInDataTransfer(dataTransfer)) {
      return "files";
    }
    return null;
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    const kind = resolveDragKind(event.dataTransfer);
    if (!kind) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
    setDragKind(kind);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!isDragActive) {
      return;
    }
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
      setDragKind(null);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const kind = resolveDragKind(event.dataTransfer);
    if (!kind) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDragActive) {
      setIsDragActive(true);
      setDragKind(kind);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    clearDragState();
    onComposerDrop(event);
  };

  return (
    <div
      className={`composer__surface ${isDragActive ? "composer__surface--drag-active" : ""}`}
      data-testid={`${textareaTestId}-surface`}
      onPaste={onComposerPaste}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {isDragActive ? (
        <div className="composer__drop-indicator" data-testid="composer-drop-indicator">
          {dragKind === "thread" ? "Drop chat to attach as context" : "Drop images or files to attach"}
        </div>
      ) : null}
      {activeSlashCommand ? (
        <div className="composer__slash-intent">
          <span className="composer__slash-intent-icon" aria-hidden="true">
            <SlashCommandIcon command={activeSlashCommand} />
          </span>
          <span className="composer__slash-intent-body">
            <span className="composer__slash-intent-title">{activeSlashCommand.title}</span>
            {activeSlashCommandMeta ? (
              <span className="composer__slash-intent-meta">{activeSlashCommandMeta}</span>
            ) : null}
          </span>
          <button
            aria-label={`Clear ${activeSlashCommand.title}`}
            className="composer__slash-intent-clear"
            type="button"
            onClick={onClearSlashCommand}
          >
            ×
          </button>
        </div>
      ) : null}
      {multitaskLabel ? (
        <div className="composer__multitask-badge" data-testid="composer-multitask-badge">
          <span className="composer__multitask-badge-label">{multitaskLabel}</span>
          <span className="composer__multitask-badge-hint">Enter queues · ⌘Enter steers</span>
        </div>
      ) : null}
      <QueuedComposerMessages
        messages={queuedMessages}
        editingQueuedMessageId={editingQueuedMessageId}
        onEditMessage={onEditQueuedMessage}
        onCancelEdit={onCancelQueuedEdit}
        onRemoveMessage={onRemoveQueuedMessage}
        onSteerMessage={onSteerQueuedMessage}
      />
      {attachments.length > 0 ? (
        <div className="composer__attachments">
          {attachments.map((attachment) => (
            <div className={`composer-attachment composer-attachment--${attachment.kind}`} key={attachment.id}>
              {attachment.kind === "image" ? (
                <img
                  alt={attachment.name}
                  className="composer-attachment__preview"
                  src={`data:${attachment.mimeType};base64,${attachment.data}`}
                />
              ) : (
                <span className="composer-attachment__icon" aria-hidden="true">
                  <FileIcon />
                </span>
              )}
              <span className="composer-attachment__name">{attachment.name}</span>
              <button
                aria-label={`Remove ${attachment.name}`}
                className="composer-attachment__remove"
                type="button"
                onClick={() => onRemoveAttachment(attachment.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {extensionDock && onToggleExtensionDock ? (
        <ExtensionDock dock={extensionDock} expanded={extensionDockExpanded} onToggle={onToggleExtensionDock} />
      ) : null}
      {lastError ? (
        <div className="composer__error error-banner" data-testid="composer-error-banner" role="alert">
          <span className="error-banner__text">{lastError}</span>
          {onDismissLastError ? (
            <button
              type="button"
              className="error-banner__dismiss"
              data-testid="composer-error-dismiss"
              aria-label="Dismiss error"
              onClick={onDismissLastError}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="composer__editor">
        {topNotice}
        {showSkillMenu ? (
          <div className="composer__menus">
            <div className="skill-menu" data-testid="skill-menu" onWheel={(event) => event.stopPropagation()}>
              {skillOptions.map((option, index) => (
                <button
                  className={`skill-menu__item ${selectedSkillIndex === index ? "skill-menu__item--active" : ""}`}
                  key={option.id}
                  type="button"
                  onClick={() => onSelectSkill?.(option)}
                >
                  <span className="skill-menu__icon" aria-hidden="true">
                    <SkillIcon />
                  </span>
                  <span className="skill-menu__content">
                    <span className="skill-menu__title">{option.label}</span>
                    <span className="skill-menu__description">{option.description}</span>
                  </span>
                  <span className="skill-menu__source">{option.sourceLabel}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {showMentionMenu ? (
          <div className="composer__menus">
            <div className="mention-menu" data-testid="mention-menu" onWheel={(event) => event.stopPropagation()}>
              <MentionMenuSections
                options={mentionOptions}
                selectedIndex={selectedMentionIndex}
                onSelect={onSelectMention}
                onEnableExtension={onEnableMentionExtension}
              />
            </div>
          </div>
        ) : null}
        {showSlashMenu || (showSlashOptionMenu && selectedSlashCommand) ? (
          <div className="composer__menus">
            {showSlashMenu ? (
              <div className="slash-menu" data-testid="slash-menu" onWheel={(event) => event.stopPropagation()}>
                {slashSections.map((section) => (
                  <div className="slash-menu__section" key={section.id}>
                    {section.title ? (
                      <div className={`slash-menu__section-title slash-menu__section-title--${section.id}`}>
                        <span className="slash-menu__section-icon" aria-hidden="true">
                          {section.id === "runtime" ? <SparkIcon /> : <SettingsIcon />}
                        </span>
                        <span>{section.title}</span>
                      </div>
                    ) : null}
                    {section.items.map((command) => (
                      <button
                        className={`slash-menu__item ${command.section === "runtime" ? "slash-menu__item--skill" : ""} ${selectedSlashCommand?.id === command.id ? "slash-menu__item--active" : ""}`}
                        key={command.id}
                        type="button"
                        onClick={() => onSelectSlashCommand(command)}
                      >
                        <span className="slash-menu__icon" aria-hidden="true">
                          <SlashCommandIcon command={command} />
                        </span>
                        {command.section === "runtime" ? (
                          <span className="slash-menu__content slash-menu__content--skill">
                            <span className="slash-menu__line">
                              <span className="slash-menu__title">{command.title}</span>
                              {command.sourceLabel ? <span className="slash-menu__skill-badge">{command.sourceLabel}</span> : null}
                              {command.compatibility?.status === "terminal-only" ? (
                                <span className="slash-menu__skill-badge slash-menu__skill-badge--warning">Terminal-only</span>
                              ) : null}
                            </span>
                            <span className="slash-menu__description">{command.description}</span>
                            <span className="slash-menu__meta">
                              <span className="slash-menu__command slash-menu__command--skill">{command.command}</span>
                            </span>
                          </span>
                        ) : (
                          <span className="slash-menu__content">
                            <span className="slash-menu__line">
                              <span className="slash-menu__title">{command.title}</span>
                              <span className="slash-menu__command">{command.command}</span>
                            </span>
                            <span className="slash-menu__description">{command.description}</span>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {showSlashOptionMenu && selectedSlashCommand ? (
              <div className="slash-menu slash-menu--options" data-testid="slash-options-menu" onWheel={(event) => event.stopPropagation()}>
                <div className="slash-menu__search">{selectedSlashCommand.title}</div>
                {slashOptions.length > 0
                  ? slashOptions.map((option) => (
                      <button
                        className={`slash-menu__option ${selectedSlashOption?.value === option.value ? "slash-menu__option--active" : ""}`}
                        key={option.value}
                        type="button"
                        onClick={() => onSelectSlashOption(option)}
                      >
                        <span className="slash-menu__option-title">{option.label}</span>
                        <span className="slash-menu__option-description">{option.description}</span>
                      </button>
                    ))
                  : slashOptionEmptyState ? (
                      <div className="slash-menu__empty">
                        <div className="slash-menu__empty-title">{slashOptionEmptyState.title}</div>
                        <div className="slash-menu__empty-description">{slashOptionEmptyState.description}</div>
                      </div>
                    ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={`composer__field${showSkillChips ? " composer__field--chips" : ""}`}>
          {showSkillChips ? (
            <div aria-hidden="true" className="composer__mirror" ref={mirrorRef}>
              {draftParts.map((part, index) =>
                part.kind === "skill" ? (
                  <span className="composer__skill-chip" key={`skill-${index}-${part.token}`}>
                    <span className="composer__skill-chip-spacer" aria-hidden="true">
                      {part.token}
                    </span>
                    <span className="composer__skill-chip-face">
                      <span className="composer__skill-chip-icon">
                        <SkillIcon />
                      </span>
                      <span className="composer__skill-chip-label">{part.label}</span>
                    </span>
                  </span>
                ) : (
                  <span key={`text-${index}`}>{part.text}</span>
                ),
              )}
            </div>
          ) : null}
          <textarea
            aria-label={textareaLabel}
            className={[textareaClassName, showSkillChips ? "composer__textarea--chips" : ""].filter(Boolean).join(" ")}
            data-testid={textareaTestId}
            ref={composerRef}
            value={composerDraft}
            onChange={(event) => {
              setComposerDraft(event.target.value);
            }}
            onKeyDown={onComposerKeyDown}
            onScroll={(event: UIEvent<HTMLTextAreaElement>) => {
              if (mirrorRef.current) {
                mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
              }
            }}
            placeholder={textareaPlaceholder}
          />
        </div>
        <div className="composer__bar">{footer}</div>
      </div>
    </div>
  );
}

function MentionMenuSections({
  options,
  selectedIndex,
  onSelect,
  onEnableExtension,
}: {
  readonly options: readonly MentionOption[];
  readonly selectedIndex: number;
  readonly onSelect: (option: MentionOption) => void;
  readonly onEnableExtension: (option: ExtensionMentionOption) => void;
}) {
  const extensionOptions = options.filter((option): option is ExtensionMentionOption => option.kind === "extension");
  const fileOptions = options.filter((option): option is FileMentionOption => option.kind === "file");

  return (
    <>
      {extensionOptions.length > 0 ? (
        <MentionMenuSection
          title="Extensions"
          options={extensionOptions}
          selectedIndex={selectedIndex}
          allOptions={options}
          onSelect={onSelect}
          onEnableExtension={onEnableExtension}
        />
      ) : null}
      {fileOptions.length > 0 ? (
        <MentionMenuSection
          title="Files"
          options={fileOptions}
          selectedIndex={selectedIndex}
          allOptions={options}
          onSelect={onSelect}
          onEnableExtension={onEnableExtension}
        />
      ) : null}
    </>
  );
}

function MentionMenuSection({
  title,
  options,
  selectedIndex,
  allOptions,
  onSelect,
  onEnableExtension,
}: {
  readonly title: string;
  readonly options: readonly MentionOption[];
  readonly selectedIndex: number;
  readonly allOptions: readonly MentionOption[];
  readonly onSelect: (option: MentionOption) => void;
  readonly onEnableExtension: (option: ExtensionMentionOption) => void;
}) {
  return (
    <div className="mention-menu__section">
      <div className="mention-menu__section-title">{title}</div>
      {options.map((option) => (
        <MentionMenuItem
          key={option.id}
          option={option}
          active={allOptions[selectedIndex]?.id === option.id}
          onSelect={onSelect}
          onEnableExtension={onEnableExtension}
        />
      ))}
    </div>
  );
}

function MentionMenuItem({
  option,
  active,
  onSelect,
  onEnableExtension,
}: {
  readonly option: MentionOption;
  readonly active: boolean;
  readonly onSelect: (option: MentionOption) => void;
  readonly onEnableExtension: (option: ExtensionMentionOption) => void;
}) {
  if (option.kind === "extension") {
    return (
      <div
        className={`mention-menu__item mention-menu__item--extension ${active ? "mention-menu__item--active" : ""} ${option.enabled ? "" : "mention-menu__item--disabled"}`}
      >
        <button
          className="mention-menu__item-main"
          disabled={option.enabling}
          type="button"
          onClick={() => {
            if (option.enabled) {
              onSelect(option);
              return;
            }
            onEnableExtension(option);
          }}
        >
          <span className="mention-menu__icon" aria-hidden="true">
            <ExtensionIcon />
          </span>
          <span className="mention-menu__content">
            <span className="mention-menu__line">
              <span className="mention-menu__filename">{option.displayName}</span>
              {option.enabled ? null : (
                <span className="mention-menu__badge">{option.enabling ? "Enabling" : "Disabled"}</span>
              )}
            </span>
            <span className="mention-menu__description">{option.description}</span>
          </span>
        </button>
        {option.enabled ? null : (
          <button
            aria-label={`Enable ${option.displayName}`}
            className="mention-menu__enable"
            disabled={option.enabling}
            type="button"
            onClick={() => onEnableExtension(option)}
          >
            {option.enabling ? "Enabling" : "Enable"}
          </button>
        )}
      </div>
    );
  }

  const lastSlash = option.filePath.lastIndexOf("/");
  const dirPart = lastSlash >= 0 ? option.filePath.slice(0, lastSlash + 1) : "";
  const namePart = lastSlash >= 0 ? option.filePath.slice(lastSlash + 1) : option.filePath;
  return (
    <button
      className={`mention-menu__item ${active ? "mention-menu__item--active" : ""}`}
      type="button"
      onClick={() => onSelect(option)}
    >
      <span className="mention-menu__icon" aria-hidden="true">
        <FileIcon />
      </span>
      <span className="mention-menu__file">
        {dirPart ? <span className="mention-menu__dirname">{dirPart}</span> : null}
        <span className="mention-menu__filename">{namePart}</span>
      </span>
    </button>
  );
}

function SlashCommandIcon({ command }: { readonly command: ComposerSlashCommand }) {
  switch (command.kind) {
    case "runtime":
      return command.runtimeCommand?.source === "skill" ? <SkillIcon /> : <SparkIcon />;
    case "model":
      return <ModelIcon />;
    case "thinking":
      return <ReasoningIcon />;
    case "status":
      return <StatusIcon />;
    default:
      return <SparkIcon />;
  }
}
