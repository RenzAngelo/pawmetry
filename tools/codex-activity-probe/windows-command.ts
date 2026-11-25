import { win32 } from "node:path";
import { hookEvents, type HookName, type HookWorkspace } from "./protocol.ts";

// The fixed command must survive both of Codex's supported Windows shells.
// Reject paths containing shell metacharacters instead of interpolating escaping rules.
const literal = (path: string) => {
  if (!/^[a-z]:\\/i.test(path) || win32.normalize(path) !== path || /['"%$\x60!&|<>^();:\u0000-\u001f]/.test(path.slice(2))) {
    throw new Error("Unsupported Windows hook path");
  }
  return `"${path}"`;
};

export function hookCommand(executable: string, workspace: HookWorkspace, event: HookName, root: string, system: string) {
  const shell = win32.join(system, "cmd.exe");
  const parent = win32.dirname(root);
  if (!/^[a-z]:\\[\w.\\-]+$/i.test(shell)
    || !/^PawmetryActivity-[a-f0-9]{64}\.exe$/.test(win32.basename(executable))
    || !["A", "B"].includes(workspace) || !Object.hasOwn(hookEvents, event)) throw new Error("Unsupported Windows hook command");
  const path = literal(root);
  if (win32.dirname(executable) !== parent || win32.basename(root) !== `workspace-${workspace.toLowerCase()}`
    || !/^Pawmetry-activity-[a-f0-9]{32}$/.test(win32.basename(parent))) throw new Error("Unsupported Windows hook location");
  // CALL avoids cmd.exe stripping the first and last quotes from a /C payload.
  // Environment expansion and shell metacharacters were rejected above.
  return `${shell} /D /V:OFF /C CALL ${literal(executable)} hook ${workspace} ${path} ${event}`;
}
