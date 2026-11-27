import { isInstant, quotaScopeKey, type QuotaScope, type QuotaSnapshot } from "./model.ts";

type Entry = { snapshot?: QuotaSnapshot; pending?: Promise<QuotaSnapshot | null>; retryAt: number };

export class QuotaManager {
  private entries = new Map<string, Entry>();
  private now: () => number;

  constructor(now = Date.now) {
    this.now = now;
  }

  get(scope: QuotaScope): QuotaSnapshot | null {
    return this.entries.get(quotaScopeKey(scope))?.snapshot ?? null;
  }

  refreshIfDue(scope: QuotaScope, read: () => Promise<QuotaSnapshot>): Promise<QuotaSnapshot | null> {
    const current = this.get(scope);
    const now = this.now();
    if (current && now >= current.observedAtMs && now < current.validUntilMs
      && current.windows.every((window) => window.resetsAtMs === null || now < window.resetsAtMs)) {
      return Promise.resolve(current);
    }
    return this.refresh(scope, read);
  }

  refresh(scope: QuotaScope, read: () => Promise<QuotaSnapshot>): Promise<QuotaSnapshot | null> {
    const key = quotaScopeKey(scope);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { retryAt: 0 };
      this.entries.set(key, entry);
    }
    const current = entry;
    if (current.pending) return current.pending;
    if (this.now() < current.retryAt) return Promise.resolve(current.snapshot ?? null);
    current.pending = Promise.resolve().then(read).then((value) => {
      if (quotaScopeKey(value.scope) !== key || !isInstant(value.observedAtMs) || !isInstant(value.validUntilMs)
        || value.validUntilMs <= value.observedAtMs || value.observedAtMs > this.now()
        || value.observedAtMs <= (current.snapshot?.observedAtMs ?? -1)) {
        throw new Error("Invalid or out-of-order quota observation");
      }
      const seen = new Set<string>();
      const windows = [];
      for (const window of value.windows) {
        if (!window.id || seen.has(window.id)) continue;
        seen.add(window.id);
        windows.push({
          id: window.id,
          slot: window.slot,
          remainingPercent: typeof window.remainingPercent === "number" && Number.isFinite(window.remainingPercent)
            && window.remainingPercent >= 0 && window.remainingPercent <= 100 ? window.remainingPercent : null,
          resetsAtMs: isInstant(window.resetsAtMs) ? window.resetsAtMs : null,
          blocking: window.blocking === true,
        });
      }
      current.snapshot = {
        scope: { ...value.scope },
        observedAtMs: value.observedAtMs,
        validUntilMs: value.validUntilMs,
        providerObservedAtMs: isInstant(value.providerObservedAtMs) && value.providerObservedAtMs <= value.observedAtMs
          ? value.providerObservedAtMs : null,
        windows,
      };
      current.retryAt = windows.some((window) => window.resetsAtMs !== null && window.resetsAtMs <= this.now())
        ? this.now() + 5000 : 0;
      return current.snapshot;
    }).catch(() => {
      current.retryAt = this.now() + 5000;
      return current.snapshot ?? null;
    }).finally(() => { current.pending = undefined; });
    return current.pending;
  }
}
