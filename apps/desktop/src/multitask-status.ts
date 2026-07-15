/** Multitask chrome + slash discoverability — keep this tiny and pure. */

export const MULTITASK_SLASH_COMMAND = "/multitask";

export function shouldShowMultitask(isWorking: boolean): boolean {
  // Prior bug: gated on queuedCount > 0, so Multitask never appeared until after queueing.
  return isWorking;
}

export function multitaskPillLabel(queuedCount: number): string {
  return queuedCount > 0 ? `Multitask · ${queuedCount}` : "Multitask";
}

/** Substring match used by the slash menu for `/multit` → `/multitask`. */
export function matchesMultitaskSlashQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized.startsWith("/")) {
    return false;
  }
  if (normalized === "/") {
    return true;
  }
  return (
    MULTITASK_SLASH_COMMAND.includes(normalized) ||
    MULTITASK_SLASH_COMMAND.slice(1).includes(normalized.replace(/^\/+/, ""))
  );
}

/** While a run is active, only host commands marked availableWhileRunning stay in the menu. */
export function filterSlashCommandsWhileRunning<T extends { readonly availableWhileRunning?: boolean }>(
  commands: readonly T[],
  isRunning: boolean,
): readonly T[] {
  if (!isRunning) {
    return commands;
  }
  return commands.filter((command) => command.availableWhileRunning === true);
}
