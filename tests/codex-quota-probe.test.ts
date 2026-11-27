import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { appServerArgs, ProbeError, readQuotaFromChild } from "../tools/codex-quota-probe/app-server.ts";
import { freshnessLimitMs, normalizeQuota, quotaBucketKey, renderQuota, windowFreshness } from "../tools/codex-quota-probe/quota.ts";

const fixture = fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url));
const readAt = Date.UTC(2026, 10, 25, 12);
const resetAt = readAt + 3_600_000;
const scope = { accountId: "test-quota-scope" };
const account = { userId: "test-account", account: { type: "chatgpt", workspaceName: "Synthetic workspace" } };
const mainBucket = {
  limitId: "codex",
  primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: resetAt / 1000 },
  secondary: { usedPercent: 100, windowDurationMins: 10_080, resetsAt: null },
};

function childFor(scenario: string) {
  return spawn(process.execPath, [fixture, scenario], { stdio: ["pipe", "pipe", "ignore"] });
}

function sample(limits: Record<string, unknown> = { ...scope, rateLimits: mainBucket }) {
  return normalizeQuota(limits, account, readAt, false);
}

test("uses distinct window durations, explicit used and remaining, and UTC reset timestamps", () => {
  const snapshot = sample();
  assert.equal(snapshot.buckets[0].windows[0].resetsAtMs, resetAt);
  assert.match(renderQuota(snapshot, readAt), /Short-term \(300 min\) · used 25% · remaining 75% · reset 2026-11-25T13:00:00.000Z/u);
  assert.match(renderQuota(snapshot, readAt), /Long-term \(10080 min\) · used 100% · remaining 0% · reset unknown/u);
  assert.match(renderQuota(snapshot, readAt), /Retrieved \(UTC\): 2026-11-25T12:00:00.000Z/u);
  assert.match(renderQuota(snapshot, readAt), /provider age unknown/u);
});

test("determines short or long by duration even when provider slots are reversed", () => {
  const reversed = { ...mainBucket, primary: mainBucket.secondary, secondary: mainBucket.primary };
  const output = renderQuota(sample({ rateLimits: reversed }), readAt);
  assert.match(output, /Long-term \(10080 min\)[\s\S]*Short-term \(300 min\)/u);
});

test("keeps partial fields without inventing durations, resets or percentages", () => {
  const snapshot = sample({ rateLimits: {
    primary: { usedPercent: 101, windowDurationMins: 300, resetsAt: "1800000000" },
    secondary: { usedPercent: 0, windowDurationMins: -1, resetsAt: 8_640_000_000_001 },
  } });
  const output = renderQuota(snapshot, readAt);
  assert.match(output, /Primary \(300 min\) · used unknown · remaining unknown · reset unknown/u);
  assert.match(output, /Secondary \(unknown duration\) · used 0% · remaining 100% · reset unknown/u);
  assert.match(output, /Short\/long mapping: unknown/u);
});

test("deduplicates legacy and multi-bucket views and checks bucket consistency", () => {
  const snapshot = sample({
    rateLimits: { ...mainBucket, primary: { usedPercent: 99 } },
    rateLimitsByLimitId: {
      codex: mainBucket,
      extra: { primary: { usedPercent: 3 } },
      conflict: { limitId: "different", primary: { usedPercent: 4 } },
      "bad\u001b[1m": { primary: { usedPercent: 5 } },
    },
  });
  assert.deepEqual(snapshot.buckets.map((bucket) => bucket.id), ["codex", "extra"]);
  assert.equal(snapshot.buckets[0].windows[0].usedPercent, 25);
});

test("supports a legacy response and leaves unsupported or absent structures unknown", () => {
  assert.equal(sample({ rateLimits: mainBucket, rateLimitsByLimitId: {} }).buckets.length, 1);
  for (const limits of [{}, { rateLimits: null }, { rateLimits: { credits: 42 } }, { rateLimits: { primary: { usedPercent: 22.5 } } }]) {
    assert.match(renderQuota(sample(limits), readAt), /no supported quota windows/u);
  }
});

test("marks reset windows expired and rejects stale data or backwards clock changes", () => {
  const snapshot = sample({ rateLimits: {
    primary: { usedPercent: 10, resetsAt: (readAt + 1000) / 1000 },
    secondary: { usedPercent: 20 },
  } });
  const [primary, secondary] = snapshot.buckets[0].windows;
  assert.equal(windowFreshness(primary, readAt, readAt + 1000), "expired");
  assert.equal(windowFreshness(secondary, readAt, readAt + 1000), "fresh");
  assert.equal(windowFreshness(secondary, readAt, readAt + freshnessLimitMs), "stale");
  assert.equal(windowFreshness(secondary, readAt, readAt - 1), "stale");
  assert.match(renderQuota(snapshot, readAt + 1000), /used unknown · remaining unknown · reset .* · expired/u);
});

