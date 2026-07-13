/// <reference lib="dom" />

/** Custom MIME for dragging a sidebar thread onto the composer. */
export const COMPOSER_THREAD_MIME = "application/x-openpigui-thread";

export interface ComposerThreadDropPayload {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly preview?: string;
}

const PREVIEW_CHAR_LIMIT = 2_000;

/** Fence terminal selection so the model sees it as copied shell output. */
export function formatTerminalSelectionBlock(text: string): string {
  const body = text.replace(/\u0000/g, "").replace(/\s+$/u, "");
  if (!body.trim()) {
    return "";
  }
  return ["```text terminal", body, "```"].join("\n");
}

/**
 * Structured chat reference for drag-from-sidebar.
 * Injects session id + title + bounded preview only — not the full transcript.
 */
export function formatAttachedChatBlock(payload: ComposerThreadDropPayload): string {
  const title = payload.title.trim() || "Untitled chat";
  const lines = [
    "### Attached chat context",
    `- sessionId: \`${payload.sessionId}\``,
    `- workspaceId: \`${payload.workspaceId}\``,
    `- title: ${title}`,
  ];
  const preview = payload.preview?.trim();
  if (preview) {
    const clipped =
      preview.length > PREVIEW_CHAR_LIMIT
        ? `${preview.slice(0, PREVIEW_CHAR_LIMIT)}\n…(preview truncated)`
        : preview;
    lines.push("", "Recent preview:", "```text", clipped, "```");
  }
  lines.push(
    "",
    "Treat this as reference context from another conversation. The full transcript was not injected.",
  );
  return lines.join("\n");
}

export function appendComposerContextBlock(draft: string, block: string): string {
  const cleaned = block.trim();
  if (!cleaned) {
    return draft;
  }
  const base = draft.replace(/\s+$/u, "");
  return base ? `${base}\n\n${cleaned}\n` : `${cleaned}\n`;
}

export function serializeThreadDropPayload(payload: ComposerThreadDropPayload): string {
  return JSON.stringify({
    workspaceId: payload.workspaceId,
    sessionId: payload.sessionId,
    title: payload.title,
    ...(payload.preview ? { preview: payload.preview } : {}),
  });
}

export function parseThreadDropPayload(raw: string | null | undefined): ComposerThreadDropPayload | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ComposerThreadDropPayload>;
    if (
      typeof parsed.workspaceId !== "string" ||
      !parsed.workspaceId.trim() ||
      typeof parsed.sessionId !== "string" ||
      !parsed.sessionId.trim() ||
      typeof parsed.title !== "string"
    ) {
      return null;
    }
    return {
      workspaceId: parsed.workspaceId.trim(),
      sessionId: parsed.sessionId.trim(),
      title: parsed.title,
      ...(typeof parsed.preview === "string" && parsed.preview.trim()
        ? { preview: parsed.preview }
        : {}),
    };
  } catch {
    return null;
  }
}

export function hasThreadDropInDataTransfer(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) {
    return false;
  }
  return Array.from(dataTransfer.types ?? []).includes(COMPOSER_THREAD_MIME);
}

export function readThreadDropFromDataTransfer(
  dataTransfer: DataTransfer | null | undefined,
): ComposerThreadDropPayload | null {
  if (!hasThreadDropInDataTransfer(dataTransfer)) {
    return null;
  }
  return parseThreadDropPayload(dataTransfer!.getData(COMPOSER_THREAD_MIME));
}
