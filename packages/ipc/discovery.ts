import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEndpoint, type Endpoint } from "./protocol.ts";

type Action = "publish" | "read" | "clear";

export async function windowsEndpoint(action: Action, endpoint?: Endpoint, testNamespace?: string): Promise<Endpoint | null> {
  const system = process.env.SystemRoot;
  if (process.platform !== "win32" || !system || !/^[A-Za-z]:[\\/]/.test(system)) {
    throw new Error("Windows IPC discovery unavailable");
  }
  const executable = join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const args = ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./windows-endpoint.ps1", import.meta.url)),
    "-Action", action];
  if (testNamespace !== undefined) args.push("-TestNamespace", testNamespace);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => child.kill(), 4500);
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (text.length + chunk.length > 256) child.kill();
      else text += chunk;
    });
    child.stdin.on("error", () => {});
    child.on("error", () => reject(new Error("Windows IPC discovery failed")));
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error("Windows IPC discovery failed")); return; }
      if (!text || action !== "read") { resolve(null); return; }
      try {
        const value = readEndpoint(JSON.parse(text));
        if (value) { resolve(value); return; }
      } catch { /* Close on malformed descriptors. */ }
      reject(new Error("Windows IPC descriptor invalid"));
    });
    child.stdin.end(endpoint ? JSON.stringify(endpoint) + "\n" : undefined);
  });
}
