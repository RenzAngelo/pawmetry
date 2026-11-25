import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { acceptObservation, maxHookBytes, projectHook } from "../tools/codex-activity-probe/protocol.ts";

const token = "a".repeat(64);
const input = { hook_event_name: "PreToolUse", session_id: "session-raw", transcript_path: "path-canary",
  tool_input: { command: "input-canary" }, cwd: "workspace-canary", prompt: "prompt-canary" };
const script = fileURLToPath(new URL("../tools/codex-activity-probe/hook.ts", import.meta.url));

async function invoke(payload: string, port: number) {
  const child = spawn(process.execPath, [script, String(port), token], { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  child.stdin.on("error", () => {}); // An oversized message can be rejected before all bytes are sent.
  child.stdin.end(payload);
  const [code] = await once(child, "close");
  assert.equal(code, 0);
  assert.equal(output, "");
}

test("projects only the tool-start event and a run-scoped pseudonym", () => {
  const event = projectHook(input, token);
  assert.deepEqual(Object.keys(event!), ["provider", "event", "session"]);
  assert.doesNotMatch(JSON.stringify(event), /canary|session-raw/);
  assert.notEqual(projectHook(input, "b".repeat(64))?.session, event?.session);
  assert.equal(projectHook({ ...input, hook_event_name: "Stop" }, token), null);
  assert.equal(projectHook({ ...input, session_id: "" }, token), null);
  assert.equal(acceptObservation(Buffer.from(JSON.stringify({ ...event, token: "wrong" })), token), null);
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
    const event = acceptObservation(raw, token);
    if (event) observations.push(event.session);
  });
  await Promise.all([
    invoke(JSON.stringify(input), port),
    invoke(JSON.stringify({ ...input, session_id: "session-raw-2" }), port),
    invoke("{malformed", port),
    invoke("x".repeat(maxHookBytes + 1), port),
  ]);
  assert.equal(observations.length, 2);
  assert.equal(new Set(observations).size, 2);
});
