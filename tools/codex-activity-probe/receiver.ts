import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { lstat, mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { acceptDiagnostic, acceptObservation, hookEvents, type HookName } from "./protocol.ts";
import { HookTimeline } from "./timeline.ts";
import { privateActivityRoot } from "../../packages/ipc/discovery.ts";
import { hookInvocation } from "./windows-command.ts";

const labels = ["A", "B"] as const;
export function hookConfig(executable: string, port: number, key: string, label: "A" | "B", electron: boolean, root: string) {
  return JSON.stringify({
    hooks: Object.fromEntries(Object.keys(hookEvents).map((name) => [name, [{
      ...(name === "SessionStart" ? { matcher: "startup|resume|fork" } : {}),
      hooks: [{ type: "command", command: hookInvocation(executable, port, key, label, name as HookName, electron, root).command,
        timeout: 3, statusMessage: "Pawmetry activity metadata" }],
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
  const latest = new Map<"A" | "B", { at: number; event: string }>();
  const seen = new Set<"A" | "B">();
  const rejected = new Map<"A" | "B", "unsupported-input" | "wrong-workspace">();
  const probes = new Map<string, { label: "A" | "B"; arrived: boolean }>();
  let active = false;
  let closing: Promise<boolean> | undefined;
  const directory = async (path: string) => {
    const info = await lstat(path);
    return info.isDirectory() && !info.isSymbolicLink();
  };
  const configuration = async (file: string, expected: string) => {
    try {
      if (!await directory(root) || !await directory(dirname(dirname(file))) || !await directory(dirname(file))) return "changed";
      const info = await lstat(file);
      return info.isFile() && !info.isSymbolicLink() && info.size === Buffer.byteLength(expected)
        && await readFile(file, "utf8") === expected ? "present" : "changed";
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unavailable";
    }
  };
  const close = () => closing ??= (async () => {
    if (active) await new Promise<void>((resolve) => socket.close(() => resolve()));
    active = false;
    let clean = true;
    // Remove only unchanged files produced for this run. Leave workspace content alone.
    for (const [file, expected] of created) {
      try {
        const check = await configuration(file, expected);
        if (check === "present") await unlink(file);
        else if (check !== "missing") clean = false;
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
      if (closing || remote.address !== "127.0.0.1") return;
      const now = Date.now();
      const diagnostic = acceptDiagnostic(message, keys, now);
      if (diagnostic) {
        if (diagnostic.kind === "probe") {
          const probe = probes.get(diagnostic.challenge);
          if (probe?.label === diagnostic.workspace) probe.arrived = true;
        } else if (!paused && diagnostic.sentAt >= resumedAt) {
          rejected.set(diagnostic.workspace, diagnostic.kind);
          onChange();
        }
        return;
      }
      if (paused) return;
      const observed = acceptObservation(message, keys, now);
      if (observed && observed.sentAt >= resumedAt && timeline.observe(observed, now)) {
        rejected.delete(observed.workspace);
        latest.set(observed.workspace, { at: now, event: observed.event });
        seen.add(observed.workspace);
        onChange();
      }
    });
    const port = socket.address().port;
    for (const label of labels) {
      const config = hookConfig(process.execPath, port, keys[label], label, electron, paths[label]);
      const folder = join(paths[label], ".codex");
      await mkdir(folder, { recursive: true });
      const file = join(folder, "hooks.json");
      await writeFile(file, config, { flag: "wx" });
      created.set(file, config);
    }
    return { paths, close, states: (now = Date.now()) => timeline.states(now), aggregate: (now = Date.now()) => timeline.aggregate(now),
      async checkConfigurations() {
        return Object.fromEntries(await Promise.all(labels.map(async (label) => {
          const file = join(paths[label], ".codex", "hooks.json");
          return [label, await configuration(file, created.get(file)!)];
        })));
      },
      async probe() {
        return Object.fromEntries(await Promise.all(labels.map(async (label) => {
          if (!active || closing) return [label, "receiver-unavailable"];
          const file = join(paths[label], ".codex", "hooks.json");
          if (await configuration(file, created.get(file)!) !== "present") return [label, "invalid-configuration"];
          const challenge = randomBytes(16).toString("hex");
          const state = { label, arrived: false };
          probes.set(challenge, state);
          try {
            const { shell, args } = hookInvocation(process.execPath, port, keys[label], label, "PreModelRequest", electron, paths[label], challenge);
            const child = spawn(shell, args, { cwd: paths[label], windowsHide: true, stdio: ["pipe", "ignore", "ignore"], timeout: 4000 });
            const code = await new Promise<number | null>((resolve) => {
              child.once("error", () => resolve(null));
              child.once("close", resolve);
              child.stdin.on("error", () => {});
              child.stdin.end(JSON.stringify({ hook_event_name: "PreModelRequest", session_id: "probe", turn_id: "probe" }));
            });
            if (!state.arrived && code === 0) await wait(200);
            return [label, state.arrived ? "passed" : !active || closing ? "receiver-unavailable" : code === 0 ? "no-delivery" : "launch-failed"];
          } finally { probes.delete(challenge); }
        })));
      },
      diagnostics(now = Date.now()) {
        const states = timeline.states(now);
        return labels.map((label) => ({ label, path: paths[label], seen: seen.has(label), last: latest.get(label) ?? null,
          rejected: rejected.get(label) ?? null,
          states: states.filter((entry) => entry.workspace === label).map((entry) => entry.state) }));
      },
      setPaused(value: boolean) {
        if (paused === value) return;
        paused = value;
        if (paused) { timeline = new HookTimeline(); latest.clear(); rejected.clear(); }
        else resumedAt = Date.now();
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
