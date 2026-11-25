import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { arch, homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { asRecord } from "./quota.ts";

const extensionName = /^openai\.chatgpt-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)-win32-x64$/;

export type Discovery =
  | { status: "found"; executable: string; version: string }
  | { status: "missing" | "ambiguous" | "unsupported" };

async function isDirectPath(path: string): Promise<boolean> {
  if ((await lstat(path)).isSymbolicLink()) return false;
  const resolved = await realpath(path);
  return process.platform === "win32"
    ? path.toLowerCase() === resolved.toLowerCase()
    : path === resolved;
}

/** The caller supplies the known local VS Code extension directory, never the current workspace or PATH. */
export async function findBundledCodex(extensionDirectory: string): Promise<Discovery> {
  if (!isAbsolute(extensionDirectory)) return { status: "missing" };
  let entries;
  try {
    if (!await isDirectPath(extensionDirectory)) return { status: "missing" };
    entries = await readdir(extensionDirectory, { withFileTypes: true });
  } catch {
    return { status: "missing" };
  }

  const candidates: Array<{ executable: string; version: string }> = [];
  for (const entry of entries) {
    const version = extensionName.exec(entry.name)?.[1];
    if (!version || !entry.isDirectory()) continue;
    const root = join(extensionDirectory, entry.name);
    const executable = join(root, "bin", "windows-x86_64", "codex.exe");
    const manifest = join(root, "package.json");
    try {
      const info = await lstat(manifest);
      if (!info.isFile() || info.size > 1024 * 1024 || !await isDirectPath(manifest)) continue;
      const metadata = asRecord(JSON.parse(await readFile(manifest, "utf8")));
      if (metadata?.publisher !== "openai" || metadata.name !== "chatgpt" || metadata.version !== version) continue;
      if (!(await lstat(executable)).isFile() || !await isDirectPath(executable)) continue;
      candidates.push({ executable, version });
    } catch {
      // An incomplete install or update is ineligible.
    }
  }
  if (candidates.length === 1) return { status: "found", ...candidates[0] };
  return { status: candidates.length ? "ambiguous" : "missing" };
}

export async function discoverCodex(): Promise<Discovery> {
  if (process.platform !== "win32" || arch() !== "x64") return { status: "unsupported" };
  const home = homedir();
  if (!isAbsolute(home)) return { status: "missing" };
  return findBundledCodex(join(home, ".vscode", "extensions"));
}
