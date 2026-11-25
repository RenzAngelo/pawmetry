import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { acceptObservation, maxHookBytes, projectHook, sealObservation } from "../tools/codex-activity-probe/protocol.ts";
import { HookTimeline } from "../tools/codex-activity-probe/timeline.ts";

const token = "a".repeat(64);
const keys = { A: token, B: "b".repeat(64) };
const input = { hook_event_name: "PreToolUse", session_id: "session-raw", turn_id: "turn-raw", tool_use_id: "tool-raw", transcript_path: "path-canary",
  tool_input: { command: "input-canary" }, cwd: "workspace-canary", prompt: "prompt-canary" };
const script = fileURLToPath(new URL("../tools/codex-activity-probe/hook.ts", import.meta.url));

async function invoke(payload: string, port: number, name = "PreToolUse", workspace: "A" | "B" = "A") {
  const child = spawn(process.execPath, [script, String(port), keys[workspace], workspace, name], { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  child.stdin.on("error", () => {}); // An oversized message can be rejected before all bytes are sent.
  child.stdin.end(payload);
  const [code] = await once(child, "close");
  assert.equal(code, 0);
  assert.equal(output, name === "Stop" ? "{}\n" : "");
}

test("projects only the tool-start event and a run-scoped pseudonym", () => {
  const event = projectHook(input, token, "A", 1000)!;
  const packet = sealObservation(event, token);
  assert.doesNotMatch(packet.toString(), /canary|session-raw|turn-raw|tool-raw|a{64}/);
  assert.deepEqual(acceptObservation(packet, keys, 1000), event);
  assert.notEqual(projectHook(input, keys.B, "B")?.session, event.session);
  assert.equal(projectHook({ ...input, hook_event_name: "PermissionRequest" }, token, "A"), null);
  assert.equal(projectHook({ ...input, turn_id: "" }, token, "A"), null);
  assert.equal(acceptObservation(sealObservation({ ...event, workspace: "B" }, token), keys, 1000), null);
  assert.equal(acceptObservation(packet, keys, 11_001), null);
});

test("two synthetic hook processes send distinct observations over loopback", { timeout: 5000 }, async (t) => {
  const socket = createSocket("udp4");
  socket.bind(0, "127.0.0.1");
  await once(socket, "listening");
  t.after(() => socket.close());
  const port = socket.address().port;
  const observations: string[] = [];
  socket.on("message", (raw) => {
    assert.doesNotMatch(raw.toString(), /canary|session-raw/);
    const event = acceptObservation(raw, keys);
    if (event) observations.push(event.session);
  });
  await Promise.all([
    invoke(JSON.stringify(input), port),
    invoke(JSON.stringify(input), port, "PreToolUse", "B"),
    invoke("{malformed", port),
    invoke("x".repeat(maxHookBytes + 1), port),
  ]);
  assert.equal(observations.length, 2);
  assert.equal(new Set(observations).size, 2);
});

test("workspace reducer handles concurrent tools, missed starts, duplicates, and terminal evidence", () => {
  const timeline = new HookTimeline();
  const event = (name: string, at: number, tool = "tool-raw", workspace: "A" | "B" = "A") =>
    projectHook({ ...input, hook_event_name: name, tool_use_id: tool }, keys[workspace], workspace, at)!;
  const a = event("PreToolUse", 1000);
  const b = event("PreToolUse", 1001, "another", "B");
  assert.equal(timeline.observe(a, 1001), true);
  assert.equal(timeline.observe(a, 1001), false);
  timeline.observe(b, 1001);
  const second = projectHook({ ...input, session_id: "other-conversation" }, token, "A", 1002)!;
  timeline.observe(second, 1002);
  timeline.observe(event("PostToolUse", 1200, "tool-late"), 1200);
  assert.equal(timeline.observe(event("PreToolUse", 1100, "tool-late"), 1201), false);
  timeline.observe(event("PostToolUse", 1202), 1202);
  assert.equal(timeline.state("A", a.session, 1210), "unknown");
  assert.equal(timeline.state("A", second.session, 1210), "working");
  assert.equal(timeline.state("B", b.session, 1210), "working");
  timeline.observe(event("Interrupt", 1250), 1250);
  assert.equal(timeline.state("A", a.session, 1250), "interrupted");
  assert.equal(timeline.observe(event("PreToolUse", 1240, "late"), 1251), false);
  assert.equal(timeline.state("B", b.session, 17_000), "stale");
  const laterTurn = projectHook({ ...input, hook_event_name: "Stop", turn_id: "next-turn" }, token, "A", 20000)!;
  timeline.observe(laterTurn, 20000);
  assert.equal(timeline.observe(event("PreToolUse", 21000, "late-invocation"), 21000), false);
});

test("missing close events go stale and recovery requires new session evidence after confirmed disconnect", async () => {
  const timeline = new HookTimeline();
  const send = (hook_event_name: string, sentAt: number, more = {}) =>
    projectHook({ ...input, hook_event_name, ...more }, token, "A", sentAt)!;
  const start = send("PreToolUse", 1000);
  timeline.observe(start, 1000);
  assert.equal(timeline.state("A", start.session, 16000), "stale");
  timeline.observe(send("SessionEnd", 17000), 17000);
  assert.equal(timeline.state("A", start.session, 18000), "disconnected");
  assert.equal(timeline.observe(send("PreToolUse", 17500), 18000), false);
  timeline.observe(send("SessionStart", 18100, { source: "resume" }), 18100);
  assert.equal(timeline.state("A", start.session, 18100), "unknown");
  timeline.observe(send("PreToolUse", 18101), 18101);
  timeline.observe(send("Stop", 18102), 18102);
  assert.equal(timeline.state("A", start.session, 18102), "unknown");
  await invoke("{malformed", 9, "Stop");
});

test("model-only work expires, a post result is not a task outcome, and Stop permits continuation", () => {
  const timeline = new HookTimeline();
  const send = (hook_event_name: string, sentAt: number) =>
    projectHook({ ...input, hook_event_name, status: "failed", error: "model-error-canary" }, token, "A", sentAt)!;
  const before = send("PreModelRequest", 1000);
  assert.doesNotMatch(sealObservation(before, token).toString(), /canary|failed/);
  timeline.observe(before, 1000);
  assert.equal(timeline.aggregate(1000), "working");
  timeline.observe(send("PostModelRequest", 1200), 1200);
  assert.equal(timeline.aggregate(1200), "unknown");
  assert.equal(timeline.observe(send("PreModelRequest", 1100), 1300), false);
  timeline.observe(send("Stop", 1300), 1300);
  assert.equal(timeline.observe(send("PreModelRequest", 1400), 1400), true);
  assert.equal(timeline.aggregate(1400), "working");
  assert.equal(timeline.aggregate(16400), "stale");
});
