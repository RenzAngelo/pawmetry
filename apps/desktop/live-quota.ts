import { petState } from "../../packages/behavior/behavior.ts";
import type { Meter, Status } from "../../packages/ipc/protocol.ts";
import { quotaScopeKey, windowAvailable, type QuotaSnapshot } from "../../packages/telemetry/model.ts";
import { QuotaManager } from "../../packages/telemetry/quota-manager.ts";
import { probeQuota } from "../../tools/codex-quota-probe/app-server.ts";
import { discoverCodex } from "../../tools/codex-quota-probe/discovery.ts";
import { normalizeCodexSnapshot } from "../../tools/codex-quota-probe/telemetry.ts";

const minSpacing = 15_000;
const emptyMeter = (): Meter => ({ remaining: null, resetAt: null });

async function readCodex(signal: AbortSignal) {
  const found = await discoverCodex();
  if (found.status !== "found") throw new Error("Codex executable unavailable");
  return normalizeCodexSnapshot(await probeQuota(found.executable, { signal }), "desktop");
}

export function createLiveQuota(now = Date.now, read = readCodex, elapsed = now === Date.now ? () => performance.now() : now) {
  let manager = new QuotaManager(now);
  let control: AbortController | null = null;
  let current: QuotaSnapshot | null = null;
  let previous: QuotaSnapshot | null = null;
  let work: Promise<void> | null = null;
  let failures = 0;
  let minimumAt = 0;
  let backoffAt = 0;

  function refresh(force = false) {
    const active = control;
    const startedAt = now();
    const elapsedAtStart = elapsed();
    if (!active || work || elapsedAtStart < minimumAt || elapsedAtStart < backoffAt) return;
    if (!force && current && startedAt >= current.observedAtMs && startedAt < current.validUntilMs
      && current.windows.every((window) => window.resetsAtMs === null || window.resetsAtMs > startedAt)) return;
    minimumAt = elapsedAtStart + minSpacing;
    work = Promise.resolve().then(() => read(active.signal)).then(async (value) => {
      if (control !== active) return;
      if (current && (quotaScopeKey(current.scope) !== quotaScopeKey(value.scope)
        || value.observedAtMs < current.observedAtMs && now() < current.observedAtMs)) {
        current = null;
        previous = null;
        manager = new QuotaManager(now);
      }
      const stored = await manager.refresh(value.scope, async () => value);
      if (control !== active) return;
      if (!stored || stored.observedAtMs !== value.observedAtMs) throw new Error("Quota observation rejected");
      previous = current && current.scope.accountKey && current.scope.quotaScopeKey
        && quotaScopeKey(current.scope) === quotaScopeKey(stored.scope) ? current : null;
      current = stored;
      failures = 0;
      backoffAt = 0;
    }).catch(() => {
      if (control === active) {
        failures++;
        backoffAt = elapsed() + Math.min(120_000, minSpacing * 2 ** Math.min(failures - 1, 3));
      }
    }).finally(() => { work = null; });
  }

  function enable() {
    if (!control) control = new AbortController();
    refresh();
  }

  function disable() {
    control?.abort();
    control = null;
    current = null;
    previous = null;
    manager = new QuotaManager(now);
    failures = 0;
    backoffAt = 0;
    return work;
  }

  function view() {
    const at = now();
    const pet = petState(current, "unknown", at, previous);
    function meter(slot: "energy" | "stamina"): Meter {
      const windows = current?.windows.filter((window) => window.slot === slot) ?? [];
      if (!current || windows.length !== 1 || !windowAvailable(current, windows[0], at)) return emptyMeter();
      return { remaining: windows[0].remainingPercent, resetAt: windows[0].resetsAtMs };
    }
    const energy = meter("energy");
    const stamina = meter("stamina");
    const available = energy.remaining !== null || stamina.remaining !== null;
    const status: Status = {
      mode: control ? "live" : "simulation", activity: "unknown",
      quota: !control ? "offline" : available ? "fresh" : work ? "loading" : current ? "stale" : "unavailable",
      validUntil: available ? current?.validUntilMs ?? null : null,
      energy: available ? energy : emptyMeter(), stamina: available ? stamina : emptyMeter(),
    };
    return { status, pet };
  }

  return { enable, disable, refresh, view };
}
