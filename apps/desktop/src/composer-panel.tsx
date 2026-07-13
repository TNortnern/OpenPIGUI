import { type ClipboardEvent, type Dispatch, type DragEvent, type KeyboardEvent, type RefObject, type SetStateAction } from "react";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type {
  ComposerAttachment,
  QueuedComposerMessage,
  SessionContextUsage,
  SessionRecord,
  WorkspaceRecord,
  WorktreeRecord,
} from "./desktop-state";
import type { MentionOption } from "./hooks/use-mention-menu";
import type { SkillMenuOption } from "./hooks/use-skill-menu";
import { ArrowUpIcon, MicrophoneIcon, PlusIcon, StopSquareIcon } from "./icons";
import type {
  ComposerSlashCommand,
  ComposerSlashCommandSection,
  ComposerSlashOption,
  ComposerSlashOptionEmptyState,
} from "./composer-commands";
import { ComposerStatusChrome, type WorkingAgentEntry } from "./composer-status-chrome";
import { ComposerSurface } from "./composer-surface";
import { ModelOnboardingNoticeBanner } from "./model-onboarding-notice";
import type { ModelOnboardingState, ModelOnboardingSettingsSection } from "./model-onboarding";
import { ModelSelector } from "./model-selector";
import type { ExtensionDockModel } from "./extension-session-ui";
import type { TranscriptMessage } from "./timeline-types";

interface ComposerPanelProps {
  readonly selectedSession: SessionRecord;
  readonly selectedWorkspace: WorkspaceRecord;
  readonly selectedWorktree?: WorktreeRecord;
  readonly lastError?: string;
  readonly runtime?: RuntimeSnapshot;
  readonly activeSlashCommand?: ComposerSlashCommand;
  readonly activeSlashCommandMeta?: string;
  readonly composerDraft: string;
  readonly setComposerDraft: Dispatch<SetStateAction<string>>;
  readonly composerRef: RefObject<HTMLTextAreaElement | null>;
  readonly runningLabel: string;
  readonly transcript: readonly TranscriptMessage[];
  readonly contextUsage?: SessionContextUsage;
  readonly terminalVisible: boolean;
  readonly peerWorkingAgents?: readonly WorkingAgentEntry[];
  readonly onStopRun: () => void;
  readonly onShowTerminal?: () => void;
  readonly onSelectWorkingAgent?: (agentId: string) => void;
  readonly onInspectWorkingAgent?: (agent: WorkingAgentEntry) => void;
  readonly attachments: readonly ComposerAttachment[];
  readonly queuedMessages: readonly QueuedComposerMessage[];
  readonly editingQueuedMessageId?: string;
  readonly provider: string | undefined;
  readonly modelId: string | undefined;
  readonly thinkingLevel: string | undefined;
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
  readonly onPickAttachments: () => void;
  readonly onRemoveAttachment: (attachmentId: string) => void;
  readonly onEditQueuedMessage: (messageId: string) => void;
  readonly onCancelQueuedEdit: () => void;
  readonly onRemoveQueuedMessage: (messageId: string) => void;
  readonly onSteerQueuedMessage: (messageId: string) => void;
  readonly onSelectSlashCommand: (command: ComposerSlashCommand) => void;
  readonly onSelectSlashOption: (option: ComposerSlashOption) => void;
  readonly onSetModel: (provider: string, modelId: string) => void;
  readonly onSetThinking: (level: string) => void;
  readonly onSetScopedModelPatterns?: (patterns: readonly string[]) => void;
  readonly modelOnboarding: ModelOnboardingState;
  readonly onOpenModelSettings: (section: ModelOnboardingSettingsSection) => void;
  readonly onSubmit: () => void;
  readonly showMentionMenu: boolean;
  readonly mentionOptions: readonly MentionOption[];
  readonly selectedMentionIndex: number;
  readonly onSelectMention: (option: MentionOption) => void;
  readonly onEnableMentionExtension: (option: Extract<MentionOption, { kind: "extension" }>) => void;
  readonly showSkillMenu?: boolean;
  readonly skillOptions?: readonly SkillMenuOption[];
  readonly selectedSkillIndex?: number;
  readonly onSelectSkill?: (option: SkillMenuOption) => void;
  readonly dictating?: boolean;
  readonly dictationError?: string;
  readonly onToggleDictation?: () => void;
  readonly extensionDock?: ExtensionDockModel;
  readonly extensionDockExpanded: boolean;
  readonly onToggleExtensionDock: () => void;
}

