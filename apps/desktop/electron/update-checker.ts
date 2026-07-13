/**
 * Pure semver helpers retained for compatibility tests and channel policy.
 * Background update polling now lives in update-service.ts.
 */

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return 0;
  }
  if (pa.nums[0] !== pb.nums[0]) {
    return pa.nums[0] < pb.nums[0] ? -1 : 1;
  }
  if (pa.nums[1] !== pb.nums[1]) {
    return pa.nums[1] < pb.nums[1] ? -1 : 1;
  }
  if (pa.nums[2] !== pb.nums[2]) {
    return pa.nums[2] < pb.nums[2] ? -1 : 1;
  }
  return comparePrerelease(pa.pre, pb.pre);
}

function parseSemver(version: string): { nums: [number, number, number]; pre: string[] } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(version.trim());
  if (!match) {
    return undefined;
  }
  return {
    nums: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split(".") : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) {
    return 0;
  }
  if (a.length === 0) {
    return 1;
  }
  if (b.length === 0) {
    return -1;
  }
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? "";
    const right = b[index] ?? "";
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      const delta = Number(left) - Number(right);
      if (delta !== 0) {
        return delta < 0 ? -1 : 1;
      }
    } else if (leftNumeric) {
      return -1;
    } else if (rightNumeric) {
      return 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  if (a.length === b.length) {
    return 0;
  }
  return a.length < b.length ? -1 : 1;
}

export type UpdateCheckResult =
  | { status: "up-to-date"; currentVersion: string; latestVersion: string }
  | { status: "update-available"; currentVersion: string; latestVersion: string }
  | { status: "error"; message: string };

/** @deprecated Task 2 replaces this with UpdateService IPC wiring. */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return {
    status: "error",
    message: "Manual update checks are handled by the in-app updater.",
  };
}

/** @deprecated Task 2 replaces this with UpdateService lifecycle wiring. */
export function initUpdateChecker(): () => void {
  return () => {};
}

/** @deprecated Task 2 removes external release-page navigation from the active path. */
export async function openReleasesPage(): Promise<void> {
  return;
}

/** @deprecated Task 2 removes notification-based update surfacing. */
export function showUpdateNotification(_currentVersion: string, _latestVersion: string): void {
  return;
}
