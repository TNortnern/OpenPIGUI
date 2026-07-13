/** Multitask chrome visibility — keep this tiny and pure for discoverability regressions. */

export function shouldShowMultitask(isWorking: boolean): boolean {
  // Prior bug: gated on queuedCount > 0, so Multitask never appeared until after queueing.
  return isWorking;
}

export function multitaskPillLabel(queuedCount: number): string {
  return queuedCount > 0 ? `Multitask · ${queuedCount}` : "Multitask";
}
