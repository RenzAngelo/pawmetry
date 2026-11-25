import { spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { win32 } from "node:path";

export function reviewCommand(executable: string, workspace: string) {
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  return `& ${quote(executable)} --cd ${quote(workspace)}`;
}

export async function openInCode(workspace: string) {
  if (process.platform !== "win32") return false;
  for (const candidate of [
    process.env.LOCALAPPDATA ? win32.join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe") : null,
    process.env.ProgramFiles ? win32.join(process.env.ProgramFiles, "Microsoft VS Code", "Code.exe") : null,
  ]) {
    if (!candidate || !/^[a-z]:[\\/]/i.test(candidate)) continue;
    try {
      if (!(await lstat(candidate)).isFile() || (await realpath(candidate)).toLowerCase() !== candidate.toLowerCase()) continue;
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.VSCODE_IPC_HOOK_CLI;
      const child = spawn(candidate, ["--new-window", workspace], { detached: true, stdio: "ignore", env });
      return await new Promise<boolean>((resolve) => {
        child.once("error", () => resolve(false));
        child.once("spawn", () => { child.unref(); resolve(true); });
      });
    } catch { /* Try the next conventional installation. */ }
  }
  return false;
}
