import { createHmac, randomBytes } from "node:crypto";

export interface QuotaScope {
  provider: string;
  authMode: string;
  accountKey: string | null;
  quotaScopeKey: string | null;
}

export type QuotaWindow = {
  slot: "primary" | "secondary";
  usedPercent: number | null;
  remainingPercent: number | null;
  durationMinutes: number | null;
  resetsAtMs: number | null;
};

export interface QuotaBucket {
  id: string | null;
  windows: QuotaWindow[];
}

export interface QuotaSnapshot {
  scope: QuotaScope;
  workspaceLabel: string | null;
  workspaceLabelAvailable: boolean;
  retrievedAtMs: number;
  buckets: QuotaBucket[];
}

const scopeSecret = randomBytes(32);
export const freshnessLimitMs = 120_000;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scopeKey(kind: string, value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) return null;
  return createHmac("sha256", scopeSecret).update(kind).update("\0").update(value).digest("hex");
}

/** A shared cache key requires an established identity and provider quota scope. */
export function quotaBucketKey(scope: QuotaScope, bucketId: string | null): string | null {
  if (!scope.accountKey || !scope.quotaScopeKey || !bucketId) return null;
  return JSON.stringify([scope.provider, scope.authMode, scope.accountKey, scope.quotaScopeKey, bucketId]);
}

function safeBucketId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizeWindow(slot: QuotaWindow["slot"], value: unknown): QuotaWindow | null {
  const window = asRecord(value);
  if (!window) return null;
  const used = window.usedPercent;
  const usedPercent = typeof used === "number" && Number.isInteger(used) && used >= 0 && used <= 100
    ? used
    : null;
  const durationMinutes = positiveInteger(window.windowDurationMins);
  const resetSeconds = positiveInteger(window.resetsAt);
  const resetsAtMs = resetSeconds !== null && resetSeconds <= 8_640_000_000_000
    ? resetSeconds * 1000
    : null;
  if (usedPercent === null && durationMinutes === null && resetsAtMs === null) return null;
  return {
    slot,
    usedPercent,
    remainingPercent: usedPercent === null ? null : 100 - usedPercent,
    durationMinutes,
    resetsAtMs,
  };
}

function normalizeBucket(id: string | null, record: Record<string, unknown>): QuotaBucket | null {
  const windows = [
    normalizeWindow("primary", record.primary),
    normalizeWindow("secondary", record.secondary),
  ].filter((window) => window !== null);
  return windows.length ? { id, windows } : null;
}

export function normalizeQuota(
  limits: Record<string, unknown>,
  accountResult: Record<string, unknown>,
  retrievedAtMs: number,
  showWorkspace: boolean,
): QuotaSnapshot {
  const buckets: QuotaBucket[] = [];
  const byId = asRecord(limits.rateLimitsByLimitId);
  const legacy = asRecord(limits.rateLimits);

  if (byId && Object.keys(byId).length > 0) {
    for (const [key, value] of Object.entries(byId)) {
      const record = asRecord(value);
      const id = safeBucketId(key);
      if (!record || id === null || (record.limitId != null && record.limitId !== id)) continue;
      const bucket = normalizeBucket(id, record);
      if (bucket) buckets.push(bucket);
    }
  } else if (legacy) {
    const bucket = normalizeBucket(safeBucketId(legacy.limitId), legacy);
    if (bucket) buckets.push(bucket);
  }

  const label = asRecord(accountResult.account)?.workspaceName;
  const workspaceLabelAvailable = typeof label === "string" && label.trim().length > 0;
  const workspaceLabel = workspaceLabelAvailable && showWorkspace
    ? label.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 100) || null
    : null;
  return {
    scope: {
      provider: "codex",
      authMode: "chatgpt",
      accountKey: scopeKey("account", accountResult.userId),
      quotaScopeKey: scopeKey("quota-scope", limits.accountId),
    },
    workspaceLabel,
    workspaceLabelAvailable,
    retrievedAtMs,
    buckets,
  };
}

export function windowFreshness(window: QuotaWindow, retrievedAtMs: number, nowMs: number) {
  if (window.resetsAtMs !== null && nowMs >= window.resetsAtMs) return "expired";
  const age = nowMs - retrievedAtMs;
  return age < 0 || age >= freshnessLimitMs ? "stale" : "fresh";
}

export function renderQuota(snapshot: QuotaSnapshot, nowMs: number): string {
  const age = Math.max(0, Math.floor((nowMs - snapshot.retrievedAtMs) / 1000));
  const fresh = nowMs >= snapshot.retrievedAtMs && nowMs - snapshot.retrievedAtMs < freshnessLimitMs;
  const workspace = snapshot.workspaceLabel
    ?? (snapshot.workspaceLabelAvailable ? "label available (hidden)" : "unknown (no label supplied)");
  const lines = [
    "Pawmetry | Codex quota probe",
    "Source: Codex App Server · ChatGPT sign-in",
    `Retrieved (UTC): ${new Date(snapshot.retrievedAtMs).toISOString()}`,
    `Snapshot freshness: ${fresh ? "fresh" : "stale"} (local age ${age}s · max ${freshnessLimitMs / 1000}s · provider age unknown)`,
    `Account identifier: ${snapshot.scope.accountKey ? "available (hidden)" : "unknown"}`,
    `Provider quota scope identifier: ${snapshot.scope.quotaScopeKey ? "available (hidden)" : "unknown"}`,
    `ChatGPT workspace: ${workspace}`,
  ];
  for (const bucket of snapshot.buckets) {
    lines.push("", `Allowance bucket: ${bucket.id ?? "unknown (legacy view)"}`);
    const firstDuration = bucket.windows[0]?.durationMinutes;
    const secondDuration = bucket.windows[1]?.durationMinutes;
    const shortDuration = firstDuration != null && secondDuration != null && firstDuration !== secondDuration
      ? Math.min(firstDuration, secondDuration)
      : null;
    for (const window of bucket.windows) {
      const period = shortDuration !== null
        ? (window.durationMinutes === shortDuration ? "Short-term" : "Long-term")
        : (window.slot === "primary" ? "Primary" : "Secondary");
      const freshness = windowFreshness(window, snapshot.retrievedAtMs, nowMs);
      const used = freshness === "fresh" && window.usedPercent !== null ? `${window.usedPercent}%` : "unknown";
      const remaining = freshness === "fresh" && window.remainingPercent !== null
        ? `${window.remainingPercent}%` : "unknown";
      const reset = window.resetsAtMs === null ? "unknown" : new Date(window.resetsAtMs).toISOString();
      const duration = window.durationMinutes === null ? "unknown duration" : `${window.durationMinutes} min`;
      lines.push(`  ${period} (${duration}) · used ${used} · remaining ${remaining} · reset ${reset} · ${freshness}`);
    }
    if (shortDuration === null) lines.push("  Short/long mapping: unknown (two distinct durations required)");
  }
  if (!snapshot.buckets.length) lines.push("", "Allowance: unknown (no supported quota windows supplied)");
  return lines.join("\n");
}
