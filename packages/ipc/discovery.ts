import { spawn } from "node:child_process";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nonce, readEndpoint, type Endpoint } from "./protocol.ts";

type Action = "publish" | "read" | "clear";

export async function windowsEndpoint(action: Action, endpoint?: Endpoint, testNamespace?: string,
  expected?: Endpoint | null): Promise<Endpoint | null> {
  const input = endpoint ? JSON.stringify(endpoint) + "\n" + (action === "publish" ? JSON.stringify(expected ?? null) + "\n" : "") : undefined;
  const text = await windowsDiscovery(action, testNamespace, input);
  if (!text || action !== "read") return null;
  let value: Endpoint | null = null;
  try { value = readEndpoint(JSON.parse(text)); } catch { /* Close on malformed descriptors. */ }
  if (!value) throw new Error("Windows IPC descriptor invalid");
  return value;
}

export async function privateActivityRoot(): Promise<string> {
  const run = nonce().slice(0, 32);
  const text = await windowsDiscovery("activity", run);
  const path = Buffer.from(text, "base64").toString("utf8");
  if (!isAbsolute(path) || basename(path) !== `Pawmetry-activity-${run}`) throw new Error("Private activity storage unavailable");
  return path;
}

async function windowsDiscovery(action: Action | "activity", namespace?: string, input?: string): Promise<string> {
  const system = process.env.SystemRoot;
  if (process.platform !== "win32" || !system || !/^[A-Za-z]:[\\/]/.test(system)) {
    throw new Error("Windows IPC discovery unavailable");
  }
  const executable = join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const args = ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./windows-endpoint.ps1", import.meta.url)),
    "-Action", action];
  if (namespace !== undefined) args.push("-TestNamespace", namespace);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => child.kill(), 4500);
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (text.length + chunk.length > (action === "activity" ? 2048 : 256)) child.kill();
      else text += chunk;
    });
    child.stdin.on("error", () => {});
    child.on("error", () => reject(new Error("Windows IPC discovery failed")));
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error("Windows IPC discovery failed")); return; }
      resolve(text);
    });
    child.stdin.end(input);
  });
}
