import assert from "node:assert/strict";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { connect } from "node:net";
import { test } from "node:test";
import { readDiagnostic, readObservation, hookEvents, type HookName, type HookWorkspace } from "../tools/codex-activity-probe/protocol.ts";
import { HookTimeline } from "../tools/codex-activity-probe/timeline.ts";
import { hookProof, listenForHooks } from "../tools/codex-activity-probe/transport.ts";
import { hookConfig } from "../tools/codex-activity-probe/receiver.ts";
import { reviewCommand } from "../apps/desktop/activity-client.ts";

const run = `C:\\Users\\Test User\\Pawmetry-activity-${"a".repeat(32)}`;
const helper = `${run}\\PawmetryActivity-${"a".repeat(64)}.exe`;
const root = `${run}\\workspace-a`;
const system = "C:\\Windows\\System32";
const convert = (value: string) => createHash("sha256").update(value).digest("hex");
const makeEvent = (name: HookName, at: number, tool = "fixture", workspace: HookWorkspace = "A",
  session = "session", turn = "turn") => ({
  workspace, event: hookEvents[name], sentAt: at, delivery: randomBytes(16).toString("hex"),
  session: convert(workspace + session),
  turn: name === "SessionStart" || name === "SessionEnd" ? null : convert(turn),
  tool: name === "PreToolUse" || name === "PostToolUse" ? convert(tool) : null,
});

test("generated hooks contain eight fixed invocations without an endpoint or capability", () => {
  const parsed = JSON.parse(hookConfig(helper, "A", root, system));
  assert.deepEqual(Object.keys(parsed.hooks), Object.keys(hookEvents));
  for (const event of Object.keys(hookEvents)) {
    const [group] = parsed.hooks[event];
    assert.equal(group.hooks.length, 1);
    const row = group.hooks[0];
    assert.equal(row.timeout, 2);
    assert.equal(row.type, "command");
    assert.equal(row.command, `${system}\\cmd.exe /D /V:OFF /C CALL "${helper}" hook A "${root}" ${event}`);
  }
  for (const unsafe of [`${root}\\..\\other`, `${root}&other`, `${root}'x`, `${root}%TMP%`, "relative"]) {
    assert.throws(() => hookConfig(helper, "A", unsafe, system), /Unsupported Windows hook path/);
  }
  assert.throws(() => hookConfig("C:\\Windows\\System32\\cmd.exe", "A", root, system), /Unsupported Windows hook command/);
  assert.throws(() => hookConfig(helper, "B", root, system), /Unsupported Windows hook location/);
  assert.equal(reviewCommand("C:\\Program Files\\codex.exe", "C:\\O'Brien's demo"),
    "& 'C:\\Program Files\\codex.exe' --cd 'C:\\O''Brien''s demo'");
});

test("validates fresh activity and diagnostics separately", () => {
  const probe = { workspace: "A", sentAt: 1000, kind: "probe", challenge: "b".repeat(32) };
  assert.deepEqual(readDiagnostic(probe, 1000), probe);
  assert.equal(readDiagnostic(probe, 11_001), null);
  assert.equal(readObservation(probe, 1000), null);
  assert.equal(readDiagnostic({ ...probe, raw: "private" }, 1000), null);
  const activity = makeEvent("PreToolUse", 1000);
  assert.deepEqual(readObservation(activity, 1000), activity);
  assert.equal(readObservation(activity, 11_001), null);
  assert.equal(readObservation({ ...activity, tool: null }, 1000), null);
  assert.equal(readObservation({ ...activity, raw: "private" }, 1000), null);
});

async function exchange(port: number, key: Buffer, workspace: HookWorkspace, payload: string, replay?: Buffer) {
  const socket = connect({ port, host: "127.0.0.1" });
  socket.on("error", () => {}); // Closing an unauthenticated peer may reset the test socket.
  socket.setTimeout(1500, () => socket.destroy());
  let data = Buffer.alloc(0);
  let recorded: Buffer | undefined;
  let stage = 0;
  let hello: Buffer;
  return new Promise<{ ack: number; recorded?: Buffer }>((resolve) => {
    socket.on("close", () => resolve({ ack: stage === 2 ? data[0] ?? -1 : -1, recorded }));
    socket.on("data", (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      if (stage === 0 && data.length >= 16) {
        const client = Buffer.concat([Buffer.from(workspace), randomBytes(16)]);
        hello = Buffer.concat([data.subarray(0, 16), client]);
        data = data.subarray(16);
        stage = 1;
        socket.write(client);
      }
      if (stage === 1 && data.length >= 32) {
        if (!timingSafeEqual(data.subarray(0, 32), hookProof(key, "server", hello))) { socket.destroy(); return; }
        data = data.subarray(32);
        stage = 2;
        const body = Buffer.from(payload);
        const header = Buffer.alloc(2);
        header.writeUInt16BE(body.length);
        const frame = Buffer.concat([header, body]);
        recorded = Buffer.concat([frame, hookProof(key, "frame", hello, frame)]);
        socket.write(replay ?? recorded);
      }
    });
  });
}

