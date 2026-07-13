import type { SessionTranscriptAttachment } from "@pi-gui/pi-sdk-driver";
import type { ComposerAttachment } from "./desktop-state";
import type { TranscriptMessage } from "./timeline-types";

type OptimisticUserMessage = Extract<TranscriptMessage, { kind: "message" }>;

function toOptimisticAttachments(
  attachments: readonly ComposerAttachment[],
): SessionTranscriptAttachment[] {
  return attachments.map((attachment) => {
    if (attachment.kind === "image") {
      return {
        kind: "image",
        mimeType: attachment.mimeType,
        data: attachment.data,
        name: attachment.name,
      };
    }
    return {
      kind: "file",
      name: attachment.name,
      mimeType: attachment.mimeType,
      fsPath: attachment.fsPath,
      ...(attachment.sizeBytes !== undefined ? { sizeBytes: attachment.sizeBytes } : {}),
    };
  });
}

export function createOptimisticUserMessage(options: {
  readonly id: string;
  readonly text: string;
  readonly attachments?: readonly ComposerAttachment[];
}): OptimisticUserMessage {
  const attachments = options.attachments?.length ? toOptimisticAttachments(options.attachments) : undefined;
  return {
    kind: "message",
    id: options.id,
    role: "user",
    text: options.text,
    createdAt: new Date().toISOString(),
    ...(attachments ? { attachments } : {}),
  };
}

export function mergeOptimisticTranscript(
  transcript: readonly TranscriptMessage[],
  pending: readonly OptimisticUserMessage[],
): TranscriptMessage[] {
  if (pending.length === 0) {
    return [...transcript];
  }
  const existingIds = new Set(transcript.map((message) => message.id));
  const extras = pending.filter((message) => !existingIds.has(message.id));
  return extras.length === 0 ? [...transcript] : [...transcript, ...extras];
}

export function reconcileOptimisticUserMessages(
  pending: readonly OptimisticUserMessage[],
  transcript: readonly TranscriptMessage[],
): OptimisticUserMessage[] {
  if (pending.length === 0) {
    return [];
  }
  const existingIds = new Set(transcript.map((message) => message.id));
  return pending.filter((message) => !existingIds.has(message.id));
}

export type { OptimisticUserMessage };