test("multiple windows, conversations and CLI sessions can reference one shared quota snapshot", () => {
  const snapshot = sample();
  const sameScope = sample().scope;
  const sessions = [
    { surface: "ide", project: "work-a", session: "one", scope: snapshot.scope },
    { surface: "ide", project: "work-a", session: "two", scope: sameScope },
    { surface: "ide", project: "work-b", session: "one", scope: sameScope },
    { surface: "cli", project: "work-b", session: "three", scope: sameScope },
  ];
  const keys = sessions.map((session) => quotaBucketKey(session.scope, "codex"));
  assert.ok(keys[0]);
  assert.equal(new Set(keys).size, 1);
  const snapshots = new Map([[keys[0], snapshot]]);
  assert.ok(sessions.every((_, index) => snapshots.get(keys[index]) === snapshot));
  assert.equal(snapshot.buckets[0].windows[0].usedPercent, 25);
});

test("isolates quota by provider, auth, account, quota scope and bucket", () => {
  const original = sample().scope;
  const alternatives = [
    quotaBucketKey(original, "extra"),
    quotaBucketKey({ ...original, provider: "other" }, "codex"),
    quotaBucketKey({ ...original, authMode: "other" }, "codex"),
    quotaBucketKey(normalizeQuota(scope, { ...account, userId: "other" }, readAt, false).scope, "codex"),
    quotaBucketKey(sample({ accountId: "different-scope" }).scope, "codex"),
  ];
  assert.equal(new Set([quotaBucketKey(original, "codex"), ...alternatives]).size, 6);
  assert.equal(quotaBucketKey({ ...original, accountKey: null }, "codex"), null);
  assert.equal(quotaBucketKey({ ...original, quotaScopeKey: null }, "codex"), null);
  assert.equal(quotaBucketKey(original, null), null);
});

test("only shows a sanitized workspace label when requested and discards raw identity fields", () => {
  const snapshot = normalizeQuota(scope, {
    ...account,
    account: { ...account.account, workspaceName: "Synthetic\u001b\nworkspace", email: "pii-canary" },
  }, readAt, true);
  assert.equal(snapshot.workspaceLabel, "Syntheticworkspace");
  assert.doesNotMatch(JSON.stringify(snapshot), /test-account|test-quota-scope|pii-canary/u);
  assert.match(renderQuota(sample(), readAt), /label available \(hidden\)/u);
});

test("starts only an isolated stdio App Server with process-local controls", () => {
  assert.deepEqual(appServerArgs.slice(0, 3), ["app-server", "--listen", "stdio://"]);
  assert.ok(appServerArgs.includes("analytics.enabled=false"));
  assert.ok(appServerArgs.includes("features.hooks=false"));
  assert.ok(!appServerArgs.some((arg) => /daemon|proxy|sign-out|remote/u.test(arg)));
});

test("exchanges the fixed handshake and quota methods, ignores notices and closes its child", async () => {
  const child = childFor("success");
  const snapshot = await readQuotaFromChild(child);
  assert.equal(child.exitCode, 0);
  assert.equal(snapshot.buckets[0].windows[0].usedPercent, 31);
  assert.doesNotMatch(renderQuota(snapshot, Date.now()), /canary/u);
});

const failures = {
  disconnect: "disconnected",
  oversized: "malformed",
  "bad-json": "malformed",
  "wrong-id": "malformed",
  "signed-out": "signedOut",
  "api-key": "authMode",
  "expired-login": "authRejected",
  "rpc-rejected": "rejected",
  unsupported: "unsupported",
  "server-request": "authMode",
  "scope-changed": "scopeChanged",
} as const;

for (const [scenario, code] of Object.entries(failures)) {
  test(`reports ${scenario} without forwarding provider data`, async () => {
    const child = childFor(scenario);
    await assert.rejects(readQuotaFromChild(child), (error) =>
      error instanceof ProbeError && error.code === code && !error.message.includes("canary"),
    );
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  });
}

test("times out and terminates only the child that ignores input closure", async () => {
  const child = childFor("stuck");
  const neighbor = childFor("stuck");
  const neighborClosed = new Promise<void>((resolve) => neighbor.once("close", () => resolve()));
  try {
    await assert.rejects(readQuotaFromChild(child, { timeoutMs: 750 }), { code: "timeout" });
    assert.ok(child.exitCode !== null || child.signalCode !== null);
    assert.equal(neighbor.exitCode, null);
    assert.equal(neighbor.signalCode, null);
  } finally {
    neighbor.kill("SIGKILL");
    await neighborClosed;
  }
});

test("cancels an in-flight read and closes its child", async () => {
  const controller = new AbortController();
  const child = childFor("timeout");
  const read = readQuotaFromChild(child, { signal: controller.signal });
  controller.abort();
  await assert.rejects(read, { code: "cancelled" });
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});