test("authenticated delivery is bounded, acknowledged, scoped, and resists replay and stale keys", { timeout: 5000 }, async () => {
  const keys = { A: randomBytes(32), B: randomBytes(32) };
  const timeline = new HookTimeline();
  const accept = (workspace: HookWorkspace, raw: unknown) => {
    const now = Date.now();
    const event = readObservation(raw, now);
    return event?.workspace === workspace && timeline.observe(event, now);
  };
  const listener = await listenForHooks(keys, accept, () => assert.fail("unexpected server error"));
  const event = makeEvent("PreToolUse", Date.now());
  const payload = JSON.stringify(event);
  try {
    const [a, b] = await Promise.all([
      exchange(listener.port, keys.A, "A", payload),
      exchange(listener.port, keys.B, "B", JSON.stringify(makeEvent("PreModelRequest", Date.now(), "", "B"))),
    ]);
    assert.equal(a.ack, 1);
    assert.equal(b.ack, 1);
    assert.deepEqual(timeline.states(Date.now()).map(({ workspace }) => workspace).sort(), ["A", "B"]);
    assert.equal((await exchange(listener.port, keys.A, "A", payload, a.recorded)).ack, -1);
    assert.equal((await exchange(listener.port, keys.A, "A", payload)).ack, 0, "same event ID is rejected even on a different connection");
    assert.equal((await exchange(listener.port, keys.B, "A", payload)).ack, -1);
    assert.equal((await exchange(listener.port, keys.B, "B", payload)).ack, 0, "a scoped key cannot publish another workspace's event");
    assert.equal((await exchange(listener.port, keys.A, "A", "{")).ack, 0);
    assert.equal((await exchange(listener.port, keys.A, "A", " ".repeat(1025))).ack, -1);
    assert.equal((await exchange(listener.port, keys.A, "A", JSON.stringify({ ...event, sentAt: Date.now() - 11_000 }))).ack, 0);
  } finally { await listener.close(); }
  const replacement = await listenForHooks({ A: randomBytes(32), B: randomBytes(32) }, accept, () => {});
  try {
    assert.equal((await exchange(listener.port, keys.A, "A", payload)).ack, -1);
    assert.equal((await exchange(replacement.port, keys.A, "A", payload)).ack, -1);
  } finally { await replacement.close(); }
});

test("workspace reducer handles concurrent tools, missing starts, duplicates and terminal evidence", () => {
  const timeline = new HookTimeline();
  const a = makeEvent("PreToolUse", 1000);
  const b = makeEvent("PreToolUse", 1001, "other", "B");
  assert.equal(timeline.observe(a, 1001), true);
  assert.equal(timeline.observe(a, 1001), false);
  timeline.observe(b, 1001);
  const second = makeEvent("PreToolUse", 1002, "", "A", "other-conversation");
  timeline.observe(second, 1002);
  timeline.observe(makeEvent("PostToolUse", 1200, "tool-late"), 1200);
  assert.equal(timeline.observe(makeEvent("PreToolUse", 1100, "tool-late"), 1201), false);
  timeline.observe(makeEvent("PostToolUse", 1202), 1202);
  assert.equal(timeline.state("A", a.session, 1210), "unknown");
  assert.equal(timeline.state("A", second.session, 1210), "working");
  assert.equal(timeline.state("B", b.session, 1210), "working");
  timeline.observe(makeEvent("Interrupt", 1250), 1250);
  assert.equal(timeline.state("A", a.session, 1250), "interrupted");
  assert.equal(timeline.observe(makeEvent("PreToolUse", 1240, "late"), 1251), false);
  assert.equal(timeline.state("B", b.session, 17_000), "stale");
  timeline.observe(makeEvent("Stop", 20_000, "", "A", "session", "next-turn"), 20_000);
  assert.equal(timeline.observe(makeEvent("PreToolUse", 21_000), 21_000), false);
});

test("termination goes stale and explicit recovery accepts new session evidence", () => {
  const timeline = new HookTimeline();
  const start = makeEvent("PreToolUse", 1000);
  timeline.observe(start, 1000);
  assert.equal(timeline.state("A", start.session, 16_000), "stale");
  timeline.observe(makeEvent("SessionEnd", 17_000), 17_000);
  assert.equal(timeline.state("A", start.session, 18_000), "disconnected");
  assert.equal(timeline.observe(makeEvent("PreToolUse", 17_500), 18_000), false);
  timeline.observe(makeEvent("SessionStart", 18_100), 18_100);
  assert.equal(timeline.state("A", start.session, 18_100), "unknown");
  timeline.observe(makeEvent("PreToolUse", 18_101), 18_101);
  assert.equal(timeline.state("A", start.session, 18_101), "working");
  timeline.observe(makeEvent("Stop", 18_102), 18_102);
  assert.equal(timeline.state("A", start.session, 18_102), "unknown");
});

test("model-only work expires, and Stop permits a continued turn", () => {
  const timeline = new HookTimeline();
  const before = makeEvent("PreModelRequest", 1000);
  timeline.observe(before, 1000);
  assert.equal(timeline.aggregate(1000), "working");
  timeline.observe(makeEvent("PostModelRequest", 1200), 1200);
  assert.equal(timeline.aggregate(1200), "unknown");
  assert.equal(timeline.observe(makeEvent("PreModelRequest", 1100), 1300), false);
  timeline.observe(makeEvent("Stop", 1300), 1300);
  assert.equal(timeline.observe(makeEvent("PreModelRequest", 1400), 1400), true);
  assert.equal(timeline.aggregate(1400), "working");
  assert.equal(timeline.aggregate(16_400), "stale");
});
