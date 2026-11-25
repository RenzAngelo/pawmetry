import { windowsEndpoint } from "./discovery.ts";
import type { Endpoint, Operation } from "./protocol.ts";
import { askStatus } from "./transport.ts";

export function desktopClient(read = () => windowsEndpoint("read"), now = Date.now) {
  let endpoint: Endpoint | null = null;
  let retryAt = 0;
  let discovery: Promise<Endpoint | null> | undefined;
  return async (op: Operation) => {
    if (!endpoint && now() >= retryAt) {
      discovery ??= read().catch(() => null).finally(() => { discovery = undefined; });
      endpoint = await discovery;
      if (!endpoint) retryAt = now() + 5000;
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
