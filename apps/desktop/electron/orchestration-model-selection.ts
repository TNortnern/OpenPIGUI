import type { RuntimeModelRecord } from "@pi-gui/session-driver";
import type { SessionModelSelection } from "@pi-gui/session-driver";

export interface ChildModelRequest {
  readonly provider?: string;
  readonly modelId?: string;
}

export interface ResolvedChildModel {
  readonly provider: string;
  readonly modelId: string;
  readonly source: "explicit" | "discovered" | "inherited" | "default";
}

export class ChildModelResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChildModelResolutionError";
  }
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function availableModels(models: readonly RuntimeModelRecord[]): readonly RuntimeModelRecord[] {
  return models.filter((model) => model.available);
}

function findExactPair(
  models: readonly RuntimeModelRecord[],
  provider: string,
  modelId: string,
): RuntimeModelRecord | undefined {
  const normalizedProvider = normalize(provider);
  const normalizedModelId = normalize(modelId);
  return models.find(
    (model) =>
      normalize(model.providerId) === normalizedProvider && normalize(model.modelId) === normalizedModelId,
  );
}

function findByModelId(models: readonly RuntimeModelRecord[], modelId: string): readonly RuntimeModelRecord[] {
  const normalizedModelId = normalize(modelId);
  return models.filter((model) => normalize(model.modelId) === normalizedModelId);
}

function findByProvider(models: readonly RuntimeModelRecord[], provider: string): readonly RuntimeModelRecord[] {
  const normalizedProvider = normalize(provider);
  return models.filter((model) => normalize(model.providerId) === normalizedProvider);
}

export function resolveChildModelSelection(input: {
  readonly request: ChildModelRequest;
  readonly parent?: SessionModelSelection;
  readonly models: readonly RuntimeModelRecord[];
  readonly defaultSelection?: SessionModelSelection;
}): ResolvedChildModel {
  const requestProvider = input.request.provider?.trim();
  const requestModelId = input.request.modelId?.trim();
  const eligible = availableModels(input.models);

  if (requestProvider && requestModelId) {
    const match = findExactPair(eligible, requestProvider, requestModelId);
    if (!match) {
      throw new ChildModelResolutionError(
        `Requested model ${requestProvider}:${requestModelId} is unavailable or not authenticated.`,
      );
    }
    return {
      provider: match.providerId,
      modelId: match.modelId,
      source: "explicit",
    };
  }

  if (requestModelId) {
    const matches = findByModelId(eligible, requestModelId);
    if (matches.length === 0) {
      throw new ChildModelResolutionError(`Requested model ${requestModelId} is unavailable or not authenticated.`);
    }
    if (matches.length > 1) {
      throw new ChildModelResolutionError(
        `Requested model ${requestModelId} is ambiguous across providers: ${matches.map((model) => model.providerId).join(", ")}.`,
      );
    }
    return {
      provider: matches[0]!.providerId,
      modelId: matches[0]!.modelId,
      source: "discovered",
    };
  }

  if (requestProvider) {
    const matches = findByProvider(eligible, requestProvider);
    if (matches.length === 0) {
      throw new ChildModelResolutionError(`Provider ${requestProvider} has no available authenticated models.`);
    }
    if (matches.length > 1) {
      throw new ChildModelResolutionError(
        `Provider ${requestProvider} is ambiguous; specify a model id among: ${matches.map((model) => model.modelId).join(", ")}.`,
      );
    }
    return {
      provider: matches[0]!.providerId,
      modelId: matches[0]!.modelId,
      source: "discovered",
    };
  }

  if (input.parent?.provider && input.parent.modelId) {
    const inherited = findExactPair(eligible, input.parent.provider, input.parent.modelId);
    if (inherited) {
      return {
        provider: inherited.providerId,
        modelId: inherited.modelId,
        source: "inherited",
      };
    }
  }

  if (input.defaultSelection?.provider && input.defaultSelection.modelId) {
    const fallback = findExactPair(
      eligible,
      input.defaultSelection.provider,
      input.defaultSelection.modelId,
    );
    if (fallback) {
      return {
        provider: fallback.providerId,
        modelId: fallback.modelId,
        source: "default",
      };
    }
  }

  if (eligible.length === 1) {
    return {
      provider: eligible[0]!.providerId,
      modelId: eligible[0]!.modelId,
      source: "default",
    };
  }

  throw new ChildModelResolutionError("No available model could be resolved for the child thread.");
}
