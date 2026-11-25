export type Provider = "codex" | "claude-code" | "github-copilot" | (string & {});
export type Source = { provider: Provider; sourceId: string; mode: "live" | "simulation" };
export type QuotaScope = Source & {
  authMode: string;
  accountKey: string | null;
  quotaScopeKey: string | null;
};

export type QuotaWindow = {
  id: string;
  slot: "energy" | "stamina" | "other";
  remainingPercent: number | null;
  resetsAtMs: number | null;
  blocking: boolean;
};

export type QuotaSnapshot = {
  scope: QuotaScope;
  observedAtMs: number;
  validUntilMs: number;
  providerObservedAtMs: number | null;
  windows: readonly QuotaWindow[];
};

export type Activity = "working" | "tool-started" | "thinking" | "waiting" | "completed" | "interrupted";
export type ActivityObservation = {
  source: Source;
  generation: number;
  session: string;
  observedAtMs: number;
  sequence?: number;
  activity: Activity;
};

export type ActivityState = Activity | "unknown" | "disconnected";

export function isInstant(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

export function quotaScopeKey(scope: QuotaScope): string {
  const key = [scope.mode, scope.provider, scope.authMode];
  return JSON.stringify(scope.accountKey && scope.quotaScopeKey
    ? [...key, "account", scope.accountKey, scope.quotaScopeKey]
    : [...key, "source", scope.sourceId]);
}

export function sourceKey(source: Source): string {
  return JSON.stringify([source.mode, source.provider, source.sourceId]);
}

export function windowAvailable(snapshot: QuotaSnapshot, window: QuotaWindow, now: number): boolean {
  return now >= snapshot.observedAtMs && now < snapshot.validUntilMs
    && (window.resetsAtMs === null || now < window.resetsAtMs);
}
