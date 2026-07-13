import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";

export interface ThinkingOption {
  readonly value: string;
  readonly label: string;
  readonly description: string;
}

export const THINKING_OPTIONS: readonly ThinkingOption[] = [
  {
    value: "off",
    label: "Off",
    description: "Disable reasoning for this model",
  },
  {
    value: "minimal",
    label: "Minimal",
    description: "Lightest reasoning for quick replies",
  },
  {
    value: "low",
    label: "Low",
    description: "Fast responses with lighter reasoning",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balances speed and reasoning depth for everyday tasks",
  },
  {
    value: "high",
    label: "High",
    description: "Greater reasoning depth for complex problems",
  },
  {
    value: "xhigh",
    label: "Extra High",
    description: "Extra high reasoning depth for complex problems",
  },
  {
    value: "max",
    label: "Max",
    description: "Maximum reasoning depth for supported models",
  },
] as const;

/** Mirror pi-ai getSupportedThinkingLevels: hide selector when only `off` remains. */
export function modelSupportsThinkingSelector(
  runtime: RuntimeSnapshot | undefined,
  provider: string | undefined,
  modelId: string | undefined,
): boolean {
  const levels = thinkingLevelsForModel(runtime, provider, modelId);
  return levels.some((level) => level !== "off");
}

export function thinkingLevelsForModel(
  runtime: RuntimeSnapshot | undefined,
  provider: string | undefined,
  modelId: string | undefined,
): readonly string[] {
  if (!runtime || !provider || !modelId) {
    return THINKING_OPTIONS.map((option) => option.value);
  }
  const model = runtime.models.find(
    (entry) => entry.providerId === provider && entry.modelId === modelId,
  );
  if (!model) {
    return THINKING_OPTIONS.map((option) => option.value);
  }
  if (!model.reasoning) {
    return ["off"];
  }
  return model.thinkingLevels.length > 0
    ? model.thinkingLevels
    : THINKING_OPTIONS.map((option) => option.value);
}

export function thinkingOptionsForModel(
  runtime: RuntimeSnapshot | undefined,
  provider: string | undefined,
  modelId: string | undefined,
): readonly ThinkingOption[] {
  const allowed = new Set(thinkingLevelsForModel(runtime, provider, modelId));
  return THINKING_OPTIONS.filter((option) => allowed.has(option.value));
}
