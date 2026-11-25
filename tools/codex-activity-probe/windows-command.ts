import { join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import type { HookName } from "./protocol.ts";

// The same literal command must parse under native Windows PowerShell and cmd.exe.
const literal = (path: string) => {
  if (!/^[a-z]:[\\/]/i.test(path) || /["%$`!\u0000-\u001f]/.test(path)) throw new Error("Unsupported hook path");
  return `"${path}"`;
};

export function hookInvocation(executable: string, port: number, key: string, workspace: "A" | "B", event: HookName,
  electron: boolean, root: string, probe?: string) {
  const system = process.env.SystemRoot ?? "C:\\Windows";
  const shell = win32.join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  // A quoted executable is an expression in PowerShell and is not invoked.
  if (!/^[a-z]:[\\/][\w.\\:/-]+$/i.test(shell)) throw new Error("Unsupported Windows system path");
  const launcher = fileURLToPath(new URL("./windows-hook.ps1", import.meta.url));
  const helper = fileURLToPath(new URL("./hook.ts", import.meta.url));
  const args = ["-NoProfile", "-NonInteractive", "-File", launcher, executable, helper,
    electron ? "electron" : "node", String(port), key, workspace, event, root, ...(probe ? [probe] : [])];
  const command = [shell, ...args.map((arg, i) => [3, 4, 5, 11].includes(i) ? literal(arg) : arg)].join(" ");
  return { shell, args, command };
}

export function withinWorkspace(root: string, cwd: string) {
  const pathApi = process.platform === "win32" ? win32 : null;
  const comparable = (path: string) => pathApi ? pathApi.resolve(path).toLowerCase() : path;
  const expected = comparable(root);
  const actual = comparable(cwd);
  return actual === expected || actual.startsWith(join(expected, "_").slice(0, -1));
}
