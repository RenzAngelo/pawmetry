import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createLiveQuota } from "../apps/desktop/live-quota.ts";
import { askStatus, listenStatus } from "../packages/ipc/transport.ts";
import { resetText } from "../packages/telemetry/time-display.ts";
import type { QuotaSnapshot } from "../packages/telemetry/model.ts";

function sample(at: number, resetsAtMs: number, remaining = 52): QuotaSnapshot {
  return {
    scope: { provider: "codex", sourceId: "desktop", mode: "live", authMode: "chatgpt",
      accountKey: "a", quotaScopeKey: "b" },
    observedAtMs: at, validUntilMs: at + 120_000, providerObservedAtMs: null,
    windows: [{ id: "short", slot: "energy", remainingPercent: remaining, resetsAtMs, blocking: false }],
  };
}

test("simulation makes zero reads and multiple IPC clients share one throttled live poll", async (t) => {
  let at = 10_000;
  let reads = 0;
  const live = createLiveQuota(() => at, async () => { reads++; return sample(at, at + 70_000); });
  const server = await listenStatus((op) => {
    if (op === "refresh") live.refresh(true);
    return live.view().status;
  });
  t.after(server.close);
  assert.equal((await askStatus(server.endpoint, "refresh")).quota, "offline");
  assert.equal(reads, 0);
  live.enable();
  await setImmediate();
  const statuses = await Promise.all(Array.from({ length: 8 }, () => askStatus(server.endpoint, "refresh")));
  assert.equal(reads, 1);
  assert.ok(statuses.every((status) => status.energy.remaining === 52 && status.activity === "unknown"));
  at += 16_000;
  live.refresh();
  assert.equal(reads, 1);
  at += 55_000;
  live.refresh();
  await setImmediate();
  assert.equal(reads, 2);
});

test("failed reads expire cached values and back off, and opt-out drops results", async () => {
  let at = 10_000;
  let calls = 0;
  const live = createLiveQuota(() => at, async () => {
    if (++calls !== 1) throw new Error("synthetic outage");
    return sample(at, at + 15_000);
  });
  live.enable();
  await setImmediate();
  at += 16_000;
  live.refresh();
  await setImmediate();
  assert.equal(live.view().status.quota, "stale");
  assert.equal(live.view().status.energy.remaining, null);
  live.refresh(true);
  await setImmediate();
  assert.equal(calls, 2);
  live.disable();
  assert.equal(live.view().status.mode, "simulation");
});

test("a canceled live read cannot repopulate simulation and confirmed reset requires same scope", async () => {
  let at = 10_000;
  let resolve!: (value: QuotaSnapshot) => void;
  let signal!: AbortSignal;
  const live = createLiveQuota(() => at, (s) => {
    signal = s;
    return new Promise((done) => { resolve = done; });
  });
  live.enable();
  await setImmediate();
  live.disable();
  assert.equal(signal.aborted, true);
  resolve(sample(at, at + 5000));
  await setImmediate();
  assert.equal(live.view().status.energy.remaining, null);

  let first = true;
  const switched = createLiveQuota(() => at, async () => {
    if (first) { first = false; return sample(at, at + 20_000, 4); }
    const next = sample(at, at + 5000, 99);
    return { ...next, scope: { ...next.scope, quotaScopeKey: "different" } };
  });
  switched.enable();
  await setImmediate();
  at += 21_000;
  switched.refresh();
  await setImmediate();
  assert.equal(switched.view().pet.pose, "energetic");
});

test("reset display uses UTC elapsed time with timezone-aware wall time across daylight saving", () => {
  const before = Date.parse("2026-03-08T06:45:00Z");
  const reset = Date.parse("2026-03-08T07:15:00Z");
  assert.match(resetText(reset, before, "America/New_York")!, /^30m · .*3:15/u);
  assert.match(resetText(reset, before, "UTC")!, /^30m · .*7:15/u);
  assert.equal(resetText(reset, reset, "UTC"), null);
  assert.equal(resetText(Number.NaN, before), null);
});
