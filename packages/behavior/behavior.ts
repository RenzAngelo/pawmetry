import { quotaScopeKey, windowAvailable, type ActivityState, type QuotaSnapshot } from "../telemetry/model.ts";

export type Pose = "energetic" | "normal" | "tired" | "exhausted" | "sleeping" | "recharging"
  | "thinking" | "working" | "waiting" | "completed" | "interrupted" | "unknown" | "disconnected";

export type PetState = {
  pose: Pose;
  energy: number | null;
  stamina: number | null;
  speed: number;
};

function confirmedReset(previous: QuotaSnapshot | null, current: QuotaSnapshot, now: number): boolean {
  if (!previous || quotaScopeKey(previous.scope) !== quotaScopeKey(current.scope)
    || current.observedAtMs <= previous.observedAtMs || now - current.observedAtMs >= 8000) return false;
  return previous.windows.some((old) => {
    if (old.slot === "other" || old.resetsAtMs === null || old.remainingPercent === null
      || old.resetsAtMs > current.observedAtMs) return false;
    const fresh = current.windows.find((window) => window.id === old.id && window.slot === old.slot);
    return fresh !== undefined && windowAvailable(current, fresh, now) && fresh.resetsAtMs !== null
      && fresh.resetsAtMs > old.resetsAtMs && fresh.remainingPercent !== null
      && fresh.remainingPercent > old.remainingPercent;
  });
}

export function petState(current: QuotaSnapshot | null, activity: ActivityState, now: number,
  previous: QuotaSnapshot | null = null): PetState {
  const available = current?.windows.filter((window) => windowAvailable(current, window, now)) ?? [];
  const energyWindow = available.filter((window) => window.slot === "energy");
  const staminaWindow = available.filter((window) => window.slot === "stamina");
  const energy = energyWindow.length === 1 ? energyWindow[0].remainingPercent : null;
  const stamina = staminaWindow.length === 1 ? staminaWindow[0].remainingPercent : null;
  const known = [energy, stamina].filter((value) => value !== null);
  const lowest = known.length ? Math.min(...known) : null;
  const result = (pose: Pose, speed: number): PetState => ({ pose, energy, stamina, speed });

  if (available.some((window) => window.blocking && window.remainingPercent === 0)) return result("sleeping", 0);
  if (activity === "tool-started") return result("working", lowest === null ? 0.65 : Math.max(0.2, lowest / 100));
  if (activity === "thinking" || activity === "waiting" || activity === "completed" || activity === "interrupted") {
    return result(activity, 0);
  }
  if (current && confirmedReset(previous, current, now)) return result("recharging", 0.35);
  if (lowest === null) return result(activity === "disconnected" ? "disconnected" : "unknown", 0);
  if (lowest <= 10) return result("exhausted", 0.2);
  if (lowest <= 35) return result("tired", 0.4);
  if (lowest >= 75) return result("energetic", 1);
  return result("normal", 0.65);
}
