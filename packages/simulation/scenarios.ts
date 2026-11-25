import { petState } from "../behavior/behavior.ts";
import type { ActivityState, QuotaScope, QuotaSnapshot } from "../telemetry/model.ts";

const scope: QuotaScope = { provider: "codex", sourceId: "demo", mode: "simulation",
  authMode: "simulated", accountKey: "demo-account", quotaScopeKey: "demo-scope" };

function reading(at: number, energy: number, stamina: number, resetsAt: number, blocking = false): QuotaSnapshot {
  return { scope, observedAtMs: at, validUntilMs: at + 60_000, providerObservedAtMs: null, windows: [
    { id: "demo-energy", slot: "energy", remainingPercent: energy, resetsAtMs: resetsAt, blocking },
    { id: "demo-stamina", slot: "stamina", remainingPercent: stamina, resetsAtMs: resetsAt + 86_400_000, blocking: false },
  ] };
}

export const scenarios = ["energetic", "normal", "tired", "exhausted", "sleeping", "working", "thinking", "waiting",
  "completed", "interrupted", "recharging", "expired", "unknown", "disconnected"] as const;
export type Scenario = typeof scenarios[number];

export function simulate(scenario: Scenario, now = Date.now()) {
  const reset = now + 3_600_000;
  const fills: Partial<Record<Scenario, number>> = { energetic: 92, tired: 28, exhausted: 8, sleeping: 0 };
  const events: Partial<Record<Scenario, ActivityState>> = {
    working: "tool-started", thinking: "thinking", waiting: "waiting", completed: "completed",
    interrupted: "interrupted", disconnected: "disconnected",
  };
  const quota = scenario === "unknown" || scenario === "disconnected" ? null
    : scenario === "expired" ? reading(now - 120_000, 40, 85, now - 1000)
    : reading(now, fills[scenario] ?? (scenario === "recharging" ? 100 : 65), 85, reset, scenario === "sleeping");
  const previous = scenario === "recharging" ? reading(now - 2000, 0, 85, now - 1000) : null;
  return { mode: "simulation" as const, scenario, quota,
    pet: petState(quota, events[scenario] ?? "unknown", now, previous) };
}
