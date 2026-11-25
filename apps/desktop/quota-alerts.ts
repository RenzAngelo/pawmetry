import type { Status } from "../../packages/ipc/protocol.ts";

export function quotaAlerts() {
  const notified = new Set<"energy" | "stamina">();
  return (status: Status, enabled: boolean) => {
    if (!enabled || status.mode !== "live" || status.quota !== "fresh") return [];
    const alerts: Array<{ meter: "energy" | "stamina"; remaining: number }> = [];
    for (const meter of ["energy", "stamina"] as const) {
      const value = status[meter].remaining;
      if (value === null) continue;
      if (value > 25) notified.delete(meter);
      if (value <= 20 && !notified.has(meter)) {
        notified.add(meter);
        alerts.push({ meter, remaining: value });
      }
    }
    return alerts;
  };
}
