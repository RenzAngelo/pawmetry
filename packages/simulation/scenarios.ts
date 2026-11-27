import { petState } from "../behavior/behavior.ts";
import type { QuotaScope, QuotaSnapshot } from "../telemetry/model.ts";

const scope: QuotaScope = { provider: "codex", sourceId: "demo", mode: "simulation",
  authMode: "simulated", accountKey: "demo-account", quotaScopeKey: "demo-scope" };

function reading(at: number, energy: number, stamina: number, resetsAt: number, blocking = false): QuotaSnapshot {
  return { scope, observedAtMs: at, validUntilMs: at + 60_000, providerObservedAtMs: null, windows: [
    { id: "demo-energy", slot: "energy", remainingPercent: energy, resetsAtMs: resetsAt, blocking },
    { id: "demo-stamina", slot: "stamina", remainingPercent: stamina, resetsAtMs: resetsAt + 86_400_000, blocking: false },
  ] };
}

export const scenarios = ["energetic", "normal", "tired", "exhausted", "sleeping", "recharging", "expired", "unknown"] as const;
export type Scenario = typeof scenarios[number];

export function simulate(scenario: Scenario, now = Date.now()) {
  const reset = now + 3_600_000;
  const fills: Partial<Record<Scenario, number>> = { energetic: 92, tired: 28, exhausted: 8, sleeping: 0 };
  const quota = scenario === "unknown" ? null
    : scenario === "expired" ? reading(now - 120_000, 40, 85, now - 1000)
    : reading(now, fills[scenario] ?? (scenario === "recharging" ? 100 : 65), 85, reset, scenario === "sleeping");
  const previous = scenario === "recharging" ? reading(now - 2000, 0, 85, now - 1000) : null;
  return { mode: "simulation" as const, scenario, quota,
    pet: petState(quota, "unknown", now, previous) };
}
