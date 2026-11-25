import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { windowsEndpoint } from "../packages/ipc/discovery.ts";
import { nonce, type Operation, type Status } from "../packages/ipc/protocol.ts";
import { listenStatus } from "../packages/ipc/transport.ts";

const namespace = nonce().slice(0, 32);
const calls: Operation[] = [];
const status: Status = { mode: "live", quota: "fresh", activity: "unknown", validUntil: Date.now() + 90_000,
  energy: { remaining: 58, resetAt: null }, stamina: { remaining: 73, resetAt: null } };

async function host() {
  const system = process.env.SystemRoot;
  assert.ok(system);
  const ps = join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = fileURLToPath(new URL("./test-vscode.ps1", import.meta.url));
  const vsix = process.argv[2];
  const child = spawn(ps, ["-NoProfile", "-NonInteractive", "-File", script, ...(vsix ? ["-Vsix", vsix] : [])], {
    env: { ...process.env, PAWMETRY_IPC_TEST_NAMESPACE: namespace }, stdio: ["ignore", "inherit", "inherit"], windowsHide: true,
  });
  const [code] = await once(child, "close");
  assert.equal(code, 0, "Isolated VS Code IPC test failed");
}

const server = await listenStatus((op) => { calls.push(op); return status; });
try {
  await windowsEndpoint("publish", server.endpoint, namespace);
  const hosts = await Promise.allSettled([host(), host()]);
  for (const result of hosts) {
    if (result.status === "rejected") throw result.reason;
  }
  for (const op of ["refresh", "pause-monitoring", "resume-monitoring"] as const) {
    assert.equal(calls.filter((call) => call === op).length, 2);
  }
  console.log("Two isolated VS Code extension hosts received the same authenticated quota.");
} finally {
  await server.close();
  await windowsEndpoint("clear", server.endpoint, namespace);
}
