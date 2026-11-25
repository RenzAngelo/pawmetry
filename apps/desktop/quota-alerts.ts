import type { Status } from "../../packages/ipc/protocol.ts";

export const alertKinds = ["lowEnergy", "lowStamina", "restoredEnergy", "restoredStamina", "exhaustion"] as const;
export type AlertKind = (typeof alertKinds)[number];
export type AlertMode = "off" | "silent" | "sound";
type Meter = "energy" | "stamina";
type Observation = { at: number; scope: string; restored: Meter[] };
export type AlertSettings = { alerts: Record<AlertKind, AlertMode>; lowThresholds: Record<Meter, number>; quietHours: boolean };

export function quietAt(now: number) {
  const hour = new Date(now).getHours();
  return hour >= 22 || hour < 7;
}

export function quotaAlerts() {
  let scope: string | undefined;
  const low = new Set<Meter>();
  const zero = new Set<Meter>();
  const restored = new Map<Meter, number>();
  return (status: Status, observation: Observation | null, settings: AlertSettings, now = Date.now()) => {
    if (!observation || status.mode !== "live" || status.quota !== "fresh" || status.validUntil === null
      || now >= status.validUntil || now < observation.at) return [];
    if (scope !== observation.scope) { scope = observation.scope; low.clear(); zero.clear(); restored.clear(); }
    const messages: { message: string; sound: boolean }[] = [];
    function emit(kind: AlertKind, message: string) {
      if (settings.alerts[kind] !== "off" && !(settings.quietHours && quietAt(now))) {
        messages.push({ message, sound: settings.alerts[kind] === "sound" });
      }
    }
    for (const meter of ["energy", "stamina"] as const) {
      const { remaining, resetAt } = status[meter];
      if (remaining === null || (resetAt !== null && resetAt <= now)) continue;
      const title = meter === "energy" ? "Energy" : "Stamina";
      const lowKind = meter === "energy" ? "lowEnergy" : "lowStamina";
      const restoreKind = meter === "energy" ? "restoredEnergy" : "restoredStamina";
      const threshold = settings.lowThresholds[meter];
      if (remaining > threshold + 5) low.delete(meter);
      if (remaining > 0) zero.delete(meter);
      if (observation.restored.includes(meter) && restored.get(meter) !== observation.at) {
        restored.set(meter, observation.at);
        emit(restoreKind, `${title} restored to ${remaining}%`);
      }
      if (remaining === 0 && settings.alerts.exhaustion !== "off" && !zero.has(meter)) {
        zero.add(meter);
        low.add(meter);
        emit("exhaustion", `${title} allowance at 0%`);
      } else if (remaining <= threshold && settings.alerts[lowKind] !== "off" && !low.has(meter)) {
        low.add(meter);
        emit(lowKind, `${title} at ${remaining}%`);
      }
    }
    return messages;
  };
}
