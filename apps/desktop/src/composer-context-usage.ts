import type { SessionContextUsage } from "./desktop-state";

/** Compact token count: 495, 1.2K, 103K, 1.1M */
export function formatTokenCount(tokens: number): string {
  const value = Math.max(0, Math.round(tokens));
  if (value < 1_000) {
    return String(value);
  }
  if (value < 10_000) {
    const rounded = Math.round(value / 100) / 10;
    return `${trimTrailingZero(rounded)}K`;
  }
  if (value < 1_000_000) {
    return `${Math.round(value / 1_000)}K`;
  }
  const millions = Math.round(value / 100_000) / 10;
  return `${trimTrailingZero(millions)}M`;
}

function trimTrailingZero(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatContextPercent(percent: number | null | undefined): string | undefined {
  if (percent == null || !Number.isFinite(percent)) {
    return undefined;
  }
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

export function contextUsageSummary(usage: SessionContextUsage | undefined): {
  readonly percentLabel?: string;
  readonly tokensLabel?: string;
  readonly tokensPerSecondLabel?: string;
  readonly percent: number | null;
  readonly tokens: number | null;
  readonly contextWindow: number | null;
  readonly tokensPerSecond: number | null;
} {
  if (!usage || usage.contextWindow <= 0) {
    return { percent: null, tokens: null, contextWindow: null, tokensPerSecond: null };
  }
  const percentLabel = formatContextPercent(usage.percent);
  const tokensLabel =
    usage.tokens != null
      ? `${formatTokenCount(usage.tokens)} / ${formatTokenCount(usage.contextWindow)} tokens`
      : `— / ${formatTokenCount(usage.contextWindow)} tokens`;
  const tokensPerSecond =
    usage.tokensPerSecond != null && Number.isFinite(usage.tokensPerSecond) && usage.tokensPerSecond > 0
      ? usage.tokensPerSecond
      : null;
  const tokensPerSecondLabel =
    tokensPerSecond != null ? `${formatTokensPerSecond(tokensPerSecond)} tok/s` : undefined;
  return {
    percentLabel,
    tokensLabel,
    ...(tokensPerSecondLabel ? { tokensPerSecondLabel } : {}),
    percent: usage.percent,
    tokens: usage.tokens,
    contextWindow: usage.contextWindow,
    tokensPerSecond,
  };
}

export function formatTokensPerSecond(tokensPerSecond: number): string {
  if (tokensPerSecond >= 100) {
    return String(Math.round(tokensPerSecond));
  }
  const rounded = Math.round(tokensPerSecond * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatElapsedSince(startedAt: string, nowMs = Date.now()): string {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) {
    return "";
  }
  const seconds = Math.max(0, Math.floor((nowMs - started) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) {
    return remaining === 0 ? `${minutes}m` : `${minutes}m ${remaining}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
}
