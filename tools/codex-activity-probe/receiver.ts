import { randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import { lstat, mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptObservation, hookEvents } from "./protocol.ts";
import { HookTimeline } from "./timeline.ts";
import { privateActivityRoot } from "../../packages/ipc/discovery.ts";

const labels = ["A", "B"] as const;
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

export function hookConfig(executable: string, port: number, key: string, label: "A" | "B", electron: boolean) {
  const script = fileURLToPath(new URL("./hook.ts", import.meta.url));
  const prefix = electron ? "$env:ELECTRON_RUN_AS_NODE='1'; " : "";
  // PowerShell otherwise returns before the Windows GUI executable closes its stdout.
  const suffix = electron ? " | Write-Output" : "";
  return JSON.stringify({
    hooks: Object.fromEntries(Object.keys(hookEvents).map((name) => [name, [{
      ...(name === "SessionStart" ? { matcher: "startup|resume|fork" } : {}),
      hooks: [{ type: "command", command: `${prefix}& ${quote(executable)} ${quote(script)} ${port} '${key}' ${label} ${name}${suffix}`, timeout: 2 }],
    }]])),
  }, null, 2);
}

export async function prepareReceiver({ electron = false, onChange = () => {}, onError = () => {} } = {}) {
  const root = await privateActivityRoot();
  const paths = { A: join(root, "workspace-a"), B: join(root, "workspace-b") };
  const keys = { A: randomBytes(32).toString("hex"), B: randomBytes(32).toString("hex") };
  const socket = createSocket("udp4");
  let timeline = new HookTimeline();
  let paused = false;
  let resumedAt = 0;
  const created = new Map<string, string>();
  let active = false;
  let closing: Promise<boolean> | undefined;
  const close = () => closing ??= (async () => {
    if (active) await new Promise<void>((resolve) => socket.close(() => resolve()));
    let clean = true;
    const directory = async (path: string) => {
      const info = await lstat(path);
      return info.isDirectory() && !info.isSymbolicLink();
    };
    // Remove only unchanged files produced for this run. Leave workspace content alone.
    for (const [file, expected] of created) {
      try {
        const info = await lstat(file);
        if (await directory(root) && await directory(dirname(dirname(file))) && await directory(dirname(file))
          && info.isFile() && !info.isSymbolicLink() && info.size === Buffer.byteLength(expected)
          && await readFile(file, "utf8") === expected) await unlink(file);
        else clean = false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") clean = false;
      }
    }
    const folders = Object.values(paths);
    for (const folder of [...folders.map((value) => join(value, ".codex")), ...folders, root]) {
      try { if (await directory(folder)) await rmdir(folder); } catch { /* Leave nonempty workspace content in place. */ }
    }
    return clean;
  })();

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, "127.0.0.1", () => {
        socket.off("error", reject);
        active = true;
        resolve();
      });
    });
    socket.on("error", onError);
    socket.on("message", (message, remote) => {
      if (closing || paused || remote.address !== "127.0.0.1") return;
      const now = Date.now();
      const observed = acceptObservation(message, keys, now);
      if (observed && observed.sentAt >= resumedAt && timeline.observe(observed, now)) onChange();
    });
    const port = socket.address().port;
    for (const label of labels) {
      const config = hookConfig(process.execPath, port, keys[label], label, electron);
      const folder = join(paths[label], ".codex");
      await mkdir(folder, { recursive: true });
      const file = join(folder, "hooks.json");
      await writeFile(file, config, { flag: "wx" });
      created.set(file, config);
    }
    return { paths, close, states: (now = Date.now()) => timeline.states(now), aggregate: (now = Date.now()) => timeline.aggregate(now),
      setPaused(value: boolean) {
        if (paused === value) return;
        paused = value;
        if (paused) timeline = new HookTimeline();
        else resumedAt = Date.now();
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
