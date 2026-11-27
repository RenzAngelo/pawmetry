import assert from "node:assert/strict";
import { test } from "node:test";
import { petState } from "../packages/behavior/behavior.ts";
import { quotaScopeKey, type ActivityObservation, type QuotaScope, type QuotaSnapshot } from "../packages/telemetry/model.ts";
import { QuotaManager } from "../packages/telemetry/quota-manager.ts";
import { SessionRegistry } from "../packages/telemetry/session-registry.ts";
import { scenarios, simulate } from "../packages/simulation/scenarios.ts";
import { normalizeQuota } from "../tools/codex-quota-probe/quota.ts";
import { normalizeCodexSnapshot } from "../tools/codex-quota-probe/telemetry.ts";

const scope: QuotaScope = { provider: "codex", sourceId: "editor-a", mode: "live", authMode: "chatgpt",
  accountKey: "a", quotaScopeKey: "b" };

function sample(time: number, remaining = 50, reset = time + 15_000): QuotaSnapshot {
  return { scope, observedAtMs: time, validUntilMs: time + 20_000, providerObservedAtMs: null,
    windows: [{ id: "short", slot: "energy", remainingPercent: remaining, resetsAtMs: reset, blocking: false }] };
}

test("quota scope shares verified account reads only within a provider, auth mode and live/simulation namespace", () => {
  assert.equal(quotaScopeKey(scope), quotaScopeKey({ ...scope, sourceId: "different-editor" }));
  for (const alternate of [{ mode: "simulation" as const }, { provider: "claude-code" }, { provider: "github-copilot" },
    { authMode: "api" }, { accountKey: "different" }, { quotaScopeKey: "different" }]) {
    assert.notEqual(quotaScopeKey(scope), quotaScopeKey({ ...scope, ...alternate }));
  }
  const unknown = { ...scope, accountKey: null };
  assert.notEqual(quotaScopeKey(unknown), quotaScopeKey({ ...unknown, sourceId: "other" }));
});

test("quota manager coalesces simultaneous reads, reuses fresh results, and refreshes at reset", async () => {
  let now = 10_000;
  const manager = new QuotaManager(() => now);
  let calls = 0;
  const read = async () => { calls++; return sample(now); };
  const editorB = { ...scope, sourceId: "editor-b" };
  const a = manager.refreshIfDue(scope, read);
  const b = manager.refreshIfDue(editorB, read);
  assert.equal(a, b);
  await Promise.all([a, b]);
  await manager.refreshIfDue(scope, read);
  assert.equal(calls, 1);
  now += 15_000;
  await manager.refreshIfDue(scope, read);
  assert.equal(calls, 2);
});

test("quota manager rejects mismatched and out-of-order data, and normalizes missing values", async () => {
  let now = 10_000;
  const manager = new QuotaManager(() => now);
  const first = sample(now);
  first.windows[0].remainingPercent = Number.NaN;
  first.windows[0].resetsAtMs = -1;
  await manager.refresh(scope, async () => first);
  assert.equal(manager.get(scope)?.windows[0].remainingPercent, null);
  assert.equal(manager.get(scope)?.windows[0].resetsAtMs, null);
  now++;
  await manager.refresh(scope, async () => ({ ...sample(now), scope: { ...scope, accountKey: "other" } }));
  await manager.refresh(scope, async () => { assert.fail("read during backoff"); });
  now += 5000;
  await manager.refresh(scope, async () => sample(9000));
  assert.equal(manager.get(scope)?.observedAtMs, first.observedAtMs);
});

test("session registry isolates concurrent sources, disconnects, generations, and stale or out-of-order events", () => {
  const registry = new SessionRegistry();
  const other = { ...scope, sourceId: "editor-b" };
  registry.connect(scope, 1);
  registry.connect(other, 1);
  const event: ActivityObservation = { source: scope, generation: 1, session: "shared-name", activity: "tool-started",
    observedAtMs: 2000, sequence: 1 };
  assert.equal(registry.observe(event), true);
  assert.equal(registry.observe({ ...event, source: other, activity: "waiting" }), true);
  assert.equal(registry.observe({ ...event, activity: "completed" }), false);
  assert.equal(registry.observe({ ...event, sequence: 2, observedAtMs: 1000 }), false);
  registry.disconnect(scope, 1);
  assert.equal(registry.state(scope, event.session, 2001), "disconnected");
  assert.equal(registry.state(other, event.session, 2001), "waiting");
  registry.connect(scope, 2);
  assert.equal(registry.observe(event), false);
  assert.equal(registry.state(scope, event.session, 2001), "unknown");
  assert.equal(registry.state(other, event.session, 17_000), "unknown");
});

test("Codex adapter marks provider data age and unverified sleep behavior unknown", () => {
  const normalized = normalizeCodexSnapshot(normalizeQuota({
    rateLimits: { limitId: "codex", primary: { usedPercent: 100, windowDurationMins: 300 },
      secondary: { usedPercent: 15, windowDurationMins: 10080 } },
  }, {}, 10000, false), "child");
  assert.deepEqual(normalized.windows.map((w) => [w.slot, w.remainingPercent]), [["energy", 0], ["stamina", 85]]);
  assert.equal(normalized.providerObservedAtMs, null);
  assert.equal(petState(normalized, "unknown", 10_001).pose, "exhausted");
  const blocking = { ...normalized, windows: normalized.windows.map((window) => ({ ...window, blocking: true })) };
  assert.equal(petState(blocking, "unknown", 10_001).pose, "sleeping");
  const working = petState(blocking, "tool-started", 10_001);
  assert.equal(working.pose, "working");
  assert.equal(working.energy, 0);
});

test("recharge requires a newer matching observation with reset advancement and recovery", () => {
  const previous = sample(10_000, 5, 15_000);
  assert.equal(petState(previous, "unknown", 15_001).pose, "unknown");
  assert.equal(petState(sample(15_001, 100, 30_000), "unknown", 15_001, previous).pose, "recharging");
  assert.equal(petState(sample(15_001, 5, 30_000), "unknown", 15_001, previous).pose, "exhausted");
  assert.equal(petState(sample(14_999, 100, 30_000), "unknown", 15_001, previous).pose, "energetic");
  const unknown = sample(15_001, 100, 30_000);
  unknown.scope = { ...unknown.scope, accountKey: null };
  assert.equal(petState(unknown, "unknown", 15_001, previous).pose, "energetic");
});

test("offline simulation labels every scenario and exercises every pose", () => {
  for (const scenario of scenarios) {
    const result = simulate(scenario, 1_000_000);
    assert.equal(result.mode, "simulation");
    assert.equal(result.pet.pose, scenario === "expired" ? "unknown" : scenario);
  }
});
