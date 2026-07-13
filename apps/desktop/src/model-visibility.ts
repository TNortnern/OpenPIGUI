/** Pattern format matches Settings / runtime: `providerId/modelId`. */

export function modelPatternKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

export function isModelPatternEnabled(
  patterns: readonly string[],
  pattern: string,
): boolean {
  // Empty list means every available model is implicitly enabled.
  return patterns.length === 0 || patterns.includes(pattern);
}

export function providerVisibilityState(
  patterns: readonly string[],
  providerPatterns: readonly string[],
): "all" | "some" | "none" {
  if (providerPatterns.length === 0) return "none";
  let enabled = 0;
  for (const pattern of providerPatterns) {
    if (isModelPatternEnabled(patterns, pattern)) enabled += 1;
  }
  if (enabled === 0) return "none";
  if (enabled === providerPatterns.length) return "all";
  return "some";
}

function materializeActive(
  currentPatterns: readonly string[],
  availablePatterns: readonly string[],
): string[] {
  const available = uniquePreserveOrder(availablePatterns);
  if (currentPatterns.length === 0) return available;
  return uniquePreserveOrder(currentPatterns.filter((entry) => available.includes(entry)));
}

function collapseIfAll(next: readonly string[], available: readonly string[]): readonly string[] {
  if (next.length === available.length && available.every((entry) => next.includes(entry))) {
    return [];
  }
  return next;
}

/**
 * Toggle one model in the scoped-enabled list.
 * First disable while "all implicit" materializes the full available set, then removes the target.
 * Refuses to leave zero enabled models.
 */
export function nextScopedPatternsAfterToggle(input: {
  readonly currentPatterns: readonly string[];
  readonly availablePatterns: readonly string[];
  readonly pattern: string;
  readonly enable: boolean;
}): readonly string[] | undefined {
  const available = uniquePreserveOrder(input.availablePatterns);
  if (available.length === 0) {
    return undefined;
  }

  const active = materializeActive(input.currentPatterns, available);

  const next = input.enable
    ? active.includes(input.pattern)
      ? active
      : [...active, input.pattern]
    : active.filter((entry) => entry !== input.pattern);

  if (next.length === 0) {
    return undefined;
  }

  return collapseIfAll(next, available);
}

/**
 * Enable or disable every model under one provider.
 * Refuses to leave zero enabled models when disabling.
 */
export function nextScopedPatternsAfterProviderToggle(input: {
  readonly currentPatterns: readonly string[];
  readonly availablePatterns: readonly string[];
  readonly providerPatterns: readonly string[];
  readonly enable: boolean;
}): readonly string[] | undefined {
  const available = uniquePreserveOrder(input.availablePatterns);
  const provider = uniquePreserveOrder(
    input.providerPatterns.filter((entry) => available.includes(entry)),
  );
  if (available.length === 0 || provider.length === 0) {
    return undefined;
  }

  const active = materializeActive(input.currentPatterns, available);
  const providerSet = new Set(provider);

  const next = input.enable
    ? uniquePreserveOrder([...active, ...provider])
    : active.filter((entry) => !providerSet.has(entry));

  if (next.length === 0) {
    return undefined;
  }

  return collapseIfAll(next, available);
}

export function showAllScopedPatterns(): readonly string[] {
  return [];
}

function uniquePreserveOrder(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}
