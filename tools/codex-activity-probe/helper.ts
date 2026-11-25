import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function childEnv() {
  return { SystemRoot: process.env.SystemRoot };
}

export function invokeHelper(path: string, args: string[], cwd: string) {
  return new Promise<number | null>((resolve) => {
    const child = spawn(path, args, { cwd, env: childEnv(), stdio: "ignore", windowsHide: true, timeout: 1500 });
    child.once("error", () => resolve(null));
    child.once("close", resolve);
  });
}

export async function installHelper(root: string, packaged: boolean, created: (path: string) => void, lost: () => void) {
  const source = fileURLToPath(new URL(packaged ? "./" : "../../.cache/activity-helper/", import.meta.url));
  const original = join(source, "PawmetryActivity.exe");
  const manifest = join(source, "PawmetryActivity.sha256");
  const [exe, checksum] = await Promise.all([lstat(original), lstat(manifest)]);
  if (!exe.isFile() || exe.isSymbolicLink() || exe.nlink !== 1 || exe.size > 16 * 1024 * 1024
    || !checksum.isFile() || checksum.isSymbolicLink() || checksum.size !== 65) throw new Error("Invalid native helper files");
  const [contents, reference] = await Promise.all([readFile(original), readFile(manifest, "ascii")]);
  const hash = createHash("sha256").update(contents).digest("hex");
  if (reference !== hash + "\n") throw new Error("Native activity helper integrity check failed");
  const path = join(root, `PawmetryActivity-${hash}.exe`);
  await writeFile(path, contents, { flag: "wx" });
  created(path);
  const child: ChildProcessWithoutNullStreams = spawn(path, ["guard", hash], {
    cwd: root, env: childEnv(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  let stopped = false;
  const closed = new Promise<void>((resolve) => child.once("close", () => {
    resolve();
    if (!stopped) lost();
  }));
  child.stdin.on("error", () => {});
  child.stderr.resume(); // The helper never intentionally prints private data.
  async function close() {
    if (stopped) return closed;
    stopped = true;
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 1000);
    await closed;
    clearTimeout(timer);
  }
  try {
    const identity = await new Promise<"standard" | "restricted">((resolve, reject) => {
      const failure = () => {
        clearTimeout(timer);
        reject(new Error("Native helper could not lock its verified image"));
      };
      const timer = setTimeout(failure, 1500);
      child.once("error", failure);
      child.once("close", failure);
      let output = "";
      const read = (chunk: Buffer) => {
        output += chunk.toString("ascii");
        if (output.length > 12) { failure(); return; }
        if (!output.endsWith("\n")) return;
        child.stdout.off("data", read);
        child.stdout.resume();
        clearTimeout(timer);
        const value = output.trim();
        if (value === "standard" || value === "restricted") resolve(value);
        else failure();
      };
      child.stdout.on("data", read);
    });
    return { path, hash, identity, close };
  } catch (error) {
    await close();
    throw error;
  }
}
