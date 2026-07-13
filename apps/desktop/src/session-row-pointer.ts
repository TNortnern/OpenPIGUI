/** Movement below this (px) counts as a click, not a drag-to-composer gesture. */
export const SESSION_ROW_CLICK_MOVE_THRESHOLD_PX = 6;

export function isSessionRowClick(
  start: { readonly x: number; readonly y: number } | null | undefined,
  end: { readonly x: number; readonly y: number },
  thresholdPx: number = SESSION_ROW_CLICK_MOVE_THRESHOLD_PX,
): boolean {
  if (!start) {
    return false;
  }
  return Math.hypot(end.x - start.x, end.y - start.y) < thresholdPx;
}
