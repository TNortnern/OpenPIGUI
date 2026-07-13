import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly 0?: { readonly transcript?: string };
}

interface BrowserSpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionConstructor(): (new () => BrowserSpeechRecognition) | undefined {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

interface UseComposerDictationParams {
  readonly composerRef: RefObject<HTMLTextAreaElement | null>;
  readonly composerDraft: string;
  readonly setComposerDraft: (draft: string) => void;
}

export interface ComposerDictationState {
  readonly dictating: boolean;
  readonly dictationError: string;
  readonly toggleDictation: () => void;
  readonly speechAvailable: boolean;
}

export function useComposerDictation({
  composerRef,
  composerDraft,
  setComposerDraft,
}: UseComposerDictationParams): ComposerDictationState {
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const draftRef = useRef(composerDraft);
  draftRef.current = composerDraft;

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const toggleDictation = useCallback(() => {
    if (dictating) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setDictationError("Voice transcription is unavailable in this Electron build");
      return;
    }

    setDictationError("");
    const textarea = composerRef.current;
    const cursor = textarea?.selectionStart ?? draftRef.current.length;
    const before = draftRef.current.slice(0, cursor);
    const after = draftRef.current.slice(textarea?.selectionEnd ?? cursor);
    let committed = "";

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) {
          continue;
        }
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) {
          continue;
        }
        if (result.isFinal) {
          committed = `${committed}${committed && !committed.endsWith(" ") ? " " : ""}${transcript}`;
        } else {
          interim += `${interim ? " " : ""}${transcript}`;
        }
      }
      const spoken = `${committed}${interim ? `${committed ? " " : ""}${interim}` : ""}`;
      const prefix = before && spoken && !before.endsWith(" ") ? `${before} ` : before;
      const suffix = after && spoken && !after.startsWith(" ") ? ` ${after}` : after;
      const next = `${prefix}${spoken}${suffix}`;
      setComposerDraft(next);
      requestAnimationFrame(() => {
        const pos = prefix.length + spoken.length;
        composerRef.current?.setSelectionRange(pos, pos);
      });
    };
    recognition.onerror = (event) => {
      setDictationError(
        event.error === "not-allowed" ? "Microphone access was denied" : `Voice transcription failed: ${event.error}`,
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setDictating(false);
    };
    recognitionRef.current = recognition;
    setDictating(true);
    recognition.start();
  }, [composerRef, dictating, setComposerDraft]);

  return {
    dictating,
    dictationError,
    toggleDictation,
    speechAvailable: Boolean(getSpeechRecognitionConstructor()),
  };
}