export function ComposerPanel({
  selectedSession,
  selectedWorkspace,
  selectedWorktree,
  lastError,
  runtime,
  activeSlashCommand,
  activeSlashCommandMeta,
  composerDraft,
  setComposerDraft,
  composerRef,
  runningLabel,
  transcript,
  contextUsage,
  terminalVisible,
  peerWorkingAgents,
  onStopRun,
  onShowTerminal,
  onSelectWorkingAgent,
  onInspectWorkingAgent,
  attachments,
  queuedMessages,
  editingQueuedMessageId,
  provider,
  modelId,
  thinkingLevel,
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
  onPickAttachments,
  onRemoveAttachment,
  onEditQueuedMessage,
  onCancelQueuedEdit,
  onRemoveQueuedMessage,
  onSteerQueuedMessage,
  onSelectSlashCommand,
  onSelectSlashOption,
  onSetModel,
  onSetThinking,
  onSetScopedModelPatterns,
  modelOnboarding,
  onOpenModelSettings,
  onSubmit,
  showMentionMenu,
  mentionOptions,
  selectedMentionIndex,
  onSelectMention,
  onEnableMentionExtension,
  showSkillMenu = false,
  skillOptions = [],
  selectedSkillIndex = 0,
  onSelectSkill,
  dictating = false,
  dictationError,
  onToggleDictation,
  extensionDock,
  extensionDockExpanded,
  onToggleExtensionDock,
}: ComposerPanelProps) {
  const hasComposerInput = composerDraft.trim().length > 0 || attachments.length > 0;
  const primaryActionIsStop = selectedSession.status === "running" && !hasComposerInput;
  const skillChipSkills = (runtime?.skills ?? [])
    .filter((skill) => skill.enabled)
    .map((skill) => ({ name: skill.name, slashCommand: skill.slashCommand }));

  return (
    <footer className="composer">
      <ComposerStatusChrome
        selectedSession={selectedSession}
        selectedWorkspace={selectedWorkspace}
        selectedWorktree={selectedWorktree}
        runningLabel={runningLabel}
        transcript={transcript}
        contextUsage={contextUsage}
        terminalVisible={terminalVisible}
        queuedMessages={queuedMessages}
        peerWorkingAgents={peerWorkingAgents}
        hasComposerInput={hasComposerInput}
        onQueueDraft={onSubmit}
        onStopRun={onStopRun}
        onShowTerminal={onShowTerminal}
        onSelectWorkingAgent={onSelectWorkingAgent}
        onInspectWorkingAgent={onInspectWorkingAgent}
      >
        <div className="conversation conversation--composer">
          <ComposerSurface
            lastError={lastError}
            activeSlashCommand={activeSlashCommand}
            activeSlashCommandMeta={activeSlashCommandMeta}
            topNotice={(
              <ModelOnboardingNoticeBanner notice={modelOnboarding.notice} onOpenSettings={onOpenModelSettings} />
            )}
            composerDraft={composerDraft}
            setComposerDraft={setComposerDraft}
            composerRef={composerRef}
            attachments={attachments}
            queuedMessages={queuedMessages}
            editingQueuedMessageId={editingQueuedMessageId}
            slashSections={slashSections}
            slashOptions={slashOptions}
            selectedSlashCommand={selectedSlashCommand}
            selectedSlashOption={selectedSlashOption}
            showSlashMenu={showSlashMenu}
            showSlashOptionMenu={showSlashOptionMenu}
            slashOptionEmptyState={slashOptionEmptyState}
            onClearSlashCommand={onClearSlashCommand}
            onComposerKeyDown={onComposerKeyDown}
            onComposerPaste={onComposerPaste}
            onComposerDrop={onComposerDrop}
            onRemoveAttachment={onRemoveAttachment}
            onEditQueuedMessage={onEditQueuedMessage}
            onCancelQueuedEdit={onCancelQueuedEdit}
            onRemoveQueuedMessage={onRemoveQueuedMessage}
            onSteerQueuedMessage={onSteerQueuedMessage}
            onSelectSlashCommand={onSelectSlashCommand}
            onSelectSlashOption={onSelectSlashOption}
            showMentionMenu={showMentionMenu}
            mentionOptions={mentionOptions}
            selectedMentionIndex={selectedMentionIndex}
            onSelectMention={onSelectMention}
            onEnableMentionExtension={onEnableMentionExtension}
            showSkillMenu={showSkillMenu}
            skillOptions={skillOptions}
            selectedSkillIndex={selectedSkillIndex}
            onSelectSkill={onSelectSkill}
            skillChipSkills={skillChipSkills}
            textareaLabel="Composer"
            textareaTestId="composer"
            textareaPlaceholder="Ask pi… type $ for skills, / for commands"
            extensionDock={extensionDock}
            extensionDockExpanded={extensionDockExpanded}
            onToggleExtensionDock={onToggleExtensionDock}
            footer={(
              <div className="composer__footer">
                {dictationError ? (
                  <div className="composer__dictation-error" role="alert">
                    {dictationError}
                  </div>
                ) : null}
                <div className="composer__footer-row">
                  <div className="composer__hint">
                    {selectedSession.status === "running"
                      ? hasComposerInput
                        ? "Multitask · Enter to queue · Cmd+Enter to steer"
                        : `${runningLabel} · type to Multitask · Cmd+Enter to steer`
                      : "Enter to send · Shift+Enter for newline"}
                    {" · "}
                    <ModelSelector
                      runtime={runtime}
                      provider={provider}
                      modelId={modelId}
                      thinkingLevel={thinkingLevel}
                      unselectedModelLabel={modelOnboarding.unselectedModelLabel}
                      emptyModelTitle={modelOnboarding.emptyModelTitle}
                      onSetModel={onSetModel}
                      onSetThinking={onSetThinking}
                      onSetScopedModelPatterns={onSetScopedModelPatterns}
                      onOpenModelSettings={onOpenModelSettings}
                    />
                  </div>
                  <div className="composer__actions">
                    <button
                      aria-label="Attach files"
                      className="icon-button composer__attach"
                      type="button"
                      onClick={onPickAttachments}
                    >
                      <PlusIcon />
                    </button>
                    {onToggleDictation ? (
                      <button
                        aria-label={dictating ? "Stop dictation" : "Start dictation"}
                        className={`icon-button composer__mic${dictating ? " composer__mic--active" : ""}`}
                        data-testid="composer-mic"
                        type="button"
                        onClick={onToggleDictation}
                      >
                        <MicrophoneIcon />
                      </button>
                    ) : null}
                    <button
                      aria-label={primaryActionIsStop ? "Stop run" : "Send message"}
                      className="button button--primary button--cta-icon"
                      data-testid="send"
                      type="button"
                      disabled={
                        !primaryActionIsStop &&
                        ((!composerDraft.trim() && attachments.length === 0) || modelOnboarding.requiresModelSelection)
                      }
                      onClick={onSubmit}
                    >
                      {primaryActionIsStop ? <StopSquareIcon /> : <ArrowUpIcon />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          />
        </div>
      </ComposerStatusChrome>
    </footer>
  );
}
