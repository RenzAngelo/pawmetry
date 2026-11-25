import type { QuotaSnapshot as NormalizedSnapshot, QuotaWindow } from "../../packages/telemetry/model.ts";
import { freshnessLimitMs, type QuotaSnapshot } from "./quota.ts";

export function normalizeCodexSnapshot(snapshot: QuotaSnapshot, sourceId: string): NormalizedSnapshot {
  const windows: QuotaWindow[] = [];
  for (const bucket of snapshot.buckets) {
    const [first, second] = bucket.windows;
    const a = first?.durationMinutes;
    const b = second?.durationMinutes;
    const short = a != null && b != null && a !== b ? Math.min(a, b) : null;
    for (const window of bucket.windows) {
      windows.push({
        id: JSON.stringify([bucket.id, window.slot]),
        slot: bucket.id !== "codex" || short === null ? "other" : window.durationMinutes === short ? "energy" : "stamina",
        remainingPercent: window.remainingPercent,
        resetsAtMs: window.resetsAtMs,
        blocking: false,
      });
    }
  }
  return {
    scope: { ...snapshot.scope, sourceId, mode: "live" },
    observedAtMs: snapshot.retrievedAtMs,
    validUntilMs: snapshot.retrievedAtMs + freshnessLimitMs,
    providerObservedAtMs: null,
    windows,
  };
}
