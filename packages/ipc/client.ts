import { windowsEndpoint } from "./discovery.ts";
import type { Endpoint, Operation } from "./protocol.ts";
import { askStatus } from "./transport.ts";

export function desktopClient(read = () => windowsEndpoint("read"), now = () => performance.now()) {
  let endpoint: Endpoint | null = null;
  let retryAt = 0;
  let discoveryDelay = 5000;
  let manualAt = 0;
  let discovery: Promise<Endpoint | null> | undefined;
  return async (op: Operation) => {
    const at = now();
    const retry = at >= retryAt || (op === "refresh" && at >= manualAt);
    if (!endpoint && (discovery || retry)) {
      if (!discovery) manualAt = at + 5000;
      discovery ??= read().catch(() => null).finally(() => { discovery = undefined; });
      endpoint = await discovery;
      if (!endpoint) {
        if (retryAt <= at) {
          retryAt = now() + discoveryDelay;
          discoveryDelay = Math.min(30_000, discoveryDelay * 2);
        }
      } else {
        discoveryDelay = 5000;
      }
    }
    const selected = endpoint;
    if (!selected) return null;
    try { return await askStatus(selected, op); }
    catch {
      if (endpoint === selected) {
        endpoint = null;
        retryAt = now() + 1000;
      }
      return null;
    }
  };
}
